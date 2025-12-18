# ADR 001: Yandex 360 Disk Trigger Node Implementation

**Status:** Implemented
**Date:** 2025-12-13 (Original) / 2025-12-14 (Implemented)
**Deciders:** Development Team
**Technical Story:** First node implementation for n8n-nodes-yandex360 package

## Context

This is the first node implementation for the n8n-nodes-yandex360 package after migrating from n8n-nodes-yc (Yandex Cloud services). The package has been reset to v0.0.1 with all previous nodes removed, focusing exclusively on Yandex 360 for Business services.

**Infrastructure Status:**

- ✅ TypeScript setup with strict mode
- ✅ Jest testing framework configured
- ✅ ESLint with n8n-nodes-base rules
- ✅ Error handling utilities (`@utils/errorHandling`)
- ✅ yd-sdk v1.2.2 already installed
- ✅ Build pipeline (tsc → tsc-alias → gulp → validate)
- ✅ Yandex360OAuth2Api credentials implemented
- ✅ Yandex360DiskTrigger node implemented and tested

## Decision

We will implement **Yandex360DiskTrigger** - a polling-based trigger node that monitors Yandex Disk for file and folder changes.

### Architecture Decisions

#### 1. Authentication: OAuth 2.0

**Decision:** Use simplified OAuth 2.0 with manual token management.

**Rationale:**

- Yandex 360 requires OAuth 2.0 for API access
- Simplified credential type stores pre-obtained OAuth token
- Users manage token lifecycle independently
- Standard authentication method for SaaS integrations

**Actual Implementation:**

- Credential type: `yandex360OAuth2Api`
- Token header format: `Authorization: OAuth <oauthToken>`
- Users obtain token externally and provide it via credential configuration
- Token stored securely as password-type field
- Authentication defined via `authenticate.type: 'generic'` with header injection

**Key Change from Plan:** Used simplified token-based authentication instead of full OAuth flow. Users must obtain and refresh tokens manually via Yandex's OAuth portal.

#### 2. Trigger Type: Polling (Not Webhook)

**Decision:** Implement as polling trigger using `IPollFunctions` interface.

**Rationale:**

- Yandex Disk API does not provide webhook support
- Polling is the only viable option for change detection
- n8n's polling infrastructure is mature and reliable
- Follows established patterns from Google Drive Trigger and other n8n core nodes

**Trade-offs:**

- ✅ Pros: Works with current API capabilities, predictable behavior
- ❌ Cons: Higher latency than webhooks, more API calls, potential rate limiting

#### 3. Change Detection: Recent Files API with Timestamp Filtering

**Decision:** Use `api.recent()` method with client-side timestamp filtering instead of `api.list()`.

**Rationale:**

- Yandex Disk API provides `api.recent()` optimized for recent file discovery
- More efficient than listing entire directory tree
- Supports filtering by `media_type` parameter at API level
- Returns pre-sorted results by modification time

**Actual Implementation:**

```typescript
const webhookData = this.getWorkflowStaticData('node');
const startDate = (webhookData.lastTimeChecked as string) || now;
const endDate = now;

// Fetch recent files with API-level filtering
const recentOptions: any = { limit: Math.min(userLimit, 1000) };
if (mediaType) {
  recentOptions.media_type = mediaType; // e.g., 'image', 'video', 'document'
}

const response = await api.recent(recentOptions);
items = response.body.items || [];

// Client-side filtering
items = filterByModifiedTime(items, startDate, endDate);
items = filterByEventType(items, event); // created vs updated
items = filterByPath(items, path); // if specific path monitoring
items = filterByFileType(items, fileType); // detailed MIME type matching

webhookData.lastTimeChecked = endDate; // Update state before returning
```

**Key Change from Plan:** Used `api.recent()` instead of `api.list()` for better performance. Added support for API-level `media_type` filtering and specific path monitoring.

#### 4. Event Detection: Created vs Updated

**Decision:** Distinguish events by comparing `created` and `modified` timestamps.

**Rationale:**

- Yandex Disk API doesn't explicitly flag event types
- Timestamp comparison is reliable: if `created ≈ modified` (within 1 second) → file was created
- If `modified > created + 1 second` → file was updated

**Trade-offs:**

- ✅ Pros: No API changes needed, simple logic
- ❌ Cons: Edge cases where rapid updates might be miscategorized

**Limitation:** "Deleted" event not supported in v1 (requires storing file lists for comparison).

#### 5. SDK Usage: yd-sdk

**Decision:** Use yd-sdk v1.2.2 for all Yandex Disk API interactions.

**Rationale:**

- Already installed as project dependency
- Typed TypeScript SDK with full Yandex Disk API coverage
- Handles request/response serialization
- Provides `RequestError` for error handling

**API Methods Used:**

- `api.recent({ limit: 1 })` - For manual mode (testing)
- `api.recent({ limit: N, media_type: 'type' })` - For automated mode (polling with filters)

**Key Change from Plan:** Used only `api.recent()` for both manual and automated modes, leveraging its filtering capabilities instead of `api.list()`.

