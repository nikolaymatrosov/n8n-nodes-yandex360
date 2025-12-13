import type { IDataObject } from 'n8n-workflow';

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
 * Parameter name constants
 * Used with getNodeParameter() to ensure type safety and consistency
 */
export const PARAMS = {
	EVENT: 'event',
	LOCATION: 'location',
	PATH: 'path',
	OPTIONS: 'options',
	FILE_TYPE: 'fileType',
	RETURN_ALL: 'returnAll',
	LIMIT: 'limit',
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
