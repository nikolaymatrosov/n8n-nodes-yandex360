import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import type { IOperationContext, OperationResult } from '../types';
import { FOLDER_OPERATIONS, PARAMS } from '../types';
import {
	isOperationLink,
	getOperationId,
	waitForOperation,
} from '../GenericFunctions';

/**
 * Execute a folder operation based on the operation type
 */
export async function executeFolderOperation(
	context: IOperationContext,
	operation: string,
): Promise<OperationResult> {
	const { executeFunctions, client, itemIndex } = context;

	switch (operation) {
		case FOLDER_OPERATIONS.CREATE:
			return await executeFolderCreate(executeFunctions, client, itemIndex);
		case FOLDER_OPERATIONS.LIST:
			return await executeFolderList(executeFunctions, client, itemIndex);
		case FOLDER_OPERATIONS.DELETE:
			return await executeFolderDelete(executeFunctions, client, itemIndex);
		case FOLDER_OPERATIONS.GET_INFO:
			return await executeFolderGetInfo(executeFunctions, client, itemIndex);
		case FOLDER_OPERATIONS.PUBLISH:
			return await executeFolderPublish(executeFunctions, client, itemIndex);
		case FOLDER_OPERATIONS.UNPUBLISH:
			return await executeFolderUnpublish(executeFunctions, client, itemIndex);
		default:
			throw new NodeOperationError(
				executeFunctions.getNode(),
				`Unknown folder operation: ${operation}`,
			);
	}
}

/**
 * Create a new folder
 */
async function executeFolderCreate(
	executeFunctions: IExecuteFunctions,
	api: any,
	i: number,
): Promise<INodeExecutionData> {
	const path = executeFunctions.getNodeParameter(PARAMS.PATH, i) as string;

	try {
		const { body: result } = await api.create({ path });

		return {
			json: {
				success: true,
				path,
				href: result.href,
			},
			pairedItem: { item: i },
		};
	} catch (error) {
		if (error.status === 409) {
			throw new NodeOperationError(executeFunctions.getNode(), `Folder already exists at path: ${path}`);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to create folder at ${path}`,
			description: 'Check your OAuth credentials and path',
		});
	}
}

/**
 * List folder contents
 */
async function executeFolderList(
	executeFunctions: IExecuteFunctions,
	api: any,
	i: number,
): Promise<INodeExecutionData[]> {
	const path = executeFunctions.getNodeParameter(PARAMS.PATH, i) as string;
	const options = executeFunctions.getNodeParameter(PARAMS.OPTIONS, i, {}) as any;

	const limit = options.limit || 100;
	const offset = options.offset || 0;
	const sort = options.sort || 'name';

	try {
		const { body: result } = await api.info({
			path,
			limit,
			offset,
			sort,
		});

		// Extract items from embedded response
		const items =
			result._embedded && result._embedded.items ? result._embedded.items : [];

		return items.map((item: any) => ({
			json: item,
			pairedItem: { item: i },
		}));
	} catch (error) {
		if (error.status === 404) {
			throw new NodeOperationError(executeFunctions.getNode(), `Folder not found at path: ${path}`);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to list folder contents at ${path}`,
			description: 'Check your OAuth credentials and path',
		});
	}
}

/**
 * Delete a folder
 */
async function executeFolderDelete(
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
			throw new NodeOperationError(executeFunctions.getNode(), `Folder not found at path: ${path}`);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to delete folder at ${path}`,
			description: 'Check your OAuth credentials and path',
		});
	}
}

/**
 * Get folder metadata
 */
async function executeFolderGetInfo(
	executeFunctions: IExecuteFunctions,
	api: any,
	i: number,
): Promise<INodeExecutionData> {
	const path = executeFunctions.getNodeParameter(PARAMS.PATH, i) as string;

	try {
		const { body: folderInfo } = await api.info({ path });

		return {
			json: folderInfo,
			pairedItem: { item: i },
		};
	} catch (error) {
		if (error.status === 404) {
			throw new NodeOperationError(executeFunctions.getNode(), `Folder not found at path: ${path}`);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to get folder info for ${path}`,
			description: 'Check your OAuth credentials and path',
		});
	}
}

/**
 * Make folder publicly accessible
 */
async function executeFolderPublish(
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
			throw new NodeOperationError(executeFunctions.getNode(), `Folder not found at path: ${path}`);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to publish folder at ${path}`,
			description: 'Check your OAuth credentials and path',
		});
	}
}

/**
 * Remove public access from folder
 */
async function executeFolderUnpublish(
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
			throw new NodeOperationError(executeFunctions.getNode(), `Folder not found at path: ${path}`);
		}

		throw new NodeApiError(executeFunctions.getNode(), error as any, {
			message: `Failed to unpublish folder at ${path}`,
			description: 'Check your OAuth credentials and path',
		});
	}
}