#### 6. Manual vs Automated Mode

**Decision:** Implement different behavior for manual testing vs automated polling.

**Rationale:**

- Manual mode: Users need instant feedback when configuring the node
- Automated mode: Efficient polling with state tracking

**Implementation:**

```typescript
if (this.getMode() === 'manual') {
  // Return 1 item quickly for testing
  const response = await api.recent({ limit: 1 });
  if (items.length === 0) {
    throw new NodeApiError(this.getNode(), {
      message: 'No files found in Yandex Disk',
    });
  }
} else {
  // Fetch all changes since lastTimeChecked
  // Apply filters, pagination, etc.
}
```

#### 7. Filtering Options

**Decision:** Support multiple filtering options with hybrid API/client-side filtering.

**Options Implemented:**

1. **Watch For (Event Type):** Created, Updated (required parameter)
   - Implemented via `filterByEventType()` comparing `created` vs `modified` timestamps

2. **Watch Location:** Entire Disk, Specific Path (required parameter)
   - Implemented via `filterByPath()` for path-based filtering

3. **File Type Filter (optional):** All, Document, Image, Video, Audio, Archive
   - Maps to API `media_type` parameter for efficient server-side filtering
   - Additional client-side MIME type matching via `filterByFileType()`

4. **Limit (optional):** Number (default: 50, max: 1000)
   - Capped at API maximum of 1000 items
   - Important limitation documented via notice field

**Rationale:**

- Users need control over which files trigger workflows
- Limiting results prevents performance issues with large Disks
- File type filtering is a common use case
- Path filtering enables focused monitoring
- API-level filtering reduces data transfer and processing

**Key Changes from Plan:**

- Removed "Return All" option - always use limit (API constraint)
- Added "Watch Location" for path-specific monitoring
- Made "Watch For" (event type) a top-level parameter instead of optional
- Added API limitation notice about 1000-item maximum

#### 8. State Management

**Decision:** Use `getWorkflowStaticData('node')` for persistent state storage with different behavior for manual vs automated mode.

**State Stored:**

- `lastTimeChecked` - ISO 8601 UTC timestamp of last successful poll (automated mode only)

**Critical Implementation Details:**

```typescript
if (this.getMode() === 'manual') {
  // Manual mode: Return 1 item quickly for testing
  // IMPORTANT: Do NOT update state in manual mode to prevent test executions
  // from interfering with automated polling
  const response = await api.recent({ limit: 1 });
  // ... error handling ...
  return [this.helpers.returnJsonArray(items)];
}

// Automated mode: Update state BEFORE returning
webhookData.lastTimeChecked = endDate;

if (items.length > 0) {
  return [this.helpers.returnJsonArray(items)];
}

return null; // Return null, not empty array
```

**Rationale:**

- State must be updated before returning to prevent re-processing same items
- Manual mode must NOT update state to avoid interference with automated polling
- Returning `null` (not `[]`) prevents workflow execution when no items found
- UTC timestamps ensure consistency across timezones

**Key Change from Plan:** Added protection against state pollution from manual test executions. This prevents users from accidentally skipping events when testing the trigger.

#### 9. Error Handling

**Decision:** Use n8n's built-in `NodeApiError` with descriptive messages instead of centralized utilities.

**Actual Implementation:**

```typescript
try {
  const response = await api.recent(recentOptions);
  const responseBody = response.body;

  if (responseBody && typeof responseBody === 'object' && 'items' in responseBody) {
    items = (responseBody.items as IYandexDiskResource[]) || [];
  }

  if (items.length === 0 && this.getMode() === 'manual') {
    throw new NodeApiError(this.getNode(), response as any, {
      message: 'No recent files found in Yandex Disk',
      description: 'Upload some files to your Yandex Disk to test this trigger',
    });
  }
} catch (error) {
  if (error instanceof NodeApiError) {
    throw error;
  }
  throw new NodeApiError(this.getNode(), error as any, {
    message: 'Failed to fetch recent files from Yandex Disk',
    description: 'Check your OAuth credentials and configuration',
  });
}
```

**Rationale:**

- `NodeApiError` provides structured error information to n8n UI
- User-friendly error messages with actionable descriptions
- Preserves existing `NodeApiError` instances to avoid double-wrapping
- Separate error handling for manual vs automated mode

**Key Change from Plan:** Used n8n's native `NodeApiError` directly instead of centralized error utilities. Added defensive response body validation to handle various API response formats.

#### 10. Testing Strategy

**Decision:** Achieve >85% test coverage with comprehensive unit tests.

**Test Categories:**

1. Node Definition Tests - Metadata validation
2. Poll Method Tests - Happy path and error cases
3. Filtering Tests - Event type, file type, time range
4. State Management Tests - lastTimeChecked updates
5. Error Handling Tests - API errors, invalid credentials

**Mocking Strategy:**

```typescript
jest.mock('yd-sdk');

const mockApi = {
  recent: jest.fn(),
  list: jest.fn(),
};

(sdk as jest.Mock).mockReturnValue(mockApi);
```

