# ADR-002: Yandex360Disk Node Implementation

## Status

Proposed

## Date

2025-12-14

## Context

We need to implement a Yandex360Disk node to enable n8n users to interact with Yandex 360 Disk storage. Currently, only a trigger node exists (Yandex360DiskTrigger) for monitoring file changes. Users need a regular node for performing file operations such as upload, download, move, copy, create directories, and manage public access.

### Existing Infrastructure

The following components are already available:

1. **OAuth2 Authentication**
   - Credential type: `yandex360OAuth2Api`
   - Location: `/credentials/Yandex360OAuth2Api.credentials.ts`
   - Provides: Bearer token authentication

2. **Yandex Disk SDK**
   - Package: `yd-sdk` (v1.2.2)
   - Full TypeScript support with typed API methods
   - Initialization helper: `initializeYandexDiskApi()` in `GenericFunctions.ts`

3. **Error Handling Utilities**
   - Location: `/utils/errorHandling.ts`
   - Functions: `createOperationError()`, `createApiError()`, `withErrorHandling()`, `validateRequiredFields()`

4. **Type Patterns**
   - Constants defined using `as const` pattern
   - Type-safe parameter names via PARAMS constants
   - Location: `nodes/Yandex360Disk/types.ts`

### Yandex Disk API Characteristics

The Yandex Disk API uses a **2-step process** for binary data operations:

1. **Step 1**: Request a temporary URL from the API
2. **Step 2**: Transfer binary data using standard HTTP to/from the temporary URL

Example:

```typescript
// Upload flow
const { body: uploadLink } = await api.upload({ path, overwrite: true });
await this.helpers.httpRequest({ method: 'PUT', url: uploadLink.href, body: binaryData });

// Download flow
const { body: downloadLink } = await api.download({ path });
const buffer = await this.helpers.httpRequest({ method: 'GET', url: downloadLink.href });
```

### Technical Constraints

1. Some operations (copy, move, delete) may return **async operation links** instead of immediate results
2. Async operations require polling via `api.operation({ id })` to check status
3. All paths must start with `/` (e.g., `/Documents/file.pdf`)
4. OAuth token has limited lifetime and must be refreshed by user

## Decision

We will implement a `Yandex360Disk` node with the following architecture:

### 1. Node Structure

Start with a **simple structure** (single main file approach):

```text
nodes/Yandex360Disk/
├── Yandex360Disk.node.ts         # Main node (~400-600 lines)
├── GenericFunctions.ts            # Reuse existing + add binary helpers
├── types.ts                       # Extend with new constants
├── disk.svg                       # Reuse existing icon
└── test/
    └── Yandex360Disk.node.test.ts # Jest tests
```

**Refactoring threshold**: If the node exceeds 500 lines or 10 operations, refactor to modular structure with `resources/*.operations.ts` pattern following CLAUDE.md guidelines.

### 2. Resources and Operations

#### Resource: File (8 operations)

| Operation | Description | Key Parameters | API Method(s) |
|-----------|-------------|----------------|---------------|
| Upload | Upload binary data from input | `path`, `binaryProperty`, `overwrite` | `api.upload()` + `httpRequest(PUT)` |
| Download | Download file to binary output | `path` | `api.download()` + `httpRequest(GET)` |
| Delete | Delete file (to trash or permanently) | `path`, `permanently` | `api.remove()` |
| Copy | Copy file to another location | `sourcePath`, `destinationPath`, `overwrite` | `api.copy()` |
| Move | Move file to another location | `sourcePath`, `destinationPath`, `overwrite` | `api.move()` |
| Get Info | Get file metadata | `path`, `fields` | `api.info()` |
| Publish | Make file publicly accessible | `path` | `api.publish()` |
| Unpublish | Remove public access | `path` | `api.unpublish()` |

#### Resource: Folder (6 operations)

| Operation | Description | Key Parameters | API Method(s) |
|-----------|-------------|----------------|---------------|
| Create | Create a new directory | `path` | `api.create()` |
| List | List directory contents | `path`, `limit`, `offset`, `sort` | `api.info()` |
| Delete | Delete folder (to trash or permanently) | `path`, `permanently` | `api.remove()` |
| Get Info | Get folder metadata | `path`, `fields` | `api.info()` |
| Publish | Make folder publicly accessible | `path` | `api.publish()` |
| Unpublish | Remove public access | `path` | `api.unpublish()` |

