import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { initializeYandexDiskApi } from './GenericFunctions';
import { executeFileOperation, executeFolderOperation } from './resources';
import {
	RESOURCES,
	FILE_OPERATIONS,
	FOLDER_OPERATIONS,
	PARAMS,
} from './types';

export class Yandex360Disk implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Yandex 360 Disk',
		name: 'yandex360Disk',
		icon: 'file:disk.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Interact with Yandex 360 Disk',
		defaults: {
			name: 'Yandex 360 Disk',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'yandex360OAuth2Api',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: PARAMS.RESOURCE,
				type: 'options',
				noDataExpression: true,
				required: true,
				default: 'file',
				options: [
					{
						name: 'File',
						value: RESOURCES.FILE,
					},
					{
						name: 'Folder',
						value: RESOURCES.FOLDER,
					},
				],
			},
			// File operations
			{
				displayName: 'Operation',
				name: PARAMS.OPERATION,
				type: 'options',
				noDataExpression: true,
				required: true,
				default: 'upload',
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FILE],
					},
				},
				options: [
					{
						name: 'Upload',
						value: FILE_OPERATIONS.UPLOAD,
						description: 'Upload a file to Yandex Disk',
						action: 'Upload a file',
					},
					{
						name: 'Download',
						value: FILE_OPERATIONS.DOWNLOAD,
						description: 'Download a file from Yandex Disk',
						action: 'Download a file',
					},
					{
						name: 'Delete',
						value: FILE_OPERATIONS.DELETE,
						description: 'Delete a file',
						action: 'Delete a file',
					},
					{
						name: 'Copy',
						value: FILE_OPERATIONS.COPY,
						description: 'Copy a file to another location',
						action: 'Copy a file',
					},
					{
						name: 'Move',
						value: FILE_OPERATIONS.MOVE,
						description: 'Move a file to another location',
						action: 'Move a file',
					},
					{
						name: 'Get Info',
						value: FILE_OPERATIONS.GET_INFO,
						description: 'Get file metadata',
						action: 'Get file info',
					},
					{
						name: 'Publish',
						value: FILE_OPERATIONS.PUBLISH,
						description: 'Make file publicly accessible',
						action: 'Publish a file',
					},
					{
						name: 'Unpublish',
						value: FILE_OPERATIONS.UNPUBLISH,
						description: 'Remove public access from file',
						action: 'Unpublish a file',
					},
				],
			},
			// Folder operations
			{
				displayName: 'Operation',
				name: PARAMS.OPERATION,
				type: 'options',
				noDataExpression: true,
				required: true,
				default: 'create',
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FOLDER],
					},
				},
				options: [
					{
						name: 'Create',
						value: FOLDER_OPERATIONS.CREATE,
						description: 'Create a new folder',
						action: 'Create a folder',
					},
					{
						name: 'List',
						value: FOLDER_OPERATIONS.LIST,
						description: 'List folder contents',
						action: 'List folder contents',
					},
					{
						name: 'Delete',
						value: FOLDER_OPERATIONS.DELETE,
						description: 'Delete a folder',
						action: 'Delete a folder',
					},
					{
						name: 'Get Info',
						value: FOLDER_OPERATIONS.GET_INFO,
						description: 'Get folder metadata',
						action: 'Get folder info',
					},
					{
						name: 'Publish',
						value: FOLDER_OPERATIONS.PUBLISH,
						description: 'Make folder publicly accessible',
						action: 'Publish a folder',
					},
					{
						name: 'Unpublish',
						value: FOLDER_OPERATIONS.UNPUBLISH,
						description: 'Remove public access from folder',
						action: 'Unpublish a folder',
					},
				],
			},
			// Path parameter for most operations
			{
				displayName: 'Path on Yandex Disk',
				name: PARAMS.PATH,
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FILE],
						[PARAMS.OPERATION]: [
							FILE_OPERATIONS.DOWNLOAD,
							FILE_OPERATIONS.DELETE,
							FILE_OPERATIONS.GET_INFO,
							FILE_OPERATIONS.PUBLISH,
							FILE_OPERATIONS.UNPUBLISH,
						],
					},
				},
				placeholder: '/folder/file.pdf',
				description: 'Path to the file in Yandex Disk (must start with /)',
			},
			{
				displayName: 'Path',
				name: PARAMS.PATH,
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FOLDER],
						[PARAMS.OPERATION]: [
							FOLDER_OPERATIONS.CREATE,
							FOLDER_OPERATIONS.LIST,
							FOLDER_OPERATIONS.DELETE,
							FOLDER_OPERATIONS.GET_INFO,
							FOLDER_OPERATIONS.PUBLISH,
							FOLDER_OPERATIONS.UNPUBLISH,
						],
					},
				},
				placeholder: '/Documents/Reports',
				description: 'Path to the folder in Yandex Disk (must start with /)',
			},
			// Upload-specific parameters
			{
				displayName: 'Destination Path',
				name: PARAMS.DESTINATION_PATH,
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FILE],
						[PARAMS.OPERATION]: [FILE_OPERATIONS.UPLOAD],
					},
				},
				placeholder: '/Documents/report.pdf',
				description: 'Path where the file will be uploaded (must start with /)',
			},
			{
				displayName: 'Binary Property',
				name: PARAMS.BINARY_PROPERTY,
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FILE],
						[PARAMS.OPERATION]: [FILE_OPERATIONS.UPLOAD],
					},
				},
				description: 'Name of the binary property containing file data',
			},
			{
				displayName: 'Overwrite',
				name: PARAMS.OVERWRITE,
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FILE],
						[PARAMS.OPERATION]: [FILE_OPERATIONS.UPLOAD],
					},
				},
				description: 'Whether to overwrite existing file',
			},
			// Copy/Move parameters
			{
				displayName: 'Source Path',
				name: PARAMS.SOURCE_PATH,
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FILE],
						[PARAMS.OPERATION]: [FILE_OPERATIONS.COPY, FILE_OPERATIONS.MOVE],
					},
				},
				placeholder: '/Documents/old.pdf',
				description: 'Current path of the file',
			},
			{
				displayName: 'Destination Path',
				name: PARAMS.DESTINATION_PATH,
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FILE],
						[PARAMS.OPERATION]: [FILE_OPERATIONS.COPY, FILE_OPERATIONS.MOVE],
					},
				},
				placeholder: '/Documents/new.pdf',
				description: 'New path for the file',
			},
			{
				displayName: 'Overwrite',
				name: PARAMS.OVERWRITE,
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FILE],
						[PARAMS.OPERATION]: [FILE_OPERATIONS.COPY, FILE_OPERATIONS.MOVE],
					},
				},
				description: 'Whether to overwrite file if it exists at destination',
			},
			// Delete parameter
			{
				displayName: 'Delete Permanently',
				name: PARAMS.PERMANENTLY,
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FILE, RESOURCES.FOLDER],
						[PARAMS.OPERATION]: [FILE_OPERATIONS.DELETE, FOLDER_OPERATIONS.DELETE],
					},
				},
				description: 'Whether to delete permanently (true) or move to trash (false)',
			},
			// Wait for completion parameter
			{
				displayName: 'Wait for Completion',
				name: PARAMS.WAIT_FOR_COMPLETION,
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FILE, RESOURCES.FOLDER],
						[PARAMS.OPERATION]: [
							FILE_OPERATIONS.COPY,
							FILE_OPERATIONS.MOVE,
							FILE_OPERATIONS.DELETE,
							FOLDER_OPERATIONS.DELETE,
						],
					},
				},
				description:
					'Whether to wait for the operation to complete before continuing (some operations may be async)',
			},
			// List operation parameters
			{
				displayName: 'Options',
				name: PARAMS.OPTIONS,
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						[PARAMS.RESOURCE]: [RESOURCES.FOLDER],
						[PARAMS.OPERATION]: [FOLDER_OPERATIONS.LIST],
					},
				},
				options: [
					{
						displayName: 'Limit',
						name: PARAMS.LIMIT,
						type: 'number',
						default: 100,
						typeOptions: {
							minValue: 1,
							maxValue: 10000,
						},
						description: 'Maximum number of items to return',
					},
					{
						displayName: 'Offset',
						name: PARAMS.OFFSET,
						type: 'number',
						default: 0,
						typeOptions: {
							minValue: 0,
						},
						description: 'Number of items to skip',
					},
					{
						displayName: 'Sort',
						name: PARAMS.SORT,
						type: 'options',
						default: 'name',
						options: [
							{
								name: 'Name',
								value: 'name',
							},
							{
								name: 'Created',
								value: 'created',
							},
							{
								name: 'Modified',
								value: 'modified',
							},
							{
								name: 'Size',
								value: 'size',
							},
						],
						description: 'Sort order for results',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter(PARAMS.RESOURCE, 0) as string;
		const operation = this.getNodeParameter(PARAMS.OPERATION, 0) as string;

		try {
			// Get credentials and initialize API
			const credentials = await this.getCredentials('yandex360OAuth2Api');
			const api = initializeYandexDiskApi(credentials);

			// Process each input item
			for (let i = 0; i < items.length; i++) {
				try {
					let result: INodeExecutionData | INodeExecutionData[];

					const context = {
						executeFunctions: this,
						client: api,
						itemIndex: i,
					};

					// Route to appropriate operation handler
					if (resource === RESOURCES.FILE) {
						result = await executeFileOperation(context, operation);
					} else if (resource === RESOURCES.FOLDER) {
						result = await executeFolderOperation(context, operation);
					} else {
						throw new NodeOperationError(
							this.getNode(),
							`Unknown resource: ${resource}`,
						);
					}

					// Handle array responses (e.g., list operations)
					if (Array.isArray(result)) {
						returnData.push(...result);
					} else {
						returnData.push(result);
					}
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: error.message,
								success: false,
							},
							pairedItem: { item: i },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		} catch (error) {
			// If it's already a Node error, rethrow it
			if (error instanceof NodeApiError || error instanceof NodeOperationError) {
				throw error;
			}

			// Otherwise, wrap it
			throw new NodeApiError(this.getNode(), error as any, {
				message: 'An error occurred in Yandex 360 Disk node',
			});
		}
	}
}