**Rationale:**

- This is the first node - sets quality standards for future implementations
- High coverage ensures reliability
- Mocks prevent real API calls during testing

## Consequences

### Positive

1. **Clean Foundation:** Establishes patterns for future Yandex 360 nodes
2. **Reliable Polling:** Uses proven n8n polling infrastructure
3. **Type Safety:** Comprehensive TypeScript types with yd-sdk
4. **Error Handling:** Centralized utilities ensure consistency
5. **Testability:** High test coverage with mocked dependencies
6. **Maintainability:** Clear separation of concerns (node, helpers, types, tests)

### Negative

1. **No Webhook Support:** Polling introduces latency and higher API usage
2. **No Deleted Detection:** Can't detect deleted files without storing file lists
3. **Rate Limiting Risk:** Frequent polling may hit API limits (mitigated by documentation)
4. **OAuth Setup Complexity:** Users must create Yandex application and configure OAuth

### Neutral

1. **First Node:** Patterns may need adjustment as more nodes are added
2. **yd-sdk Dependency:** Package tied to external SDK (but it's stable and well-maintained)

## Implementation Plan

### Files Created (6 total)

1. ✅ `credentials/Yandex360OAuth2Api.credentials.ts` - Simplified OAuth token credential
2. ✅ `nodes/Yandex360Disk/Yandex360DiskTrigger.node.ts` - Main trigger node (289 lines)
3. ✅ `nodes/Yandex360Disk/GenericFunctions.ts` - Helper functions with filtering logic
4. ✅ `nodes/Yandex360Disk/types.ts` - Type definitions and constants
5. ✅ `nodes/Yandex360Disk/disk.svg` - Node icon
6. ✅ `nodes/Yandex360Disk/test/Yandex360DiskTrigger.node.test.ts` - Comprehensive unit tests

**Note:** SDK mock implemented inline in test file using `jest.mock('yd-sdk')` - no separate mock file needed.

### Files to Modify (4 total)

1. `package.json` - Register credentials and node
2. `README.md` - Add node documentation and setup guide
3. `CHANGELOG.md` - Add entry for new node
4. `.github/ISSUE_TEMPLATE/bug_report.md` - Update node list

### Estimated vs Actual Effort

| Task | Estimated | Actual | Notes |
|------|-----------|--------|-------|
| Credential type | 1 hour | ~0.5 hours | Simplified token-based approach |
| Trigger node core | 4 hours | ~5 hours | Added path monitoring and API-level filtering |
| Helper functions | 2 hours | ~2 hours | Multiple filter functions implemented |
| Unit tests | 4 hours | ~3 hours | Comprehensive test coverage achieved |
| Documentation | 2 hours | ~1 hour | ADR and inline comments |
| Testing & debugging | 3 hours | ~2 hours | Fewer issues due to well-defined plan |

**Total:** Estimated: ~16 hours | **Actual: ~13.5 hours**

## Validation Checklist

- ✅ Code compiles without errors: `npm run build`
- ✅ All unit tests pass: `npm test`
- ✅ Test coverage >85%: `npm run test:coverage`
- ✅ Linting passes: `npm run lint`
- ✅ Node validation passes (included in build)
- ⚠️ Credential appears in n8n UI (requires n8n integration testing)
- ⚠️ OAuth token authentication works (requires manual testing with real tokens)
- ⚠️ Node appears in trigger nodes list (requires n8n integration testing)
- ⚠️ Manual execution returns data (requires n8n integration testing)
- ⚠️ Automated execution detects changes (requires n8n integration testing)
- 🔄 README.md updated with usage examples (in progress)
- 🔄 CHANGELOG.md updated (in progress)
- ✅ Commit message follows Conventional Commits format

**Legend:** ✅ Complete | ⚠️ Requires manual/integration testing | 🔄 In progress

## Future Enhancements (Not in v1)

1. **Webhook Support:** Convert to webhook trigger if Yandex adds webhook API
2. **Deleted Files Detection:** Store file list state and compare to detect deletions
3. **Resource Locator:** Folder picker UI for path selection
4. **Advanced Filters:** File size, regex patterns, exclude patterns
5. **Multiple Paths:** Monitor multiple folders in one trigger
6. **Diff Output:** Include previous version data for updated files

## References

- [yd-sdk Documentation](https://www.npmjs.com/package/yd-sdk) - v1.2.2
- [n8n Trigger Node Design Guide](docs/trigger-node-design-guide.md)
- [n8n Workflow Types](https://docs.n8n.io/workflows/)
- [Yandex Disk API](https://yandex.com/dev/disk-api/doc/en/)
- [Yandex OAuth Documentation](https://yandex.com/dev/id/doc/en/)

## Notes

- This ADR serves as the implementation plan for the first node
- Patterns established here will be referenced for future Yandex 360 nodes
- Follow CLAUDE.md guidelines strictly (types, error handling, testing)
- Use parameter name constants pattern from Section 7.4 of CLAUDE.md
- Don't refactor into modular structure yet (only 1 resource, few operations)
