import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

/**
 * Context passed to all operation functions
 */
export interface IOperationContext {
	executeFunctions: IExecuteFunctions;
	client: any; // yd-sdk client
	itemIndex: number;
}

/**
 * Shared return type for operations
 */
export type OperationResult = INodeExecutionData | INodeExecutionData[];

/**
 * Event types for Yandex Disk Trigger
 */
export const EVENTS = {
	CREATED: 'created',
	UPDATED: 'updated',
	DELETED: 'deleted',
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * Location modes
 */
export const LOCATIONS = {
	ROOT: 'root',
	SPECIFIC_PATH: 'specificPath',
} as const;

export type LocationMode = (typeof LOCATIONS)[keyof typeof LOCATIONS];

/**
 * File type filters
 */
export const FILE_TYPES = {
	ALL: 'all',
	DOCUMENT: 'document',
	IMAGE: 'image',
	VIDEO: 'video',
	AUDIO: 'audio',
	ARCHIVE: 'archive',
} as const;

export type FileType = (typeof FILE_TYPES)[keyof typeof FILE_TYPES];

/**
 * Resource constants for Yandex360Disk node
 */
export const RESOURCES = {
	FILE: 'file',
	FOLDER: 'folder',
} as const;

export type Resource = (typeof RESOURCES)[keyof typeof RESOURCES];

/**
 * File operation constants
 */
export const FILE_OPERATIONS = {
	UPLOAD: 'upload',
	DOWNLOAD: 'download',
	DELETE: 'delete',
	COPY: 'copy',
	MOVE: 'move',
	GET_INFO: 'getInfo',
	PUBLISH: 'publish',
	UNPUBLISH: 'unpublish',
} as const;

export type FileOperation = (typeof FILE_OPERATIONS)[keyof typeof FILE_OPERATIONS];

/**
 * Folder operation constants
 */
export const FOLDER_OPERATIONS = {
	CREATE: 'create',
	LIST: 'list',
	DELETE: 'delete',
	GET_INFO: 'getInfo',
	PUBLISH: 'publish',
	UNPUBLISH: 'unpublish',
} as const;

export type FolderOperation = (typeof FOLDER_OPERATIONS)[keyof typeof FOLDER_OPERATIONS];

/**
 * Parameter name constants
 * Used with getNodeParameter() to ensure type safety and consistency
 */
export const PARAMS = {
	// Trigger node params
	EVENT: 'event',
	LOCATION: 'location',
	PATH: 'path',
	OPTIONS: 'options',
	FILE_TYPE: 'fileType',
	RETURN_ALL: 'returnAll',
	LIMIT: 'limit',
	// Regular node params
	RESOURCE: 'resource',
	OPERATION: 'operation',
	SOURCE_PATH: 'sourcePath',
	DESTINATION_PATH: 'destinationPath',
	BINARY_PROPERTY: 'binaryProperty',
	OVERWRITE: 'overwrite',
	PERMANENTLY: 'permanently',
	WAIT_FOR_COMPLETION: 'waitForCompletion',
	FIELDS: 'fields',
	SORT: 'sort',
	OFFSET: 'offset',
} as const;

export type ParamName = (typeof PARAMS)[keyof typeof PARAMS];

/**
 * Yandex Disk resource from API
 */
export interface IYandexDiskResource extends IDataObject {
	name: string;
	path: string;
	type: 'dir' | 'file';
	mime_type?: string;
	media_type?: string;
	created: string;
	modified: string;
	size?: number;
	md5?: string;
	sha256?: string;
	[key: string]: any;
}

/**
 * Options for Yandex Disk Trigger
 */
export interface IYandexDiskTriggerOptions extends IDataObject {
	fileType?: FileType;
	returnAll?: boolean;
	limit?: number;
}
