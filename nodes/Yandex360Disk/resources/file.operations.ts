import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import type { IOperationContext, OperationResult } from '../types';
import { FILE_OPERATIONS, PARAMS, type IYandexDiskResource } from '../types';
import {
	uploadBinaryData,
	downloadBinaryData,
	isOperationLink,
	getOperationId,
	waitForOperation,
} from '../GenericFunctions';

/**
 * Execute a file operation based on the operation type
 */
export async function executeFileOperation(
	context: IOperationContext,
	operation: string,
): Promise<OperationResult> {
	const { executeFunctions, client, itemIndex } = context;

	switch (operation) {
		case FILE_OPERATIONS.UPLOAD:
			return await executeFileUpload(executeFunctions, client, itemIndex);
		case FILE_OPERATIONS.DOWNLOAD:
			return await executeFileDownload(executeFunctions, client, itemIndex);
		case FILE_OPERATIONS.DELETE:
			return await executeFileDelete(executeFunctions, client, itemIndex);
		case FILE_OPERATIONS.COPY:
			return await executeFileCopy(executeFunctions, client, itemIndex);
		case FILE_OPERATIONS.MOVE:
			return await executeFileMove(executeFunctions, client, itemIndex);
		case FILE_OPERATIONS.GET_INFO:
			return await executeFileGetInfo(executeFunctions, client, itemIndex);
		case FILE_OPERATIONS.PUBLISH:
			return await executeFilePublish(executeFunctions, client, itemIndex);
		case FILE_OPERATIONS.UNPUBLISH:
			return await executeFileUnpublish(executeFunctions, client, itemIndex);
		default:
			throw new NodeOperationError(
				executeFunctions.getNode(),
				`Unknown file operation: ${operation}`,
			);
	}
}

/**
 * Upload a file to Yandex Disk
 */
async function executeFileUpload(
	executeFunctions: IExecuteFunctions,
	api: any,
	i: number,
): Promise<INodeExecutionData> {
	const destinationPath = executeFunctions.getNodeParameter(PARAMS.DESTINATION_PATH, i) as string;
	const binaryProperty = executeFunctions.getNodeParameter(PARAMS.BINARY_PROPERTY, i) as string;
	const overwrite = executeFunctions.getNodeParameter(PARAMS.OVERWRITE, i, true) as boolean;

	try {
		// Get binary data from input
		const binaryData = await executeFunctions.helpers.getBinaryDataBuffer(i, binaryProperty);

		// Upload
		const fileInfo = await uploadBinaryData(executeFunctions, api, destinationPath, binaryData, overwrite);

		return {
			json: {
				success: true,
				...fileInfo,
			},
			pairedItem: { item: i },
		};
	} catch (error) {
		if (error.status === 409) {
			throw new NodeOperationError(
				executeFunctions.getNode(),
				`File already exists at path: ${destinationPath}. Set overwrite to true or use a different path.`,
			);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to upload file to ${destinationPath}`,
			description: 'Check your OAuth credentials and path',
		});
	}
}

/**
 * Download a file from Yandex Disk
 */
async function executeFileDownload(
	executeFunctions: IExecuteFunctions,
	api: any,
	i: number,
): Promise<INodeExecutionData> {
	const path = executeFunctions.getNodeParameter(PARAMS.PATH, i) as string;

	try {
		// Download binary data
		const buffer = await downloadBinaryData(executeFunctions, api, path);

		// Get file metadata
		const { body: fileInfo } = await api.info({ path });

		// Prepare binary data
		const binaryData = await executeFunctions.helpers.prepareBinaryData(
			buffer,
			(fileInfo as IYandexDiskResource).name || path.split('/').pop() || 'file',
			(fileInfo as IYandexDiskResource).mime_type,
		);

		return {
			json: {
				success: true,
				name: (fileInfo as IYandexDiskResource).name,
				path: (fileInfo as IYandexDiskResource).path,
				size: (fileInfo as IYandexDiskResource).size,
				mime_type: (fileInfo as IYandexDiskResource).mime_type,
			},
			binary: {
				data: binaryData,
			},
			pairedItem: { item: i },
		};
	} catch (error) {
		if (error.status === 404) {
			throw new NodeOperationError(executeFunctions.getNode(), `File not found at path: ${path}`);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to download file from ${path}`,
			description: 'Check your OAuth credentials and path',
		});
	}
}

