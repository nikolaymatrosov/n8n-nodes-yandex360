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
} from './GenericFunctions';
import { EVENTS, FILE_TYPES, LOCATIONS, PARAMS } from './types';
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
						displayName: 'Return All',
						name: PARAMS.RETURN_ALL,
						type: 'boolean',
						default: false,
						description: 'Whether to return all results or only up to a given limit',
					},
					{
						displayName: 'Limit',
						name: PARAMS.LIMIT,
						type: 'number',
						default: 50,
						displayOptions: {
							show: {
								[PARAMS.RETURN_ALL]: [false],
							},
						},
						typeOptions: {
							minValue: 1,
							maxValue: 1000,
						},
						description: 'Max number of results to return',
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
				try {
					const response = await api.recent({ limit: 1 });
					const responseBody = response.body;

					if (responseBody && typeof responseBody === 'object' && 'items' in responseBody) {
						items = (responseBody.items as IYandexDiskResource[]) || [];
					}

					if (items.length === 0) {
						throw new NodeApiError(this.getNode(), response as any, {
							message: 'No files found in Yandex Disk',
							description: 'Upload some files to your Yandex Disk to test this trigger',
						});
					}
				} catch (error) {
					if (error instanceof NodeApiError) {
						throw error;
					}
					throw new NodeApiError(this.getNode(), error as any, {
						message: 'Failed to fetch recent files from Yandex Disk',
						description: 'Check your OAuth credentials and try again',
					});
				}
			} else {
				// Automated mode: Fetch all changes since last check
				try {
					if (location === LOCATIONS.SPECIFIC_PATH) {
						// Monitor specific path using api.info()
						const path = this.getNodeParameter(PARAMS.PATH, 0) as string;
						const response = await api.info({
							path,
							limit: 1000,
							fields: 'name,path,type,mime_type,media_type,created,modified,size,md5,sha256,_embedded.items',
						});

						const responseBody = response.body;

						if (responseBody && typeof responseBody === 'object' && '_embedded' in responseBody) {
							const embedded = responseBody._embedded as any;
							if (embedded && 'items' in embedded) {
								items = (embedded.items as IYandexDiskResource[]) || [];
							}
						}
					} else {
						// Monitor entire disk using api.list()
						const response = await api.list({
							limit: 1000,
							fields: 'items.name,items.path,items.type,items.mime_type,items.media_type,items.created,items.modified,items.size,items.md5,items.sha256',
						});

						const responseBody = response.body;

						if (responseBody && typeof responseBody === 'object' && 'items' in responseBody) {
							items = (responseBody.items as IYandexDiskResource[]) || [];
						}
					}

					// Filter by modification time
					items = filterByModifiedTime(items, startDate, endDate);

					// Filter by event type (created vs updated)
					items = filterByEventType(items, event);

					// Apply file type filter if specified
					const fileType = options.fileType || FILE_TYPES.ALL;
					items = filterByFileType(items, fileType);

					// Apply limit if not returning all
					const returnAll = options.returnAll || false;
					if (!returnAll) {
						const limit = options.limit || 50;
						items = applyLimit(items, limit);
					}
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as any, {
						message: 'Failed to fetch files from Yandex Disk',
						description: 'Check your OAuth credentials and path configuration',
					});
				}
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
