# n8n Trigger Node Design Guide

A comprehensive guide for designing and implementing trigger nodes in n8n, based on patterns from Google Drive Trigger, GitHub Trigger, and other core implementations.

## Table of Contents

1. [Overview](#overview)
2. [Polling Triggers](#polling-triggers)
3. [Webhook Triggers](#webhook-triggers)
4. [Node Configuration Patterns](#node-configuration-patterns)
5. [Resource Locator Pattern](#resource-locator-pattern)
6. [Best Practices](#best-practices)
7. [Common Pitfalls](#common-pitfalls)
8. [Complete Working Examples](#complete-working-examples)

---

## Overview

### What are Trigger Nodes?

Trigger nodes start workflow executions in response to external events. They are the entry points for automated workflows in n8n.

### Three Types of Triggers

| Type | Description | Use Case | Example |
|------|-------------|----------|---------|
| **Polling** | Periodically checks for new data | APIs without webhooks, file monitoring | Google Drive, Airtable |
| **Webhook** | Receives HTTP callbacks from services | Real-time event notifications | GitHub, Stripe |
| **Manual** | User-initiated execution | Testing, on-demand workflows | Manual Trigger |

### When to Use Each Type

- **Use Polling** when:
  - The external service doesn't support webhooks
  - You need to check for changes on a schedule
  - The API provides query filters for incremental updates (e.g., `modifiedTime > '2024-01-01'`)

- **Use Webhooks** when:
  - The service supports webhook registration
  - Real-time event notification is critical
  - You want to minimize API calls and reduce latency

- **Use Manual** when:
  - The workflow should only run on-demand
  - You're building a testing or debugging tool

---

## Polling Triggers

### Core Interface: `IPollFunctions`

Polling triggers use the `IPollFunctions` interface, which extends `FunctionsBase` with polling-specific methods:

```typescript
export interface IPollFunctions extends FunctionsBaseWithRequiredKeys<'getMode' | 'getActivationMode'> {
  __emit(data: INodeExecutionData[][]): void;
  __emitError(error: Error): void;
  getNodeParameter(parameterName: string, fallbackValue?: any): NodeParameterValueType | object;
  helpers: RequestHelperFunctions & BaseHelperFunctions & BinaryHelperFunctions & SchedulingFunctions;
}
```

**Key Methods from FunctionsBase:**

- `getWorkflowStaticData(type: string): IDataObject` - Persistent state storage
- `getMode(): WorkflowExecuteMode` - Returns `'manual'` or `'trigger'`
- `getCredentials<T>(type: string): Promise<T>` - Retrieve authentication credentials
- `getNode(): INode` - Get current node metadata

### Node Description Structure

```typescript
export class MyPollingTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'My Polling Trigger',
    name: 'myPollingTrigger',
    icon: 'file:myservice.svg',
    group: ['trigger'],
    version: 1,
    description: 'Starts the workflow when events occur in My Service',

    // CRITICAL: Mark as polling trigger
    polling: true,

    // Trigger nodes have no inputs, only outputs
    inputs: [],
    outputs: [NodeConnectionTypes.Main],

    credentials: [
      {
        name: 'myServiceApi',
        required: true,
      },
    ],

    properties: [
      // Node parameters (covered in detail below)
    ],
  };
}
```

### Poll Method Signature

```typescript
async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null>
```

**Return Values:**

- `INodeExecutionData[][]` - Array of execution data arrays (triggers workflow)
- `null` - No new data found (prevents workflow execution)

**CRITICAL:** Always return `null` when no new items are found. Returning an empty array `[[]]` will still trigger the workflow unnecessarily.

### State Persistence Pattern

Use `getWorkflowStaticData('node')` to store state between polls:

```typescript
async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
  // Get persistent state object (mutable)
  const webhookData = this.getWorkflowStaticData('node');

  // Initialize timestamp on first run
  const now = moment().utc().format();
  const startDate = (webhookData.lastTimeChecked as string) || now;
  const endDate = now;

  // Query for items modified since last check
  const query = [`modifiedTime > '${startDate}'`];
  const items = await fetchItems(query);

  // CRITICAL: Update state BEFORE returning (even if no items found)
  webhookData.lastTimeChecked = endDate;

  // Return data or null
  if (Array.isArray(items) && items.length) {
    return [this.helpers.returnJsonArray(items)];
  }

  return null;
}
```

**State Storage Guidelines:**

- Use consistent keys (e.g., `lastTimeChecked`, `lastItemId`)
- Store timestamps in UTC format
- Update state before returning, even when no new items exist
- State persists across workflow activations/deactivations

### Manual vs Automated Execution Modes

Handle test executions differently to provide fast feedback:

```typescript
async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
  const webhookData = this.getWorkflowStaticData('node');

  if (this.getMode() === 'manual') {
    // MANUAL MODE: Return 1 item quickly for testing
    const response = await apiRequest('GET', '/items', { limit: 1 });
    const items = response.items;

    if (!items || items.length === 0) {
      throw new NodeApiError(this.getNode(), {
        message: 'No data with the current filter could be found',
      });
    }

    return [this.helpers.returnJsonArray(items)];
  } else {
    // AUTOMATED MODE: Fetch all new items with pagination
    const startDate = (webhookData.lastTimeChecked as string) || moment().utc().format();
    const items = await fetchAllItemsSince(startDate);

    webhookData.lastTimeChecked = moment().utc().format();

    if (items.length) {
      return [this.helpers.returnJsonArray(items)];
    }

    return null;
  }
}
```

**Why This Pattern?**

- Manual mode: Fast feedback for users testing their configuration
- Automated mode: Complete data processing with time-based filtering

### Polling Trigger Template

```typescript
import moment from 'moment-timezone';
import type {
  IPollFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeApiError } from 'n8n-workflow';

export class MyPollingTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'My Polling Trigger',
    name: 'myPollingTrigger',
    icon: 'file:myservice.svg',
    group: ['trigger'],
    version: 1,
    description: 'Starts the workflow when events occur',
    polling: true,
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'myServiceApi',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Event',
        name: 'event',
        type: 'options',
        required: true,
        default: 'itemCreated',
        options: [
          {
            name: 'Item Created',
            value: 'itemCreated',
          },
          {
            name: 'Item Updated',
            value: 'itemUpdated',
          },
        ],
      },
    ],
  };

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const webhookData = this.getWorkflowStaticData('node');
    const event = this.getNodeParameter('event') as string;

    const now = moment().utc().format();
    const startDate = (webhookData.lastTimeChecked as string) || now;
    const endDate = now;

    let items;

    if (this.getMode() === 'manual') {
      // Manual mode: fetch 1 item for testing
      items = await this.helpers.request({
        method: 'GET',
        url: 'https://api.myservice.com/items',
        qs: { limit: 1 },
        json: true,
      });

      if (!items || items.length === 0) {
        throw new NodeApiError(this.getNode(), {
          message: 'No data found with current filter',
        });
      }
    } else {
      // Automated mode: fetch all items since last check
      const query = {
        modifiedAfter: startDate,
        event: event,
      };

      items = await this.helpers.request({
        method: 'GET',
        url: 'https://api.myservice.com/items',
        qs: query,
        json: true,
      });
    }

    // Update state before returning
    webhookData.lastTimeChecked = endDate;

    if (Array.isArray(items) && items.length) {
      return [this.helpers.returnJsonArray(items)];
    }

    return null;
  }
}
```

---

## Webhook Triggers

### Core Interfaces

Webhook triggers use two interfaces:

1. **`IHookFunctions`** - For webhook lifecycle management (create, check, delete)
2. **`IWebhookFunctions`** - For processing incoming webhook requests

### Node Description Structure

```typescript
export class MyWebhookTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'My Webhook Trigger',
    name: 'myWebhookTrigger',
    icon: 'file:myservice.svg',
    group: ['trigger'],
    version: 1,
    description: 'Starts the workflow when webhook events occur',

    // NO polling property for webhook triggers

    inputs: [],
    outputs: [NodeConnectionTypes.Main],

    credentials: [
      {
        name: 'myServiceApi',
        required: true,
      },
    ],

    // Define webhook configuration
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived', // or 'lastNode'
        path: 'webhook',
      },
    ],

    properties: [
      // Node parameters
    ],
  };
}
```

### Webhook Lifecycle Methods

```typescript
webhookMethods = {
  default: {
    // 1. Check if webhook exists
    async checkExists(this: IHookFunctions): Promise<boolean> {
      const webhookData = this.getWorkflowStaticData('node');

      if (webhookData.webhookId === undefined) {
        return false; // No webhook registered yet
      }

      // Verify webhook still exists in external service
      try {
        const endpoint = `/webhooks/${webhookData.webhookId}`;
        await apiRequest.call(this, 'GET', endpoint);
        return true; // Webhook exists
      } catch (error) {
        if (error.httpCode === '404') {
          delete webhookData.webhookId;
          return false; // Webhook was deleted
        }
        throw error; // Other error
      }
    },

    // 2. Create webhook
    async create(this: IHookFunctions): Promise<boolean> {
      const webhookUrl = this.getNodeWebhookUrl('default') as string;
      const webhookData = this.getWorkflowStaticData('node');
      const events = this.getNodeParameter('events') as string[];

      // Register webhook with external service
      const body = {
        url: webhookUrl,
        events: events,
        active: true,
      };

      const responseData = await apiRequest.call(this, 'POST', '/webhooks', body);

      // Store webhook ID and configuration
      webhookData.webhookId = responseData.id as string;
      webhookData.webhookEvents = events;

      return true;
    },

    // 3. Delete webhook
    async delete(this: IHookFunctions): Promise<boolean> {
      const webhookData = this.getWorkflowStaticData('node');

      if (webhookData.webhookId !== undefined) {
        // Unregister webhook from external service
        const endpoint = `/webhooks/${webhookData.webhookId}`;

        try {
          await apiRequest.call(this, 'DELETE', endpoint);
        } catch (error) {
          // Ignore 404 errors (webhook already deleted)
          if (error.httpCode !== '404') {
            throw error;
          }
        }

        // Clean up state
        delete webhookData.webhookId;
        delete webhookData.webhookEvents;
      }

      return true;
    },
  },
};
```

### Webhook Processing Method

```typescript
async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
  const bodyData = this.getBodyData();
  const headerData = this.getHeaderData();
  const queryData = this.getQueryData();

  // Handle ping/verification requests
  if (bodyData.type === 'ping') {
    return {
      webhookResponse: { status: 'ok' },
    };
  }

  // Process actual webhook event
  const returnData: INodeExecutionData[] = [];

  returnData.push({
    json: {
      body: bodyData,
      headers: headerData,
      query: queryData,
    },
  });

  return {
    workflowData: [returnData],
  };
}
```

### Response Modes

Configure webhook response behavior via `responseMode`:

```typescript
webhooks: [
  {
    name: 'default',
    httpMethod: 'POST',
    responseMode: 'onReceived', // Respond immediately
    // OR
    // responseMode: 'lastNode', // Respond with workflow output
    path: 'webhook',
  },
]
```

- **`onReceived`** - Respond immediately with 200 OK (most common)
- **`lastNode`** - Wait for workflow to complete and return last node's output

### Webhook Trigger Template

```typescript
import type {
  IHookFunctions,
  IWebhookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
} from 'n8n-workflow';

export class MyWebhookTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'My Webhook Trigger',
    name: 'myWebhookTrigger',
    icon: 'file:myservice.svg',
    group: ['trigger'],
    version: 1,
    description: 'Starts the workflow when webhook events occur',
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'myServiceApi',
        required: true,
      },
    ],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: 'webhook',
      },
    ],
    properties: [
      {
        displayName: 'Events',
        name: 'events',
        type: 'multiOptions',
        required: true,
        default: [],
        options: [
          {
            name: 'Item Created',
            value: 'item.created',
          },
          {
            name: 'Item Updated',
            value: 'item.updated',
          },
        ],
      },
    ],
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        if (webhookData.webhookId === undefined) {
          return false;
        }

        try {
          await this.helpers.request({
            method: 'GET',
            url: `https://api.myservice.com/webhooks/${webhookData.webhookId}`,
            json: true,
          });
          return true;
        } catch (error) {
          if (error.statusCode === 404) {
            delete webhookData.webhookId;
            return false;
          }
          throw error;
        }
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default') as string;
        const webhookData = this.getWorkflowStaticData('node');
        const events = this.getNodeParameter('events') as string[];

        const responseData = await this.helpers.request({
          method: 'POST',
          url: 'https://api.myservice.com/webhooks',
          body: {
            url: webhookUrl,
            events: events,
          },
          json: true,
        });

        webhookData.webhookId = responseData.id;
        webhookData.webhookEvents = events;

        return true;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');

        if (webhookData.webhookId !== undefined) {
          try {
            await this.helpers.request({
              method: 'DELETE',
              url: `https://api.myservice.com/webhooks/${webhookData.webhookId}`,
              json: true,
            });
          } catch (error) {
            if (error.statusCode !== 404) {
              throw error;
            }
          }

          delete webhookData.webhookId;
          delete webhookData.webhookEvents;
        }

        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const bodyData = this.getBodyData();

    return {
      workflowData: [
        this.helpers.returnJsonArray([
          {
            body: bodyData,
            headers: this.getHeaderData(),
            query: this.getQueryData(),
          },
        ]),
      ],
    };
  }
}
```

---

## Node Configuration Patterns

### Multiple Credential Types

Support different authentication methods:

```typescript
credentials: [
  {
    name: 'myServiceOAuth2Api',
    required: true,
    displayOptions: {
      show: {
        authentication: ['oAuth2'],
      },
    },
  },
  {
    name: 'myServiceApi',
    required: true,
    displayOptions: {
      show: {
        authentication: ['apiKey'],
      },
    },
  },
],
properties: [
  {
    displayName: 'Authentication',
    name: 'authentication',
    type: 'options',
    options: [
      {
        name: 'OAuth2',
        value: 'oAuth2',
      },
      {
        name: 'API Key',
        value: 'apiKey',
      },
    ],
    default: 'oAuth2',
  },
  // ... other properties
]
```

### Conditional Field Display

Use `displayOptions` to show/hide fields based on other parameters:

```typescript
{
  displayName: 'Folder',
  name: 'folder',
  type: 'string',
  default: '',
  displayOptions: {
    show: {
      triggerOn: ['specificFolder'], // Show only when triggerOn = 'specificFolder'
      event: ['fileCreated', 'fileUpdated'], // AND event is one of these
    },
    hide: {
      advanced: [true], // Hide when advanced = true
    },
  },
}
```

### Options with Filters

Provide filtered dropdown options:

```typescript
{
  displayName: 'Options',
  name: 'options',
  type: 'collection',
  placeholder: 'Add option',
  default: {},
  options: [
    {
      displayName: 'File Type',
      name: 'fileType',
      type: 'options',
      options: [
        {
          name: '[All]',
          value: 'all',
        },
        {
          name: 'PDF',
          value: 'application/pdf',
        },
        {
          name: 'Image',
          value: 'image/*',
        },
      ],
      default: 'all',
      description: 'Filter by file type',
    },
  ],
}
```

### Notice Fields

Display informational messages to users:

```typescript
{
  displayName: 'Changes within subfolders won\'t trigger this node',
  name: 'subfolderNotice',
  type: 'notice',
  default: '',
  displayOptions: {
    show: {
      triggerOn: ['specificFolder'],
    },
  },
}
```

---

## Resource Locator Pattern

Resource locators provide three ways for users to specify resources: List (dropdown), URL, or ID.

### Node Property Definition

```typescript
{
  displayName: 'File',
  name: 'fileToWatch',
  type: 'resourceLocator',
  default: { mode: 'list', value: '' },
  required: true,
  modes: [
    {
      displayName: 'File',
      name: 'list',
      type: 'list',
      placeholder: 'Select a file...',
      typeOptions: {
        searchListMethod: 'fileSearch', // References method in listSearch
        searchable: true,
      },
    },
    {
      displayName: 'Link',
      name: 'url',
      type: 'string',
      placeholder: 'https://drive.google.com/file/d/1ABC.../edit',
      extractValue: {
        type: 'regex',
        regex: 'https://drive\\.google\\.com/file/d/([a-zA-Z0-9_-]+)',
      },
      validation: [
        {
          type: 'regex',
          properties: {
            regex: 'https://drive\\.google\\.com/file/d/([a-zA-Z0-9_-]+)',
            errorMessage: 'Not a valid Google Drive File URL',
          },
        },
      ],
    },
    {
      displayName: 'ID',
      name: 'id',
      type: 'string',
      placeholder: '1anGBg0b5re2VtF2bKu201_a-Vnz5BHq9Y4r-yBDAj5A',
      validation: [
        {
          type: 'regex',
          properties: {
            regex: '[a-zA-Z0-9\\-_]{2,}',
            errorMessage: 'Not a valid Google Drive File ID',
          },
        },
      ],
      url: '=https://drive.google.com/file/d/{{$value}}/view',
    },
  ],
}
```

### List Search Method Implementation

```typescript
methods = {
  listSearch: {
    async fileSearch(
      this: ILoadOptionsFunctions,
      filter?: string,
      paginationToken?: string,
    ): Promise<INodeListSearchResult> {
      const query = ['trashed = false'];

      // Add search filter
      if (filter) {
        const escapedFilter = filter.replace(/'/g, "\\'");
        query.push(`name contains '${escapedFilter}'`);
      }

      // Build query parameters
      const qs: IDataObject = {
        q: query.join(' AND '),
        fields: 'nextPageToken, files(id, name, mimeType, webViewLink)',
        pageSize: 50,
      };

      if (paginationToken) {
        qs.pageToken = paginationToken;
      }

      // Fetch results
      const response = await this.helpers.request({
        method: 'GET',
        url: 'https://www.googleapis.com/drive/v3/files',
        qs,
        json: true,
      });

      // Format results
      const results: INodeListSearchItems[] = response.files.map((file: any) => ({
        name: file.name,
        value: file.id,
        url: file.webViewLink,
      }));

      return {
        results,
        paginationToken: response.nextPageToken,
      };
    },
  },
};
```

### Extracting Resource Values

When retrieving the resource value in poll/webhook methods:

```typescript
// Extract ID from any mode (list, url, or id)
const fileId = this.getNodeParameter('fileToWatch', '', { extractValue: true }) as string;

// Or manually extract with helper function
function extractId(url: string): string {
  if (url.includes('/file/d/')) {
    return url.split('/file/d/')[1].split('/')[0];
  }
  if (url.includes('/folders/')) {
    return url.split('/folders/')[1].split('/')[0];
  }
  return url; // Already an ID
}
```

---

## Best Practices

### 1. State Management

**DO:**

- Update `lastTimeChecked` before returning from `poll()`
- Use UTC timestamps for consistency
- Initialize state on first run
- Store minimal necessary state

**DON'T:**

- Rely on state being updated automatically
- Use local timezones
- Store large objects in state

### 2. Error Handling

**Polling Triggers:**

```typescript
if (this.getMode() === 'manual') {
  if (!items || items.length === 0) {
    throw new NodeApiError(this.getNode(), {
      message: 'No data found with current filter',
    });
  }
}
```

**Webhook Triggers:**

```typescript
async delete(this: IHookFunctions): Promise<boolean> {
  try {
    await apiRequest.call(this, 'DELETE', endpoint);
  } catch (error) {
    // Ignore 404 - webhook already deleted
    if (error.httpCode !== '404') {
      throw error;
    }
  }
  return true;
}
```

### 3. Testing Considerations

Always handle manual mode for quick user feedback:

```typescript
if (this.getMode() === 'manual') {
  // Return 1 item immediately
  qs.pageSize = 1;
} else {
  // Fetch all new items with pagination
  qs.pageSize = 100;
}
```

### 4. Pagination Strategies

**For Polling:**

```typescript
// Use helper for automatic pagination
const items = await googleApiRequestAllItems.call(
  this,
  'files',
  'GET',
  '/drive/v3/files',
  {},
  qs,
);
```

**For List Search:**

```typescript
return {
  results: items,
  paginationToken: response.nextPageToken, // UI handles pagination
};
```

### 5. Timezone Handling

Always use UTC for consistency:

```typescript
import moment from 'moment-timezone';

const now = moment().utc().format(); // ISO 8601 UTC format
```

### 6. Return Value Guidelines

**Polling:**

- Return `null` when no new items (prevents workflow execution)
- Use `this.helpers.returnJsonArray(items)` to format data
- Wrap in array: `[this.helpers.returnJsonArray(items)]`

**Webhook:**

- Return `IWebhookResponseData` with `workflowData` property
- Use `this.helpers.returnJsonArray()` for consistency

---

## Common Pitfalls

### 1. Forgetting to Update State

**WRONG:**

```typescript
async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
  const webhookData = this.getWorkflowStaticData('node');
  const items = await fetchItems();

  if (items.length) {
    webhookData.lastTimeChecked = moment().utc().format(); // Only updates if items found
    return [this.helpers.returnJsonArray(items)];
  }

  return null; // State not updated!
}
```

**CORRECT:**

```typescript
async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
  const webhookData = this.getWorkflowStaticData('node');
  const items = await fetchItems();

  // Update state BEFORE returning
  webhookData.lastTimeChecked = moment().utc().format();

  if (items.length) {
    return [this.helpers.returnJsonArray(items)];
  }

  return null;
}
```

### 2. Not Handling Manual Mode

**WRONG:**

```typescript
async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
  // Always paginate all items (slow for testing)
  const items = await fetchAllItems();
  return [this.helpers.returnJsonArray(items)];
}
```

**CORRECT:**

```typescript
async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
  if (this.getMode() === 'manual') {
    const items = await fetchItems({ limit: 1 });
    if (!items.length) {
      throw new NodeApiError(this.getNode(), {
        message: 'No data found',
      });
    }
    return [this.helpers.returnJsonArray(items)];
  }

  // Automated mode
  const items = await fetchAllNewItems();
  return items.length ? [this.helpers.returnJsonArray(items)] : null;
}
```

### 3. Returning Empty Array Instead of Null

**WRONG:**

```typescript
if (items.length) {
  return [this.helpers.returnJsonArray(items)];
}
return []; // Triggers workflow with no data!
```

**CORRECT:**

```typescript
if (items.length) {
  return [this.helpers.returnJsonArray(items)];
}
return null; // Prevents workflow execution
```

### 4. Not Cleaning Up Webhook State

**WRONG:**

```typescript
async delete(this: IHookFunctions): Promise<boolean> {
  const webhookData = this.getWorkflowStaticData('node');
  await apiRequest.call(this, 'DELETE', `/webhooks/${webhookData.webhookId}`);
  // State not cleaned up!
  return true;
}
```

**CORRECT:**

```typescript
async delete(this: IHookFunctions): Promise<boolean> {
  const webhookData = this.getWorkflowStaticData('node');

  if (webhookData.webhookId !== undefined) {
    await apiRequest.call(this, 'DELETE', `/webhooks/${webhookData.webhookId}`);

    // Clean up state
    delete webhookData.webhookId;
    delete webhookData.webhookEvents;
  }

  return true;
}
```

### 5. Incorrect Resource Locator Extraction

**WRONG:**

```typescript
const fileId = this.getNodeParameter('fileToWatch') as string;
// Returns object like { mode: 'url', value: 'https://...' }
```

**CORRECT:**

```typescript
const fileId = this.getNodeParameter('fileToWatch', '', { extractValue: true }) as string;
// Returns extracted ID regardless of mode
```

---

## Complete Working Examples

### Example 1: Complete Polling Trigger with Resource Locator

```typescript
import moment from 'moment-timezone';
import type {
  IPollFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  INodeListSearchResult,
  INodeListSearchItems,
  IDataObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeApiError } from 'n8n-workflow';

