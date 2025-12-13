# ADR 001: Yandex 360 Disk Trigger Node Implementation

**Status:** Accepted
**Date:** 2025-12-13
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
- ❌ No credentials implemented yet
- ❌ No nodes implemented yet

## Decision

We will implement **Yandex360DiskTrigger** - a polling-based trigger node that monitors Yandex Disk for file and folder changes.

### Architecture Decisions

#### 1. Authentication: OAuth 2.0

**Decision:** Use OAuth 2.0 authorization code flow via n8n's built-in OAuth2 credential type.

**Rationale:**

- Yandex 360 requires OAuth 2.0 for API access
- n8n provides automatic token refresh mechanism
- Standard authentication method for SaaS integrations
- Secure token storage managed by n8n

**Implementation:**

- Credential type: `yandex360OAuth2Api`
- Token header format: `Authorization: OAuth <access_token>` (Yandex-specific)
- Scopes: `cloud_api:disk.read cloud_api:disk.write cloud_api:disk.app_folder cloud_api:disk.info`

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

#### 3. Change Detection: Timestamp-Based Polling

**Decision:** Use `modified` timestamp comparison with stored `lastTimeChecked` state.

**Rationale:**

- yd-sdk provides `api.list()` with pagination support
- Timestamps can be compared to detect changes since last poll
- State persists across workflow activations via `getWorkflowStaticData('node')`

**Implementation:**

```typescript
const webhookData = this.getWorkflowStaticData('node');
const startDate = (webhookData.lastTimeChecked as string) || now;
const items = await api.list({ limit: 1000 });

// Filter items modified after startDate
const newItems = items.filter(item =>
  moment(item.modified).isAfter(startDate)
);

webhookData.lastTimeChecked = endDate; // Update state before returning
```

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
- `api.list({ limit: 1000 })` - For automated mode (polling)

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

**Decision:** Support file type filtering and result limiting.

**Options Provided:**

1. **File Type Filter:** All, Document, Image, Video, Audio, Archive
   - Maps to MIME type patterns (e.g., `image/` matches all image types)

2. **Return All:** Boolean (default: false)
   - When false: Limit parameter appears

3. **Limit:** Number (default: 50)
   - Maximum items to return per execution

**Rationale:**

- Users need control over which files trigger workflows
- Limiting results prevents performance issues with large Disks
- File type filtering is a common use case

#### 8. State Management

**Decision:** Use `getWorkflowStaticData('node')` for persistent state storage.

**State Stored:**

- `lastTimeChecked` - ISO 8601 UTC timestamp of last successful poll

**Critical Implementation Detail:**

```typescript
// Update state BEFORE returning (even if no items found)
webhookData.lastTimeChecked = endDate;

if (items.length > 0) {
  return [this.helpers.returnJsonArray(items)];
}

return null; // Return null, not empty array
```

**Rationale:**

- State must be updated before returning to prevent re-processing same items
- Returning `null` (not `[]`) prevents workflow execution when no items found
- UTC timestamps ensure consistency across timezones

#### 9. Error Handling

**Decision:** Use centralized error handling utilities from `@utils/errorHandling`.

**Implementation:**

```typescript
import { createApiError, withErrorHandling } from '@utils/errorHandling';

// Wrap API calls
try {
  const response = await api.list({ limit: 1000 });
} catch (error) {
  throw createApiError(this.getNode(), error, 'Failed to fetch Disk items');
}
```

**Rationale:**

- Consistent error messages across the package
- Handles yd-sdk `RequestError` properly
- Provides context to users for debugging

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

### Files to Create (7 total)

1. `credentials/Yandex360OAuth2Api.credentials.ts` - OAuth 2.0 credential type
2. `nodes/Yandex360Disk/Yandex360DiskTrigger.node.ts` - Main trigger node
3. `nodes/Yandex360Disk/GenericFunctions.ts` - Helper functions
4. `nodes/Yandex360Disk/types.ts` - Type definitions and constants
5. `nodes/Yandex360Disk/yandex360disk.svg` - Node icon
6. `nodes/Yandex360Disk/test/Yandex360DiskTrigger.node.test.ts` - Unit tests
7. `nodes/Yandex360Disk/test/__mocks__/yd-sdk.ts` - yd-sdk mock (if needed)

### Files to Modify (4 total)

1. `package.json` - Register credentials and node
2. `README.md` - Add node documentation and setup guide
3. `CHANGELOG.md` - Add entry for new node
4. `.github/ISSUE_TEMPLATE/bug_report.md` - Update node list

### Estimated Effort

- Credential type: 1 hour
- Trigger node core: 4 hours
- Helper functions: 2 hours
- Unit tests: 4 hours
- Documentation: 2 hours
- Testing & debugging: 3 hours

**Total:** ~16 hours (2 days)

## Validation Checklist

- [ ] Code compiles without errors: `npm run build`
- [ ] All unit tests pass: `npm test`
- [ ] Test coverage >85%: `npm run test:coverage`
- [ ] Linting passes: `npm run lint`
- [ ] Node validation passes (included in build)
- [ ] Credential appears in n8n UI
- [ ] OAuth flow connects successfully
- [ ] Node appears in trigger nodes list
- [ ] Manual execution returns data
- [ ] Automated execution detects changes
- [ ] README.md updated with usage examples
- [ ] CHANGELOG.md updated
- [ ] Commit message follows Conventional Commits format

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
