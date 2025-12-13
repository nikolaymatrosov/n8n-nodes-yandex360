import { sdk } from 'yd-sdk';
import type { ICredentialDataDecryptedObject } from 'n8n-workflow';
import type { IYandexDiskResource } from './types';

/**
 * Initialize Yandex Disk SDK with OAuth token
 */
export function initializeYandexDiskApi(credentials: ICredentialDataDecryptedObject) {
	const token = credentials.oauthToken as string;

	if (!token) {
		throw new Error('OAuth token not found in credentials');
	}

	return sdk({ token });
}

/**
 * Filter items by event type (created vs updated)
 */
export function filterByEventType(
	items: IYandexDiskResource[],
	event: string,
): IYandexDiskResource[] {
	if (event === 'created') {
		return items.filter((item) => {
			const created = new Date(item.created).getTime();
			const modified = new Date(item.modified).getTime();
			// If created and modified are within 1 second, consider it as created
			return Math.abs(created - modified) < 1000;
		});
	}

	if (event === 'updated') {
		return items.filter((item) => {
			const created = new Date(item.created).getTime();
			const modified = new Date(item.modified).getTime();
			// If modified is more than 1 second after creation, consider it as updated
			return modified > created + 1000;
		});
	}

	// For 'all' or unknown event types, return all items
	return items;
}

/**
 * Filter items by file type based on MIME type
 */
export function filterByFileType(
	items: IYandexDiskResource[],
	fileType: string,
): IYandexDiskResource[] {
	if (fileType === 'all') return items;

	const typeMap: Record<string, string[]> = {
		document: ['application/pdf', 'application/msword', 'application/vnd.', 'text/'],
		image: ['image/'],
		video: ['video/'],
		audio: ['audio/'],
		archive: ['application/zip', 'application/x-rar', 'application/x-tar', 'application/gzip'],
	};

	const patterns = typeMap[fileType] || [];

	return items.filter((item) => {
		const mimeType = item.mime_type || '';
		return patterns.some((pattern) => mimeType.startsWith(pattern));
	});
}

/**
 * Filter items by modification time
 */
export function filterByModifiedTime(
	items: IYandexDiskResource[],
	startDate: string,
	endDate: string,
): IYandexDiskResource[] {
	const startTime = new Date(startDate).getTime();
	const endTime = new Date(endDate).getTime();

	return items.filter((item) => {
		const modifiedTime = new Date(item.modified).getTime();
		return modifiedTime > startTime && modifiedTime <= endTime;
	});
}

/**
 * Apply limit to items array
 */
export function applyLimit(items: IYandexDiskResource[], limit: number): IYandexDiskResource[] {
	if (limit <= 0) return items;
	return items.slice(0, limit);
}