export class MyServiceTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'My Service Trigger',
    name: 'myServiceTrigger',
    icon: 'file:myservice.svg',
    group: ['trigger'],
    version: 1,
    description: 'Starts the workflow when My Service events occur',
    polling: true,
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'myServiceApi',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Trigger On',
        name: 'triggerOn',
        type: 'options',
        required: true,
        default: 'specificItem',
        options: [
          {
            name: 'Specific Item',
            value: 'specificItem',
          },
          {
            name: 'All Items',
            value: 'allItems',
          },
        ],
      },
      {
        displayName: 'Item',
        name: 'itemToWatch',
        type: 'resourceLocator',
        default: { mode: 'list', value: '' },
        required: true,
        displayOptions: {
          show: {
            triggerOn: ['specificItem'],
          },
        },
        modes: [
          {
            displayName: 'Item',
            name: 'list',
            type: 'list',
            placeholder: 'Select an item...',
            typeOptions: {
              searchListMethod: 'itemSearch',
              searchable: true,
            },
          },
          {
            displayName: 'Link',
            name: 'url',
            type: 'string',
            placeholder: 'https://myservice.com/items/abc123',
            extractValue: {
              type: 'regex',
              regex: 'https://myservice\\.com/items/([a-zA-Z0-9_-]+)',
            },
            validation: [
              {
                type: 'regex',
                properties: {
                  regex: 'https://myservice\\.com/items/([a-zA-Z0-9_-]+)',
                  errorMessage: 'Not a valid My Service Item URL',
                },
              },
            ],
          },
          {
            displayName: 'ID',
            name: 'id',
            type: 'string',
            placeholder: 'abc123xyz',
            validation: [
              {
                type: 'regex',
                properties: {
                  regex: '[a-zA-Z0-9_-]{2,}',
                  errorMessage: 'Not a valid My Service Item ID',
                },
              },
            ],
            url: '=https://myservice.com/items/{{$value}}',
          },
        ],
      },
      {
        displayName: 'Watch For',
        name: 'event',
        type: 'options',
        required: true,
        default: 'itemUpdated',
        options: [
          {
            name: 'Item Created',
            value: 'itemCreated',
          },
          {
            name: 'Item Updated',
            value: 'itemUpdated',
          },
        ],
      },
    ],
  };

  methods = {
    listSearch: {
      async itemSearch(
        this: ILoadOptionsFunctions,
        filter?: string,
        paginationToken?: string,
      ): Promise<INodeListSearchResult> {
        const qs: IDataObject = {
          pageSize: 50,
        };

        if (filter) {
          qs.search = filter;
        }

        if (paginationToken) {
          qs.pageToken = paginationToken;
        }

        const response = await this.helpers.request({
          method: 'GET',
          url: 'https://api.myservice.com/items',
          qs,
          json: true,
        });

        const results: INodeListSearchItems[] = response.items.map((item: any) => ({
          name: item.name,
          value: item.id,
          url: `https://myservice.com/items/${item.id}`,
        }));

        return {
          results,
          paginationToken: response.nextPageToken,
        };
      },
    },
  };

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const webhookData = this.getWorkflowStaticData('node');
    const triggerOn = this.getNodeParameter('triggerOn') as string;
    const event = this.getNodeParameter('event') as string;

    const now = moment().utc().format();
    const startDate = (webhookData.lastTimeChecked as string) || now;
    const endDate = now;

    let items;

    if (this.getMode() === 'manual') {
      // Manual mode: fetch 1 item for testing
      const qs: IDataObject = { limit: 1 };

      if (triggerOn === 'specificItem') {
        const itemId = this.getNodeParameter('itemToWatch', '', { extractValue: true }) as string;
        qs.itemId = itemId;
      }

      const response = await this.helpers.request({
        method: 'GET',
        url: 'https://api.myservice.com/items',
        qs,
        json: true,
      });

      items = response.items;

      if (!items || items.length === 0) {
        throw new NodeApiError(this.getNode(), {
          message: 'No data with the current filter could be found',
        });
      }
    } else {
      // Automated mode: fetch all items since last check
      const qs: IDataObject = {};

      if (event === 'itemCreated') {
        qs.createdAfter = startDate;
      } else {
        qs.modifiedAfter = startDate;
      }

      if (triggerOn === 'specificItem') {
        const itemId = this.getNodeParameter('itemToWatch', '', { extractValue: true }) as string;
        qs.itemId = itemId;
      }

      const response = await this.helpers.request({
        method: 'GET',
        url: 'https://api.myservice.com/items',
        qs,
        json: true,
      });

      items = response.items;
    }

    // Update state before returning
    webhookData.lastTimeChecked = endDate;

    if (Array.isArray(items) && items.length) {
      return [this.helpers.returnJsonArray(items)];
    }

    return null;
  }
}
```

### Example 2: Complete Webhook Trigger

```typescript
import type {
  IHookFunctions,
  IWebhookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  INodeExecutionData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class MyServiceWebhookTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'My Service Webhook Trigger',
    name: 'myServiceWebhookTrigger',
    icon: 'file:myservice.svg',
    group: ['trigger'],
    version: 1,
    description: 'Starts the workflow when My Service webhook events occur',
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'myServiceApi',
        required: true,
      },
    ],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: 'webhook',
      },
    ],
    properties: [
      {
        displayName: 'Events',
        name: 'events',
        type: 'multiOptions',
        required: true,
        default: [],
        options: [
          {
            name: 'Item Created',
            value: 'item.created',
          },
          {
            name: 'Item Updated',
            value: 'item.updated',
          },
          {
            name: 'Item Deleted',
            value: 'item.deleted',
          },
        ],
        description: 'The events to listen for',
      },
    ],
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');

        if (webhookData.webhookId === undefined) {
          return false;
        }

        try {
          await this.helpers.request({
            method: 'GET',
            url: `https://api.myservice.com/webhooks/${webhookData.webhookId}`,
            json: true,
          });
          return true;
        } catch (error) {
          if (error.statusCode === 404) {
            delete webhookData.webhookId;
            delete webhookData.webhookEvents;
            return false;
          }
          throw error;
        }
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default') as string;
        const webhookData = this.getWorkflowStaticData('node');
        const events = this.getNodeParameter('events') as string[];

        const body = {
          url: webhookUrl,
          events: events,
          active: true,
        };

        const responseData = await this.helpers.request({
          method: 'POST',
          url: 'https://api.myservice.com/webhooks',
          body,
          json: true,
        });

        webhookData.webhookId = responseData.id as string;
        webhookData.webhookEvents = events;

        return true;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');

        if (webhookData.webhookId !== undefined) {
          try {
            await this.helpers.request({
              method: 'DELETE',
              url: `https://api.myservice.com/webhooks/${webhookData.webhookId}`,
              json: true,
            });
          } catch (error) {
            if (error.statusCode !== 404) {
              throw error;
            }
          }

          delete webhookData.webhookId;
          delete webhookData.webhookEvents;
        }

        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const bodyData = this.getBodyData();
    const headerData = this.getHeaderData();
    const queryData = this.getQueryData();

    // Handle ping/verification
    if (bodyData.type === 'ping') {
      return {
        webhookResponse: { status: 'ok' },
      };
    }

    // Process webhook event
    const returnData: INodeExecutionData[] = [];

    returnData.push({
      json: {
        event: bodyData.event,
        data: bodyData.data,
        timestamp: bodyData.timestamp,
        headers: headerData,
        query: queryData,
      },
    });

    return {
      workflowData: [returnData],
    };
  }
}
```

---

## Summary

This guide covers the essential patterns for building trigger nodes in n8n:

1. **Polling Triggers** - Use `IPollFunctions`, implement `poll()` method, manage state with `getWorkflowStaticData()`
2. **Webhook Triggers** - Use `IHookFunctions` for lifecycle, `IWebhookFunctions` for processing
3. **Resource Locators** - Provide flexible ways for users to specify resources (list, URL, ID)
4. **State Management** - Always update state before returning, use UTC timestamps
5. **Manual Mode Handling** - Provide fast feedback for testing with limited data
6. **Error Handling** - Gracefully handle API errors and missing data

By following these patterns, you'll create robust trigger nodes that integrate seamlessly with the n8n platform.

---

## References

- **Google Drive Trigger**: `/packages/nodes-base/nodes/Google/Drive/GoogleDriveTrigger.node.ts`
- **GitHub Trigger**: `/packages/nodes-base/nodes/Github/GithubTrigger.node.ts`
- **n8n Workflow Interfaces**: `/packages/workflow/src/interfaces.ts`
