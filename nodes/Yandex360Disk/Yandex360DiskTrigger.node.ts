import moment from 'moment-timezone';
import type {
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import {
	initializeYandexDiskApi,
	filterByEventType,
	filterByFileType,
	filterByModifiedTime,
	applyLimit,
	filterByPath,
} from './GenericFunctions';
import { EVENTS, FILE_TYPES, FILE_TYPE_TO_MEDIA_TYPE, LOCATIONS, PARAMS } from './types';
import type { IYandexDiskResource, IYandexDiskTriggerOptions } from './types';

export class Yandex360DiskTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Yandex 360 Disk Trigger',
		name: 'yandex360DiskTrigger',
		icon: 'file:disk.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when files or folders change in Yandex Disk',
		defaults: {
			name: 'Yandex 360 Disk Trigger',
		},
		polling: true,
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'yandex360OAuth2Api',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Watch For',
				name: PARAMS.EVENT,
				type: 'options',
				required: true,
				default: 'updated',
				options: [
					{
						name: 'File or Folder Created',
						value: EVENTS.CREATED,
						description: 'Trigger when a new file or folder is created',
					},
					{
						name: 'File or Folder Updated',
						value: EVENTS.UPDATED,
						description: 'Trigger when a file or folder is modified',
					},
				],
				description: 'The event to watch for',
			},
			{
				displayName: 'Watch Location',
				name: PARAMS.LOCATION,
				type: 'options',
				required: true,
				default: 'root',
				options: [
					{
						name: 'Entire Disk',
						value: LOCATIONS.ROOT,
						description: 'Monitor all files and folders in the disk',
					},
					{
						name: 'Specific Path',
						value: LOCATIONS.SPECIFIC_PATH,
						description: 'Monitor files and folders in a specific path',
					},
				],
				description: 'Whether to monitor the entire disk or a specific path',
			},
			{
				displayName: 'Path',
				name: PARAMS.PATH,
				type: 'string',
				default: '/',
				required: true,
				displayOptions: {
					show: {
						[PARAMS.LOCATION]: [LOCATIONS.SPECIFIC_PATH],
					},
				},
				placeholder: '/Documents',
				description: 'The path to monitor (e.g., /Documents or /Photos)',
			},
			{
				displayName: 'Options',
				name: PARAMS.OPTIONS,
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'File Type',
						name: PARAMS.FILE_TYPE,
						type: 'options',
						default: 'all',
						options: [
							{
								name: 'All',
								value: FILE_TYPES.ALL,
								description: 'Monitor all file types',
							},
							{
								name: 'Document',
								value: FILE_TYPES.DOCUMENT,
								description: 'Monitor documents (PDF, Word, text files, etc.)',
							},
							{
								name: 'Image',
								value: FILE_TYPES.IMAGE,
								description: 'Monitor image files',
							},
							{
								name: 'Video',
								value: FILE_TYPES.VIDEO,
								description: 'Monitor video files',
							},
							{
								name: 'Audio',
								value: FILE_TYPES.AUDIO,
								description: 'Monitor audio files',
							},
							{
								name: 'Archive',
								value: FILE_TYPES.ARCHIVE,
								description: 'Monitor archive files (ZIP, RAR, etc.)',
							},
						],
						description: 'Filter by file type',
					},
					{
						displayName: 'Limit',
						name: PARAMS.LIMIT,
						type: 'number',
						default: 50,
						typeOptions: {
							minValue: 1,
							maxValue: 1000,
						},
						description: 'Max number of recent items to fetch per poll. API maximum: 1000.',
					},
					{
						displayName: 'API Limitation Notice',
						name: 'apiLimitationNotice',
						type: 'notice',
						default: '',
						displayOptions: {
							show: {},
						},
						placeholder:
							'Important: The Yandex Disk API limits results to a maximum of 1000 items per poll. If more than 1000 files change between polls, older changes beyond the first 1000 will not be detected. Consider reducing the polling interval for high-volume scenarios.',
					},
				],
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const webhookData = this.getWorkflowStaticData('node');
		const event = this.getNodeParameter(PARAMS.EVENT, 0) as string;
		const location = this.getNodeParameter(PARAMS.LOCATION, 0) as string;
		const options = this.getNodeParameter(PARAMS.OPTIONS, 0, {}) as IYandexDiskTriggerOptions;

		try {
			// Get credentials and initialize API
			const credentials = await this.getCredentials('yandex360OAuth2Api');
			const api = initializeYandexDiskApi(credentials);

			// State management
			const now = moment().utc().format();
			const startDate = (webhookData.lastTimeChecked as string) || now;
			const endDate = now;

			let items: IYandexDiskResource[] = [];

			if (this.getMode() === 'manual') {
				// Manual mode: Return 1 item quickly for testing
				// IMPORTANT: Do NOT update state in manual mode to prevent test executions
				// from interfering with automated polling
				try {
					const response = await api.recent({ limit: 1 });
					const responseBody = response.body;

					if (responseBody && typeof responseBody === 'object' && 'items' in responseBody) {
						items = (responseBody.items as IYandexDiskResource[]) || [];
					}

					if (items.length === 0) {
						throw new NodeApiError(this.getNode(), response as any, {
							message: 'No recent files found in Yandex Disk',
							description: 'Upload some files to your Yandex Disk to test this trigger',
						});
					}

					// Return immediately without updating state
					return [this.helpers.returnJsonArray(items)];
				} catch (error) {
					if (error instanceof NodeApiError) {
						throw error;
					}
					throw new NodeApiError(this.getNode(), error as any, {
						message: 'Failed to fetch recent files from Yandex Disk',
						description: 'Check your OAuth credentials and try again',
					});
				}
			}

			// Automated mode: Fetch recent changes using api.recent()
			try {
					// Get file type option and map to API media_type
					const fileType = options.fileType || FILE_TYPES.ALL;
					const mediaType = FILE_TYPE_TO_MEDIA_TYPE[fileType];

					// Get user's limit and cap at API maximum of 1000
					const userLimit = options.limit || 50;
					const apiLimit = Math.min(userLimit, 1000);

					// Fetch recent files with API-level filtering
					const recentOptions: any = { limit: apiLimit };
					if (mediaType) {
						recentOptions.media_type = mediaType;
					}

					const response = await api.recent(recentOptions);
					const responseBody = response.body;

					if (responseBody && typeof responseBody === 'object' && 'items' in responseBody) {
						items = (responseBody.items as IYandexDiskResource[]) || [];
					}

					// Filter by modification time
					items = filterByModifiedTime(items, startDate, endDate);

					// Filter by event type (created vs updated)
					items = filterByEventType(items, event);

					// Filter by path if specific path monitoring enabled
					if (location === LOCATIONS.SPECIFIC_PATH) {
						const path = this.getNodeParameter(PARAMS.PATH, 0) as string;
						items = filterByPath(items, path);
					}

					// Apply detailed file type filter (client-side MIME matching)
					items = filterByFileType(items, fileType);

					// Apply client-side limit (already fetched with apiLimit from API)
					items = applyLimit(items, userLimit);
			} catch (error) {
				throw new NodeApiError(this.getNode(), error as any, {
					message: 'Failed to fetch recent files from Yandex Disk',
					description: 'Check your OAuth credentials and configuration',
				});
			}

			// Update state before returning (critical!)
			webhookData.lastTimeChecked = endDate;

			// Return data or null
			if (items.length > 0) {
				return [this.helpers.returnJsonArray(items)];
			}

			return null;
		} catch (error) {
			// If it's already a NodeApiError, rethrow it
			if (error instanceof NodeApiError || error instanceof NodeOperationError) {
				throw error;
			}

			// Otherwise, wrap it
			throw new NodeApiError(this.getNode(), error as any, {
				message: 'An error occurred in Yandex 360 Disk Trigger',
			});
		}
	}
}