**Total**: 14 operations across 2 resources

### 3. Key Technical Decisions

#### 3.1 Binary Data Handling

**Decision**: Implement helper functions in `GenericFunctions.ts` for upload/download operations.

**Rationale**:

- Encapsulates the 2-step process (get URL → transfer data)
- Reusable across multiple operations
- Simplifies error handling
- Maintains consistency with n8n patterns

**Functions to add**:

- `uploadBinaryData()` - Handle complete upload flow
- `downloadBinaryData()` - Handle complete download flow
- `isOperationLink()` - Check if API returned async operation link
- `getOperationId()` - Extract operation ID from link
- `waitForOperation()` - Poll operation status until completion

#### 3.2 Async Operation Handling

**Decision**: Provide `waitForCompletion` parameter for operations that may be async (copy, move, delete).

**Rationale**:

- Some operations complete instantly, others are async
- Users should control whether to wait or continue immediately
- Enables both blocking and non-blocking workflows
- Default to `true` (wait) for better user experience

**Implementation**:

```typescript
if (isOperationLink(result)) {
  const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true);

  if (waitForCompletion) {
    await waitForOperation(api, getOperationId(result));
    return { json: { success: true, status: 'completed' } };
  } else {
    return {
      json: {
        success: true,
        status: 'pending',
        operationId: getOperationId(result)
      }
    };
  }
}
```

#### 3.3 Error Handling Strategy

**Decision**: Use centralized error utilities from `/utils/errorHandling.ts` with specific error codes.

**Rationale**:

- Consistent error messages across the package
- Proper error wrapping for n8n
- Actionable error descriptions for users
- Handles `continueOnFail` mode correctly

**Pattern**:

```typescript
try {
  const result = await api.operation(params);
  // ... process result
} catch (error) {
  if (error.status === 409) {
    throw createOperationError(
      this.getNode(),
      `File already exists at path: ${path}`,
      'Set overwrite to true or use a different path'
    );
  }

  throw createApiError(
    this.getNode(),
    'Failed to execute operation',
    'Check your OAuth credentials and path',
    { path, operation, error: error.message }
  );
}
```

#### 3.4 Type Safety

**Decision**: Use constants for all resource names, operation names, and parameter names.

**Rationale**:

- Prevents typos in string literals
- Enables IDE autocomplete
- Single source of truth
- Easier refactoring
- Follows established pattern in `types.ts`

**Constants to add**:

```typescript
export const RESOURCES = {
  FILE: 'file',
  FOLDER: 'folder',
} as const;

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

export const FOLDER_OPERATIONS = {
  CREATE: 'create',
  LIST: 'list',
  DELETE: 'delete',
  GET_INFO: 'getInfo',
  PUBLISH: 'publish',
  UNPUBLISH: 'unpublish',
} as const;

export const PARAMS = {
  // Existing params...
  RESOURCE: 'resource',
  OPERATION: 'operation',
  SOURCE_PATH: 'sourcePath',
  DESTINATION_PATH: 'destinationPath',
  BINARY_PROPERTY: 'binaryProperty',
  OVERWRITE: 'overwrite',
  PERMANENTLY: 'permanently',
  WAIT_FOR_COMPLETION: 'waitForCompletion',
} as const;
```

### 4. Testing Strategy

**Test categories**:

1. **Node Definition Tests** - Properties, credentials, metadata
2. **File Operation Tests** - All 8 file operations (happy path + errors)
3. **Folder Operation Tests** - All 6 folder operations (happy path + errors)
4. **Binary Data Tests** - Upload/download with various file types
5. **Async Operation Tests** - Wait for completion vs immediate return
6. **Error Handling Tests** - `continueOnFail` true/false, API errors (401, 404, 409)

**Mocking strategy**:

- Mock `yd-sdk` module completely
- Mock `helpers.httpRequest` for binary transfers
- Mock `helpers.getBinaryDataBuffer` and `helpers.prepareBinaryData`
- Target: >85% code coverage

### 5. Documentation Updates

**Files to update**:

1. `/package.json` - Add node to `n8n.nodes` array
2. `/README.md` - Document new node in English
3. `/README.ru.md` - Document new node in Russian
4. `/CHANGELOG.md` - Add entry for new node
5. `/.github/ISSUE_TEMPLATE/bug_report.md` - Add node to dropdown (if exists)

