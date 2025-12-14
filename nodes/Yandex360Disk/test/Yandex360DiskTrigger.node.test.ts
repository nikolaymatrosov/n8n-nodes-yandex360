import { Yandex360DiskTrigger } from '../Yandex360DiskTrigger.node';
import type { IPollFunctions, ICredentialDataDecryptedObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

// Mock the yd-sdk module
jest.mock('yd-sdk', () => ({
	sdk: jest.fn(),
}));

// Import after mocking
import { sdk } from 'yd-sdk';

describe('Yandex360DiskTrigger', () => {
	let node: Yandex360DiskTrigger;
	let mockPollFunctions: Partial<IPollFunctions>;
	let mockApi: any;
	let mockStaticData: any;

	beforeEach(() => {
		jest.clearAllMocks();

		node = new Yandex360DiskTrigger();

		mockApi = {
			recent: jest.fn(),
		};

		(sdk as jest.Mock).mockReturnValue(mockApi);

		mockStaticData = {};

		mockPollFunctions = {
			getNodeParameter: jest.fn(),
			getCredentials: jest.fn().mockResolvedValue({
				oauthToken: 'test-token',
			} as ICredentialDataDecryptedObject),
			getWorkflowStaticData: jest.fn().mockReturnValue(mockStaticData),
			getMode: jest.fn().mockReturnValue('trigger'),
			getNode: jest.fn().mockReturnValue({ name: 'Test Node', type: 'yandex360DiskTrigger' }),
			helpers: {
				returnJsonArray: jest.fn((items) => items.map((json: any) => ({ json }))),
			} as any,
		};
	});

	describe('Node Definition', () => {
		it('should have correct basic properties', () => {
			expect(node.description.displayName).toBe('Yandex 360 Disk Trigger');
			expect(node.description.name).toBe('yandex360DiskTrigger');
			expect(node.description.version).toBe(1);
			expect(node.description.polling).toBe(true);
		});

		it('should be in trigger group', () => {
			expect(node.description.group).toContain('trigger');
		});

		it('should have no inputs and one output', () => {
			expect(node.description.inputs).toEqual([]);
			expect(node.description.outputs).toHaveLength(1);
		});

		it('should require yandex360OAuth2Api credentials', () => {
			expect(node.description.credentials).toHaveLength(1);
			expect(node.description.credentials?.[0].name).toBe('yandex360OAuth2Api');
			expect(node.description.credentials?.[0].required).toBe(true);
		});

		it('should have required properties', () => {
			const properties = node.description.properties;
			expect(properties).toBeDefined();
			expect(properties.length).toBeGreaterThan(0);

			// Check for event parameter
			const eventProp = properties.find((p) => p.name === 'event');
			expect(eventProp).toBeDefined();
			expect(eventProp?.type).toBe('options');

			// Check for location parameter
			const locationProp = properties.find((p) => p.name === 'location');
			expect(locationProp).toBeDefined();
			expect(locationProp?.type).toBe('options');
		});
	});

	describe('Poll Method - Manual Mode', () => {
		beforeEach(() => {
			(mockPollFunctions.getMode as jest.Mock).mockReturnValue('manual');
			(mockPollFunctions.getNodeParameter as jest.Mock).mockImplementation((paramName: string) => {
				const params: Record<string, any> = {
					event: 'updated',
					location: 'root',
					options: {},
				};
				return params[paramName];
			});
		});

		it('should return 1 item in manual mode', async () => {
			const mockItem = {
				name: 'test-file.txt',
				path: '/test-file.txt',
				type: 'file',
				created: new Date().toISOString(),
				modified: new Date().toISOString(),
			};

			mockApi.recent.mockResolvedValue({
				status: 200,
				body: {
					items: [mockItem],
				},
			});

			const result = await node.poll.call(mockPollFunctions as IPollFunctions);

			expect(result).toHaveLength(1);
			expect(result![0]).toHaveLength(1);
			expect(result![0][0].json).toMatchObject(mockItem);
			expect(mockApi.recent).toHaveBeenCalledWith({ limit: 1 });
		});

		it('should throw error when no files found in manual mode', async () => {
			mockApi.recent.mockResolvedValue({
				status: 200,
				body: {
					items: [],
				},
			});

			await expect(node.poll.call(mockPollFunctions as IPollFunctions)).rejects.toThrow(
				NodeApiError,
			);
		});

		it('should handle API errors gracefully in manual mode', async () => {
			mockApi.recent.mockRejectedValue(new Error('API Error'));

			await expect(node.poll.call(mockPollFunctions as IPollFunctions)).rejects.toThrow(
				NodeApiError,
			);
		});
	});

	describe('Poll Method - Automated Mode', () => {
		beforeEach(() => {
			(mockPollFunctions.getMode as jest.Mock).mockReturnValue('trigger');
			(mockPollFunctions.getNodeParameter as jest.Mock).mockImplementation((paramName: string) => {
				const params: Record<string, any> = {
					event: 'updated',
					location: 'root',
					options: {},
				};
				return params[paramName];
			});
		});

		it('should return items when changes are found', async () => {
			// Create timestamps that will pass the time filter
			// Set lastTimeChecked to 10 seconds ago, so items modified 1 second ago will be captured
			const recentTime = new Date(Date.now() - 1000).toISOString(); // 1 second ago
			const olderTime = new Date(Date.now() - 20000).toISOString(); // 20 seconds ago
			mockStaticData.lastTimeChecked = new Date(Date.now() - 10000).toISOString(); // 10 seconds ago

			const mockItems = [
				{
					name: 'file1.txt',
					path: '/file1.txt',
					type: 'file',
					created: olderTime,
					modified: recentTime, // Modified recently - will pass filter
					resource_id: 'resource-1',
				},
				{
					name: 'file2.pdf',
					path: '/file2.pdf',
					type: 'file',
					created: olderTime,
					modified: recentTime, // Modified recently - will pass filter
					resource_id: 'resource-2',
				},
			];

			mockApi.recent.mockResolvedValue({
				status: 200,
				body: {
					items: mockItems,
				},
			});

			const result = await node.poll.call(mockPollFunctions as IPollFunctions);

			expect(result).toHaveLength(1);
			expect(result![0].length).toBeGreaterThan(0);
			expect(mockApi.recent).toHaveBeenCalledTimes(1);
			expect(mockApi.recent).toHaveBeenCalledWith({ limit: 50 }); // Default limit
		});

		it('should return null when no changes found', async () => {
			mockApi.recent.mockResolvedValue({
				status: 200,
				body: {
					items: [],
				},
			});

			const result = await node.poll.call(mockPollFunctions as IPollFunctions);

			expect(result).toBeNull();
		});

		it('should update lastTimeChecked state', async () => {
			const recentTime = new Date(Date.now() - 1000).toISOString();
			const olderTime = new Date(Date.now() - 10000).toISOString();
			mockStaticData.lastTimeChecked = new Date(Date.now() - 10000).toISOString();

			const mockItems = [
				{
					name: 'file.txt',
					path: '/file.txt',
					type: 'file',
					created: olderTime,
					modified: recentTime,
					resource_id: 'resource-1',
				},
			];

			mockApi.recent.mockResolvedValue({
				status: 200,
				body: {
					items: mockItems,
				},
			});

			await node.poll.call(mockPollFunctions as IPollFunctions);

			expect(mockStaticData).toHaveProperty('lastTimeChecked');
			expect(typeof mockStaticData.lastTimeChecked).toBe('string');
		});

		it('should update lastTimeChecked even when no items found', async () => {
			mockApi.recent.mockResolvedValue({
				status: 200,
				body: {
					items: [],
				},
			});

			await node.poll.call(mockPollFunctions as IPollFunctions);

			expect(mockStaticData).toHaveProperty('lastTimeChecked');
			expect(typeof mockStaticData.lastTimeChecked).toBe('string');
		});
	});

	describe('Poll Method - Specific Path', () => {
		beforeEach(() => {
			(mockPollFunctions.getMode as jest.Mock).mockReturnValue('trigger');
			(mockPollFunctions.getNodeParameter as jest.Mock).mockImplementation((paramName: string) => {
				const params: Record<string, any> = {
					event: 'updated',
					location: 'specificPath',
					path: '/Documents',
					options: {},
				};
				return params[paramName];
			});
		});

		it('should filter items by specified path', async () => {
			const recentTime = new Date(Date.now() - 1000).toISOString();
			const olderTime = new Date(Date.now() - 10000).toISOString();
			mockStaticData.lastTimeChecked = new Date(Date.now() - 10000).toISOString();

			const mockItems = [
				{
					name: 'doc.txt',
					path: '/Documents/doc.txt',
					type: 'file',
					created: olderTime,
					modified: recentTime,
					resource_id: 'resource-1',
				},
				{
					name: 'other.txt',
					path: '/Other/other.txt',
					type: 'file',
					created: olderTime,
					modified: recentTime,
					resource_id: 'resource-2',
				},
			];

			mockApi.recent.mockResolvedValue({
				status: 200,
				body: {
					items: mockItems,
				},
			});

			const result = await node.poll.call(mockPollFunctions as IPollFunctions);

			// Should only return files from /Documents
			expect(result).not.toBeNull();
			if (result) {
				const returnedItems = result[0].map((item) => item.json);
				expect(returnedItems.length).toBe(1);
				expect(returnedItems[0].path).toBe('/Documents/doc.txt');
			}
		});
	});

	describe('Poll Method - Options', () => {
		it('should apply file type filter', async () => {
			const recentTime = new Date(Date.now() - 1000).toISOString();
			const olderTime = new Date(Date.now() - 20000).toISOString();
			mockStaticData.lastTimeChecked = new Date(Date.now() - 10000).toISOString();

			const mockItems = [
				{
					name: 'image.jpg',
					path: '/image.jpg',
					type: 'file',
					mime_type: 'image/jpeg',
					created: olderTime,
					modified: recentTime,
					resource_id: 'resource-1',
				},
				{
					name: 'document.pdf',
					path: '/document.pdf',
					type: 'file',
					mime_type: 'application/pdf',
					created: olderTime,
					modified: recentTime,
					resource_id: 'resource-2',
				},
			];

			(mockPollFunctions.getNodeParameter as jest.Mock).mockImplementation((paramName: string) => {
				const params: Record<string, any> = {
					event: 'updated',
					location: 'root',
					options: {
						fileType: 'image',
					},
				};
				return params[paramName];
			});

			mockApi.recent.mockResolvedValue({
				status: 200,
				body: {
					items: mockItems,
				},
			});

			const result = await node.poll.call(mockPollFunctions as IPollFunctions);

			// Should only return image file
			expect(result).not.toBeNull();
			if (result) {
				const returnedItems = result[0].map((item) => item.json);
				expect(returnedItems.every((item: any) => item.mime_type?.startsWith('image/'))).toBe(
					true,
				);
			}
			// Verify API was called with media_type filter (and default limit)
			expect(mockApi.recent).toHaveBeenCalledWith({ limit: 50, media_type: 'image' });
		});

		it('should apply limit when returnAll is false', async () => {
			const recentTime = new Date(Date.now() - 1000).toISOString();
			const olderTime = new Date(Date.now() - 20000).toISOString();
			mockStaticData.lastTimeChecked = new Date(Date.now() - 10000).toISOString();

			const mockItems = Array.from({ length: 100 }, (_, i) => ({
				name: `file${i}.txt`,
				path: `/file${i}.txt`,
				type: 'file',
				created: olderTime,
				modified: recentTime,
				resource_id: `resource-${i}`,
			}));

			(mockPollFunctions.getNodeParameter as jest.Mock).mockImplementation((paramName: string) => {
				const params: Record<string, any> = {
					event: 'updated',
					location: 'root',
					options: {
						returnAll: false,
						limit: 10,
					},
				};
				return params[paramName];
			});

			mockApi.recent.mockResolvedValue({
				status: 200,
				body: {
					items: mockItems,
				},
			});

			const result = await node.poll.call(mockPollFunctions as IPollFunctions);

			expect(result).not.toBeNull();
			if (result) {
				expect(result[0].length).toBeLessThanOrEqual(10);
			}
		});
	});

	describe('Error Handling', () => {
		beforeEach(() => {
			(mockPollFunctions.getMode as jest.Mock).mockReturnValue('trigger');
			(mockPollFunctions.getNodeParameter as jest.Mock).mockImplementation((paramName: string) => {
				const params: Record<string, any> = {
					event: 'updated',
					location: 'root',
					options: {},
				};
				return params[paramName];
			});
		});

		it('should throw NodeApiError on API failure', async () => {
			mockApi.recent.mockRejectedValue(new Error('Network error'));

			await expect(node.poll.call(mockPollFunctions as IPollFunctions)).rejects.toThrow(
				NodeApiError,
			);
		});

		it('should handle invalid credentials', async () => {
			(mockPollFunctions.getCredentials as jest.Mock).mockResolvedValue({
				oauthToken: '',
			});

			await expect(node.poll.call(mockPollFunctions as IPollFunctions)).rejects.toThrow();
		});
	});
});
