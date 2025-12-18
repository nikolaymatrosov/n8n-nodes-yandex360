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
	if (event === 'all') {
		return items;
	}
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

/**
 * Filter items by path (exact match or children of the path)
 * Handles paths with or without 'disk:' prefix and leading '/'
 */
export function filterByPath(
	items: IYandexDiskResource[],
	targetPath: string,
): IYandexDiskResource[] {
	if (!targetPath || targetPath === '/') return items;

	// Normalize user input path to match API format (disk:/path/to/file)
	let normalizedPath = targetPath.trim();

	// Add 'disk:' prefix if missing
	if (!normalizedPath.startsWith('disk:')) {
		// Ensure path starts with '/'
		if (!normalizedPath.startsWith('/')) {
			normalizedPath = '/' + normalizedPath;
		}
		normalizedPath = 'disk:' + normalizedPath;
	}

	// Remove trailing slash (but keep 'disk:/' for root)
	if (normalizedPath.endsWith('/') && normalizedPath !== 'disk:/') {
		normalizedPath = normalizedPath.slice(0, -1);
	}

	// If normalized path is disk:/, return all items (root path)
	if (normalizedPath === 'disk:/') {
		return items;
	}

	return items.filter((item) => {
		// Match exact path or items within the path
		return item.path === normalizedPath || item.path.startsWith(normalizedPath + '/');
	});
}

/**
 * Upload binary data to Yandex Disk
 * Handles the 2-step process: get upload URL → upload binary data
 */
export async function uploadBinaryData(
	executeFunctions: any,
	api: ReturnType<typeof sdk>,
	path: string,
	binaryData: Buffer,
	overwrite: boolean = true,
): Promise<IYandexDiskResource> {
	// Step 1: Get upload URL
	const { body: uploadLink } = await api.upload({
		path,
		overwrite,
	});

	// Step 2: Upload binary data to the URL
	await executeFunctions.helpers.httpRequest({
		method: 'PUT',
		url: uploadLink.href,
		body: binaryData,
	});

	// Step 3: Get file info after upload
	const { body: fileInfo } = await api.info({ path });
	return fileInfo as IYandexDiskResource;
}

/**
 * Download binary data from Yandex Disk
 * Handles the 2-step process: get download URL → download binary data
 */
export async function downloadBinaryData(
	executeFunctions: any,
	api: ReturnType<typeof sdk>,
	path: string,
): Promise<Buffer> {
	// Step 1: Get download URL
	const { body: downloadLink } = await api.download({ path });

	// Step 2: Download binary data from the URL
	const response = await executeFunctions.helpers.httpRequest({
		method: 'GET',
		url: downloadLink.href,
		encoding: 'arraybuffer',
		returnFullResponse: false,
	});

	return Buffer.from(response as ArrayBuffer);
}

/**
 * Check if operation returned an async operation link
 */
export function isOperationLink(result: any): boolean {
	return result && result.href && result.href.includes('/operations/');
}

/**
 * Extract operation ID from operation link
 */
export function getOperationId(result: any): string {
	if (!result || !result.href) {
		return '';
	}
	const match = result.href.match(/\/operations\/([^?]+)/);
	return match ? match[1] : '';
}

/**
 * Poll operation status until completion
 * @param api Yandex Disk API instance
 * @param operationId Operation ID to poll
 * @param timeout Maximum wait time in milliseconds (default: 30000)
 * @param interval Polling interval in milliseconds (default: 1000)
 * @returns Operation status ('success' or throws error)
 */
export async function waitForOperation(
	api: ReturnType<typeof sdk>,
	operationId: string,
	timeout: number = 30000,
	interval: number = 1000,
): Promise<string> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		const { body: operation } = await api.operation({ id: operationId });

		if (operation.status === 'success') {
			return 'success';
		}

		if (operation.status === 'failed') {
			throw new Error(`Operation failed: ${JSON.stringify(operation)}`);
		}

		// Wait before next poll
		await new Promise((resolve) => setTimeout(resolve, interval));
	}

	throw new Error(`Operation timeout after ${timeout}ms`);
}
