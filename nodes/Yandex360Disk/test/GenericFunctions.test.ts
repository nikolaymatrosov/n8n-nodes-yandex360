import {
	filterByPath,
	filterByEventType,
	filterByFileType,
	filterByModifiedTime,
	applyLimit,
} from '../GenericFunctions';
import type { IYandexDiskResource } from '../types';

describe('GenericFunctions', () => {
	describe('filterByPath', () => {
		const mockItems: IYandexDiskResource[] = [
			{
				name: 'file1.txt',
				path: 'disk:/n8n/file1.txt',
				type: 'file',
				created: '2025-12-14T10:00:00+00:00',
				modified: '2025-12-14T10:00:00+00:00',
				resource_id: 'resource-1',
			},
			{
				name: 'file2.txt',
				path: 'disk:/n8n/subfolder/file2.txt',
				type: 'file',
				created: '2025-12-14T10:00:00+00:00',
				modified: '2025-12-14T10:00:00+00:00',
				resource_id: 'resource-2',
			},
			{
				name: 'file3.txt',
				path: 'disk:/other/file3.txt',
				type: 'file',
				created: '2025-12-14T10:00:00+00:00',
				modified: '2025-12-14T10:00:00+00:00',
				resource_id: 'resource-3',
			},
			{
				name: 'file4.txt',
				path: 'disk:/file4.txt',
				type: 'file',
				created: '2025-12-14T10:00:00+00:00',
				modified: '2025-12-14T10:00:00+00:00',
				resource_id: 'resource-4',
			},
		];

		describe('Path normalization', () => {
			it('should handle path without disk: prefix and without leading /', () => {
				const result = filterByPath(mockItems, 'n8n');
				expect(result).toHaveLength(2);
				expect(result[0].path).toBe('disk:/n8n/file1.txt');
				expect(result[1].path).toBe('disk:/n8n/subfolder/file2.txt');
			});

			it('should handle path without disk: prefix but with leading /', () => {
				const result = filterByPath(mockItems, '/n8n');
				expect(result).toHaveLength(2);
				expect(result[0].path).toBe('disk:/n8n/file1.txt');
				expect(result[1].path).toBe('disk:/n8n/subfolder/file2.txt');
			});

			it('should handle path with disk: prefix', () => {
				const result = filterByPath(mockItems, 'disk:/n8n');
				expect(result).toHaveLength(2);
				expect(result[0].path).toBe('disk:/n8n/file1.txt');
				expect(result[1].path).toBe('disk:/n8n/subfolder/file2.txt');
			});

			it('should handle path with trailing slash', () => {
				const result = filterByPath(mockItems, 'n8n/');
				expect(result).toHaveLength(2);
				expect(result[0].path).toBe('disk:/n8n/file1.txt');
				expect(result[1].path).toBe('disk:/n8n/subfolder/file2.txt');
			});

			it('should handle path with disk: prefix and trailing slash', () => {
				const result = filterByPath(mockItems, 'disk:/n8n/');
				expect(result).toHaveLength(2);
				expect(result[0].path).toBe('disk:/n8n/file1.txt');
				expect(result[1].path).toBe('disk:/n8n/subfolder/file2.txt');
			});

			it('should handle path with whitespace', () => {
				const result = filterByPath(mockItems, '  n8n  ');
				expect(result).toHaveLength(2);
				expect(result[0].path).toBe('disk:/n8n/file1.txt');
				expect(result[1].path).toBe('disk:/n8n/subfolder/file2.txt');
			});
		});

		describe('Path filtering', () => {
			it('should filter items in root path', () => {
				const result = filterByPath(mockItems, '/');
				expect(result).toHaveLength(4);
			});

			it('should filter items in specific folder', () => {
				const result = filterByPath(mockItems, 'n8n');
				expect(result).toHaveLength(2);
				expect(result.every((item) => item.path.startsWith('disk:/n8n/'))).toBe(true);
			});

			it('should filter items in nested folder', () => {
				const result = filterByPath(mockItems, 'n8n/subfolder');
				expect(result).toHaveLength(1);
				expect(result[0].path).toBe('disk:/n8n/subfolder/file2.txt');
			});

			it('should filter items in different folder', () => {
				const result = filterByPath(mockItems, 'other');
				expect(result).toHaveLength(1);
				expect(result[0].path).toBe('disk:/other/file3.txt');
			});

			it('should return empty array for non-existent path', () => {
				const result = filterByPath(mockItems, 'nonexistent');
				expect(result).toHaveLength(0);
			});

			it('should return all items for empty string', () => {
				const result = filterByPath(mockItems, '');
				expect(result).toHaveLength(4);
			});
		});

		describe('Edge cases', () => {
			it('should handle empty items array', () => {
				const result = filterByPath([], 'n8n');
				expect(result).toHaveLength(0);
			});

			it('should handle root disk:/ path', () => {
				const result = filterByPath(mockItems, 'disk:/');
				expect(result).toHaveLength(4);
			});

			it('should match exact path without children', () => {
				const exactMatchItems: IYandexDiskResource[] = [
					{
						name: 'n8n',
						path: 'disk:/n8n',
						type: 'dir',
						created: '2025-12-14T10:00:00+00:00',
						modified: '2025-12-14T10:00:00+00:00',
						resource_id: 'resource-dir',
					},
					{
						name: 'file1.txt',
						path: 'disk:/n8n/file1.txt',
						type: 'file',
						created: '2025-12-14T10:00:00+00:00',
						modified: '2025-12-14T10:00:00+00:00',
						resource_id: 'resource-1',
					},
				];

				const result = filterByPath(exactMatchItems, 'n8n');
				expect(result).toHaveLength(2);
				expect(result[0].path).toBe('disk:/n8n');
				expect(result[1].path).toBe('disk:/n8n/file1.txt');
			});

			it('should not match partial folder names', () => {
				const partialMatchItems: IYandexDiskResource[] = [
					{
						name: 'file.txt',
						path: 'disk:/n8n123/file.txt',
						type: 'file',
						created: '2025-12-14T10:00:00+00:00',
						modified: '2025-12-14T10:00:00+00:00',
						resource_id: 'resource-1',
					},
				];

				const result = filterByPath(partialMatchItems, 'n8n');
				expect(result).toHaveLength(0);
			});
		});
	});

	describe('filterByEventType', () => {
		const now = Date.now();
		const mockItems: IYandexDiskResource[] = [
			{
				name: 'created-file.txt',
				path: 'disk:/created-file.txt',
				type: 'file',
				created: new Date(now).toISOString(),
				modified: new Date(now).toISOString(), // Same time = created
				resource_id: 'resource-1',
			},
			{
				name: 'updated-file.txt',
				path: 'disk:/updated-file.txt',
				type: 'file',
				created: new Date(now - 10000).toISOString(),
				modified: new Date(now).toISOString(), // Modified after creation = updated
				resource_id: 'resource-2',
			},
		];

		it('should filter created items', () => {
			const result = filterByEventType(mockItems, 'created');
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe('created-file.txt');
		});

		it('should filter updated items', () => {
			const result = filterByEventType(mockItems, 'updated');
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe('updated-file.txt');
		});

		it('should return all items for "all" event type', () => {
			const result = filterByEventType(mockItems, 'all');
			expect(result).toHaveLength(2);
		});

		it('should return all items for unknown event type', () => {
			const result = filterByEventType(mockItems, 'unknown');
			expect(result).toHaveLength(2);
		});
	});

	describe('filterByFileType', () => {
		const mockItems: IYandexDiskResource[] = [
			{
				name: 'image.jpg',
				path: 'disk:/image.jpg',
				type: 'file',
				mime_type: 'image/jpeg',
				created: '2025-12-14T10:00:00+00:00',
				modified: '2025-12-14T10:00:00+00:00',
				resource_id: 'resource-1',
			},
			{
				name: 'document.pdf',
				path: 'disk:/document.pdf',
				type: 'file',
				mime_type: 'application/pdf',
				created: '2025-12-14T10:00:00+00:00',
				modified: '2025-12-14T10:00:00+00:00',
				resource_id: 'resource-2',
			},
			{
				name: 'video.mp4',
				path: 'disk:/video.mp4',
				type: 'file',
				mime_type: 'video/mp4',
				created: '2025-12-14T10:00:00+00:00',
				modified: '2025-12-14T10:00:00+00:00',
				resource_id: 'resource-3',
			},
		];

		it('should filter image files', () => {
			const result = filterByFileType(mockItems, 'image');
			expect(result).toHaveLength(1);
			expect(result[0].mime_type).toBe('image/jpeg');
		});

		it('should filter document files', () => {
			const result = filterByFileType(mockItems, 'document');
			expect(result).toHaveLength(1);
			expect(result[0].mime_type).toBe('application/pdf');
		});

		it('should filter video files', () => {
			const result = filterByFileType(mockItems, 'video');
			expect(result).toHaveLength(1);
			expect(result[0].mime_type).toBe('video/mp4');
		});

		it('should return all items for "all" file type', () => {
			const result = filterByFileType(mockItems, 'all');
			expect(result).toHaveLength(3);
		});
	});

	describe('filterByModifiedTime', () => {
		const mockItems: IYandexDiskResource[] = [
			{
				name: 'old-file.txt',
				path: 'disk:/old-file.txt',
				type: 'file',
				created: '2025-12-14T08:00:00+00:00',
				modified: '2025-12-14T09:00:00+00:00',
				resource_id: 'resource-1',
			},
			{
				name: 'recent-file.txt',
				path: 'disk:/recent-file.txt',
				type: 'file',
				created: '2025-12-14T10:00:00+00:00',
				modified: '2025-12-14T11:00:00+00:00',
				resource_id: 'resource-2',
			},
		];

		it('should filter items within time range', () => {
			const result = filterByModifiedTime(
				mockItems,
				'2025-12-14T10:30:00+00:00',
				'2025-12-14T11:30:00+00:00',
			);
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe('recent-file.txt');
		});

		it('should exclude items outside time range', () => {
			const result = filterByModifiedTime(
				mockItems,
				'2025-12-14T08:30:00+00:00',
				'2025-12-14T09:30:00+00:00',
			);
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe('old-file.txt');
		});
	});

	describe('applyLimit', () => {
		const mockItems: IYandexDiskResource[] = Array.from({ length: 100 }, (_, i) => ({
			name: `file${i}.txt`,
			path: `disk:/file${i}.txt`,
			type: 'file',
			created: '2025-12-14T10:00:00+00:00',
			modified: '2025-12-14T10:00:00+00:00',
			resource_id: `resource-${i}`,
		}));

		it('should limit items to specified count', () => {
			const result = applyLimit(mockItems, 10);
			expect(result).toHaveLength(10);
		});

		it('should return all items when limit is 0', () => {
			const result = applyLimit(mockItems, 0);
			expect(result).toHaveLength(100);
		});

		it('should return all items when limit is negative', () => {
			const result = applyLimit(mockItems, -1);
			expect(result).toHaveLength(100);
		});

		it('should handle limit greater than array length', () => {
			const result = applyLimit(mockItems, 200);
			expect(result).toHaveLength(100);
		});
	});
});