## Consequences

### Positive

1. **Complete Yandex Disk Integration** - Users can perform all common file operations
2. **Type Safety** - Constants prevent runtime errors from typos
3. **Reusable Patterns** - Binary handling helpers can be used by future nodes
4. **Maintainable** - Simple structure with clear upgrade path to modular architecture
5. **Well-Tested** - Comprehensive test coverage ensures reliability
6. **Consistent** - Follows existing patterns from trigger node and CLAUDE.md guidelines

### Negative

1. **Large Initial Implementation** - 14 operations in single file (~600 lines)
   - **Mitigation**: Will refactor if exceeds 500 lines
2. **2-Step Upload/Download** - More complex than direct API
   - **Mitigation**: Helper functions encapsulate complexity
3. **Async Operation Polling** - Adds latency for some operations
   - **Mitigation**: Make `waitForCompletion` optional

### Risks

1. **SDK Changes** - `yd-sdk` may introduce breaking changes
   - **Mitigation**: Pin to specific version, test before upgrading
2. **API Rate Limits** - Yandex may throttle requests
   - **Mitigation**: Document rate limits, suggest delays between operations
3. **Token Expiration** - OAuth tokens may expire during long operations
   - **Mitigation**: Clear error messages, guide users to refresh token

## Implementation Plan

### Phase 1: Type Definitions and Helpers (Est: 1-2 hours)

1. Update `types.ts` with new constants
2. Add helper functions to `GenericFunctions.ts`
3. Test helpers in isolation

### Phase 2: Main Node Implementation (Est: 4-6 hours)

1. Create `Yandex360Disk.node.ts` with node definition
2. Implement property definitions (resource/operation selectors)
3. Implement execute method with routing logic
4. Implement file operations (upload, download, delete, copy, move, get info, publish, unpublish)
5. Implement folder operations (create, list, delete, get info, publish, unpublish)

### Phase 3: Testing (Est: 3-4 hours)

1. Create comprehensive test file
2. Test all operations (happy path)
3. Test error scenarios
4. Test binary data handling
5. Test async operation handling
6. Achieve >85% coverage

### Phase 4: Documentation (Est: 1 hour)

1. Update package.json
2. Update README.md (English)
3. Update README.ru.md (Russian)
4. Update CHANGELOG.md
5. Update bug report template

### Phase 5: Build and Validation (Est: 30 minutes)

1. Run `npm run build`
2. Run `npm test`
3. Run `npm run lint`
4. Manual testing in n8n UI (if possible)

**Total estimated time**: 9-14 hours

## Files to Create/Modify

### New Files

- `/nodes/Yandex360Disk/Yandex360Disk.node.ts` (main node implementation)
- `/nodes/Yandex360Disk/test/Yandex360Disk.node.test.ts` (comprehensive tests)

### Modified Files

- `/nodes/Yandex360Disk/types.ts` (add RESOURCES, OPERATIONS, PARAMS constants)
- `/nodes/Yandex360Disk/GenericFunctions.ts` (add binary and async operation helpers)
- `/package.json` (register new node in `n8n.nodes` array)
- `/README.md` (document new node)
- `/README.ru.md` (document new node in Russian)
- `/CHANGELOG.md` (add entry for v0.1.0 or next version)

## Success Criteria

1. ✅ Node builds successfully (`npm run build`)
2. ✅ All tests pass with >85% coverage (`npm test`)
3. ✅ Linting passes (`npm run lint`)
4. ✅ Node validation passes (`npm run validate:nodes`)
5. ✅ Node appears correctly in n8n UI with proper icon
6. ✅ All 14 operations work correctly
7. ✅ Binary upload/download works with various file types
8. ✅ Async operations handle operation links correctly
9. ✅ Error handling works in both `continueOnFail` modes
10. ✅ Documentation is complete and accurate

## References

- [Yandex Disk REST API Documentation](https://yandex.com/dev/disk/rest/)
- [yd-sdk GitHub Repository](https://github.com/axtk/yd-sdk)
- [n8n Node Development Documentation](https://docs.n8n.io/integrations/creating-nodes/)
- Project CLAUDE.md (implementation patterns and guidelines)
- Existing Yandex360DiskTrigger node (reference implementation)