/**
 * Delete a file
 */
async function executeFileDelete(
	executeFunctions: IExecuteFunctions,
	api: any,
	i: number,
): Promise<INodeExecutionData> {
	const path = executeFunctions.getNodeParameter(PARAMS.PATH, i) as string;
	const permanently = executeFunctions.getNodeParameter(PARAMS.PERMANENTLY, i, false) as boolean;
	const waitForCompletion = executeFunctions.getNodeParameter(
		PARAMS.WAIT_FOR_COMPLETION,
		i,
		true,
	) as boolean;

	try {
		const { body: result } = await api.remove({ path, permanently });

		// Check if operation is async
		if (isOperationLink(result)) {
			if (waitForCompletion) {
				const operationId = getOperationId(result);
				await waitForOperation(api, operationId);

				return {
					json: {
						success: true,
						status: 'completed',
						path,
						permanently,
					},
					pairedItem: { item: i },
				};
			} else {
				return {
					json: {
						success: true,
						status: 'pending',
						operationId: getOperationId(result),
						path,
						permanently,
						message: 'Operation started, check status using operation ID',
					},
					pairedItem: { item: i },
				};
			}
		}

		return {
			json: {
				success: true,
				status: 'completed',
				path,
				permanently,
			},
			pairedItem: { item: i },
		};
	} catch (error) {
		if (error.status === 404) {
			throw new NodeOperationError(executeFunctions.getNode(), `File not found at path: ${path}`);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to delete file at ${path}`,
			description: 'Check your OAuth credentials and path',
		});
	}
}

/**
 * Copy a file to another location
 */
async function executeFileCopy(
	executeFunctions: IExecuteFunctions,
	api: any,
	i: number,
): Promise<INodeExecutionData> {
	const sourcePath = executeFunctions.getNodeParameter(PARAMS.SOURCE_PATH, i) as string;
	const destinationPath = executeFunctions.getNodeParameter(PARAMS.DESTINATION_PATH, i) as string;
	const overwrite = executeFunctions.getNodeParameter(PARAMS.OVERWRITE, i, false) as boolean;
	const waitForCompletion = executeFunctions.getNodeParameter(
		PARAMS.WAIT_FOR_COMPLETION,
		i,
		true,
	) as boolean;

	try {
		const { body: result } = await api.copy({
			from: sourcePath,
			path: destinationPath,
			overwrite,
		});

		// Check if operation is async
		if (isOperationLink(result)) {
			if (waitForCompletion) {
				const operationId = getOperationId(result);
				await waitForOperation(api, operationId);

				return {
					json: {
						success: true,
						status: 'completed',
						from: sourcePath,
						to: destinationPath,
					},
					pairedItem: { item: i },
				};
			} else {
				return {
					json: {
						success: true,
						status: 'pending',
						operationId: getOperationId(result),
						from: sourcePath,
						to: destinationPath,
						message: 'Operation started, check status using operation ID',
					},
					pairedItem: { item: i },
				};
			}
		}

		return {
			json: {
				success: true,
				status: 'completed',
				from: sourcePath,
				to: destinationPath,
				href: result.href,
			},
			pairedItem: { item: i },
		};
	} catch (error) {
		if (error.status === 404) {
			throw new NodeOperationError(executeFunctions.getNode(), `File not found at path: ${sourcePath}`);
		}

		if (error.status === 409) {
			throw new NodeOperationError(
				executeFunctions.getNode(),
				`File already exists at destination: ${destinationPath}. Set overwrite to true.`,
			);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to copy file from ${sourcePath} to ${destinationPath}`,
			description: 'Check your OAuth credentials and paths',
		});
	}
}

/**
 * Move a file to another location
 */
async function executeFileMove(
	executeFunctions: IExecuteFunctions,
	api: any,
	i: number,
): Promise<INodeExecutionData> {
	const sourcePath = executeFunctions.getNodeParameter(PARAMS.SOURCE_PATH, i) as string;
	const destinationPath = executeFunctions.getNodeParameter(PARAMS.DESTINATION_PATH, i) as string;
	const overwrite = executeFunctions.getNodeParameter(PARAMS.OVERWRITE, i, false) as boolean;
	const waitForCompletion = executeFunctions.getNodeParameter(
		PARAMS.WAIT_FOR_COMPLETION,
		i,
		true,
	) as boolean;

	try {
		const { body: result } = await api.move({
			from: sourcePath,
			path: destinationPath,
			overwrite,
		});

		// Check if operation is async
		if (isOperationLink(result)) {
			if (waitForCompletion) {
				const operationId = getOperationId(result);
				await waitForOperation(api, operationId);

				return {
					json: {
						success: true,
						status: 'completed',
						from: sourcePath,
						to: destinationPath,
					},
					pairedItem: { item: i },
				};
			} else {
				return {
					json: {
						success: true,
						status: 'pending',
						operationId: getOperationId(result),
						from: sourcePath,
						to: destinationPath,
						message: 'Operation started, check status using operation ID',
					},
					pairedItem: { item: i },
				};
			}
		}

		return {
			json: {
				success: true,
				status: 'completed',
				from: sourcePath,
				to: destinationPath,
				href: result.href,
			},
			pairedItem: { item: i },
		};
	} catch (error) {
		if (error.status === 404) {
			throw new NodeOperationError(executeFunctions.getNode(), `File not found at path: ${sourcePath}`);
		}

		if (error.status === 409) {
			throw new NodeOperationError(
				executeFunctions.getNode(),
				`File already exists at destination: ${destinationPath}. Set overwrite to true.`,
			);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to move file from ${sourcePath} to ${destinationPath}`,
			description: 'Check your OAuth credentials and paths',
		});
	}
}

/**
 * Get file metadata
 */
async function executeFileGetInfo(
	executeFunctions: IExecuteFunctions,
	api: any,
	i: number,
): Promise<INodeExecutionData> {
	const path = executeFunctions.getNodeParameter(PARAMS.PATH, i) as string;

	try {
		const { body: fileInfo } = await api.info({ path });

		return {
			json: fileInfo,
			pairedItem: { item: i },
		};
	} catch (error) {
		if (error.status === 404) {
			throw new NodeOperationError(executeFunctions.getNode(), `File not found at path: ${path}`);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to get file info for ${path}`,
			description: 'Check your OAuth credentials and path',
		});
	}
}

/**
 * Make file publicly accessible
 */
async function executeFilePublish(
	executeFunctions: IExecuteFunctions,
	api: any,
	i: number,
): Promise<INodeExecutionData> {
	const path = executeFunctions.getNodeParameter(PARAMS.PATH, i) as string;

	try {
		const { body: result } = await api.publish({ path });

		return {
			json: {
				success: true,
				path,
				public_url: result.href,
				method: result.method,
			},
			pairedItem: { item: i },
		};
	} catch (error) {
		if (error.status === 404) {
			throw new NodeOperationError(executeFunctions.getNode(), `File not found at path: ${path}`);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to publish file at ${path}`,
			description: 'Check your OAuth credentials and path',
		});
	}
}

/**
 * Remove public access from file
 */
async function executeFileUnpublish(
	executeFunctions: IExecuteFunctions,
	api: any,
	i: number,
): Promise<INodeExecutionData> {
	const path = executeFunctions.getNodeParameter(PARAMS.PATH, i) as string;

	try {
		const { body: result } = await api.unpublish({ path });

		return {
			json: {
				success: true,
				path,
				href: result.href,
			},
			pairedItem: { item: i },
		};
	} catch (error) {
		if (error.status === 404) {
			throw new NodeOperationError(executeFunctions.getNode(), `File not found at path: ${path}`);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to unpublish file at ${path}`,
			description: 'Check your OAuth credentials and path',
		});
	}
}
