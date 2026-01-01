# flow-conductor Documentation

Complete documentation for flow-conductor, a declarative API workflow orchestration library for Node.js.

## What is flow-conductor?

Flow-conductor is a **backend orchestration tool** for building complex API workflows. It's designed for scenarios where you need to:

- Chain multiple sequential HTTP requests where each depends on the previous result
- Handle complex error scenarios with compensation logic
- Transform data between workflow steps
- Build declarative, testable API workflows
- Process webhooks, build agent systems, or orchestrate microservices

**Flow-conductor is NOT:**
- A React data fetching library (use React Query or RTK Query instead)
- A caching solution (use Redis or similar)
- A replacement for simple `fetch()` or `axios` calls

## Table of Contents

- [Basic Usage](#basic-usage)
- [Advanced Features](#advanced-features)
- [Adapters](#adapters)
- [API Reference](#api-reference)
- [Common Patterns](#common-patterns)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## Basic Usage

### Real-World Example: Webhook Processing

Here's a complete example showing how flow-conductor simplifies complex workflows:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

async function processStripeWebhook(body: string, signature: string) {
  return begin(
    {
      config: {
        url: '/webhooks/stripe/validate',
        method: 'POST',
        data: { body, signature }
      }
    },
    adapter
  )
    .next({
      config: async (prev) => {
        const event = JSON.parse(body);
        return { url: `/orders/by-payment/${event.data.object.id}` };
      }
    })
    .next({
      config: async (prev) => {
        const order = await prev.json();
        return {
          url: `/orders/${order.id}`,
          method: 'PATCH',
          data: { status: 'paid' }
        };
      }
    })
    .next({
      config: async (prev) => {
        const order = await prev.json();
        return {
          url: '/inventory/reserve',
          method: 'POST',
          data: { orderId: order.id }
        };
      }
    })
    .withErrorHandler(async (error) => {
      // Example error handling - implement these functions in your application
      await logError('stripe-webhook', error);
      await rollbackIfNeeded(error);
    })
    .withFinishHandler(() => {
      metrics.increment('webhook.processed');
    })
    .execute();
}
```

### Simple GET Request

You can start a request chain using the exported `begin()` function:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

// Using begin()
const result1 = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' }
  },
  adapter
).execute();

// Using the begin() function (alternative syntax)
const result2 = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' }
  },
  adapter
).execute();

console.log(await result1.json()); // Response data
console.log(await result2.json()); // Response data
```

### Multiple Chained Requests

Chain multiple requests together. Each request can use the result from the previous one:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

// Each step can access the previous result
const result = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' }
  },
  adapter
)
  .next({
    // Use previous result to build the next request
    config: (previousResult) => {
      const user = await previousResult.json();
      return { 
        url: `https://api.example.com/users/${user.id}/posts`, 
        method: 'GET' 
      };
    }
  })
  .next({
    // Each subsequent step receives the previous step's result
    config: (previousResult) => {
      const posts = await previousResult.json();
      return { 
        url: `https://api.example.com/posts/${posts[0].id}/comments`, 
        method: 'GET' 
      };
    }
  })
  .execute();

// Returns the result of the last request
const comments = await result.json();
console.log(comments);
```

### Using Previous Results

Each `.next()` call receives the result from the previous request, allowing you to build dynamic request chains:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const result = await begin(
  {
    config: { 
      url: 'https://api.example.com/auth/login', 
      method: 'POST', 
      data: { username: 'user', password: 'pass' } 
    }
  },
  adapter
)
  .next({
    // Second request uses the auth token from the first request
    config: async (previousResult) => {
      const authData = await previousResult.json();
      return {
        url: 'https://api.example.com/api/user/profile',
        method: 'GET',
        headers: { Authorization: `Bearer ${authData.token}` }
      };
    }
  })
  .next({
    // Third request uses the user ID from the second request
    config: async (previousResult) => {
      const profile = await previousResult.json();
      return {
        url: `https://api.example.com/api/users/${profile.id}/settings`,
        method: 'GET'
      };
    }
  })
  .execute();

const settings = await result.json();
console.log(settings);
```

### Transforming Results with Mappers

Transform request results using mapper functions. Mapped results are then available to subsequent requests:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const result = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' }
  },
  adapter
)
  .next({
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    // Transform the result - this transformed value is passed to the next step
    mapper: async (result) => {
      const data = await result.json();
      return data.id; // Return just the ID
    }
  })
  .next({
    // The previous result is now the transformed ID (number), not the full response
    config: (previousResult) => ({
      url: `https://api.example.com/users/${previousResult}/posts`,
      method: 'GET'
    })
  })
  .execute();

console.log(await result.json());
```

**Note**: Mappers can be synchronous or asynchronous. If you need to parse JSON or perform async operations, use `async/await`.

### Result Interceptors

Result interceptors allow you to perform side effects or additional processing on the result of each stage in your request chain. Unlike mappers, interceptors don't transform the result - they receive the final result (after any mapper has been applied) and can perform actions like logging, caching, or validation.

**Key differences from mappers:**
- **Mappers** transform the result and change what gets passed to the next stage
- **Interceptors** receive the result but don't change it - they're for side effects only

#### Basic Result Interceptor

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const result = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    resultInterceptor: (result) => {
      console.log('First request completed:', result);
      // Perform side effects: logging, caching, analytics, etc.
    }
  },
  adapter
)
  .next({
    config: { url: 'https://api.example.com/users/1/posts', method: 'GET' },
    resultInterceptor: (result) => {
      console.log('Second request completed:', result);
    }
  })
  .execute();
```

#### Result Interceptor with Mapper

Interceptors receive the **mapped result**, not the raw response. This means if you use a mapper, the interceptor will receive the transformed value:

```typescript
const result = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    mapper: async (result) => {
      const data = await result.json();
      return data.id; // Transform to just the ID
    },
    resultInterceptor: (mappedResult) => {
      // Interceptor receives the mapped result (the ID), not the raw response
      console.log('User ID:', mappedResult); // Logs: User ID: 1
    }
  },
  adapter
).execute();
```

#### Async Result Interceptors

Interceptors can be asynchronous, allowing you to perform async operations like saving to a database or calling another API:

```typescript
const result = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    resultInterceptor: async (result) => {
      const data = await result.json();
      // Save to cache, database, or perform other async operations
      await cache.set(`user:${data.id}`, data);
      await analytics.track('user_fetched', { userId: data.id });
    }
  },
  adapter
).execute();
```

#### Execution Order

Interceptors are executed **after** mappers but **before** the result is stored and passed to the next stage:

1. Request executes
2. Mapper transforms the result (if present)
3. **Interceptor receives the mapped result** (if present)
4. Result is stored and passed to the next stage

```typescript
const executionOrder: string[] = [];

const result = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    mapper: async (result) => {
      executionOrder.push('mapper');
      const data = await result.json();
      return data.id;
    },
    resultInterceptor: (result) => {
      executionOrder.push('interceptor');
      console.log('Intercepted result:', result);
    }
  },
  adapter
).execute();

console.log(executionOrder); // ['mapper', 'interceptor']
```

#### Use Cases

Result interceptors are useful for:

- **Logging**: Track request results for debugging or monitoring
- **Caching**: Store results in cache for later use
- **Analytics**: Track API usage and performance metrics
- **Validation**: Verify result structure or content
- **Side effects**: Trigger notifications, update UI state, etc.

```typescript
const result = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    resultInterceptor: async (result) => {
      const data = await result.json();
      
      // Multiple side effects
      logger.info('User fetched', { userId: data.id });
      await cache.set(`user:${data.id}`, data, { ttl: 3600 });
      analytics.track('api_call', { endpoint: '/users/1', userId: data.id });
      
      // Validate result structure
      if (!data.id || !data.name) {
        throw new Error('Invalid user data structure');
      }
    }
  },
  adapter
).execute();
```

#### Skipped Stages

If a stage is skipped due to a precondition returning `false`, the result interceptor will **not** be called:

```typescript
const interceptorCalled = false;

const result = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    precondition: () => false, // Stage will be skipped
    resultInterceptor: (result) => {
      interceptorCalled = true; // This will never be called
    }
  },
  adapter
).execute();
```

**Note**: Result interceptors are executed for each stage that successfully completes. They receive the final result after any mapper transformation, making them perfect for side effects that don't need to modify the result itself.

### POST, PUT, DELETE, and Other Methods

All HTTP methods are supported:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

// POST request
const createResult = await begin(
  {
    config: {
      url: 'https://api.example.com/users',
      method: 'POST',
      data: { name: 'John Doe', email: 'john@example.com' }
    }
  },
  adapter
).execute();

// PUT request
const updateResult = await begin(
  {
    config: {
      url: 'https://api.example.com/users/1',
      method: 'PUT',
      data: { name: 'Jane Doe' }
    }
  },
  adapter
).execute();

// DELETE request
const deleteResult = await begin(
  {
    config: {
      url: 'https://api.example.com/users/1',
      method: 'DELETE'
    }
  },
  adapter
).execute();
```

## Advanced Features

### Handlers

Handlers allow you to react to different stages of request execution.

#### Result Handler

Handle successful results:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' }
  },
  adapter
)
  .withResultHandler(async (result) => {
    const data = await result.json();
    console.log('Request completed:', data);
  })
  .execute();
```

#### Error Handler

Flow-conductor supports two types of error handlers:

1. **Chain-level error handlers** - Handle errors for the entire chain using `.withErrorHandler()`
2. **Stage-level error handlers** - Handle errors for individual stages using the `errorHandler` property

##### Chain-Level Error Handler

Handle errors for the entire request chain:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' }
  },
  adapter
)
  .withErrorHandler((error) => {
    console.error('Request failed:', error.message);
    // Log to error tracking service, show user notification, etc.
  })
  .execute()
  .catch(() => {
    // Handle promise rejection if needed
  });
```

##### Stage-Level Error Handler

Handle errors for individual stages in the chain. Stage-level error handlers are called when a specific stage fails, before the error propagates to chain-level handlers:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    errorHandler: (error) => {
      // This handler is called if the first stage fails
      console.error('Failed to fetch user:', error.message);
      // Perform stage-specific error handling (logging, cleanup, etc.)
    }
  },
  adapter
)
  .next({
    config: { url: 'https://api.example.com/users/1/posts', method: 'GET' },
    errorHandler: (error) => {
      // This handler is called if the second stage fails
      console.error('Failed to fetch posts:', error.message);
    }
  })
  .execute()
  .catch(() => {
    // Handle promise rejection if needed
  });
```

**Key differences:**
- **Chain-level handlers** (`withErrorHandler()`) handle errors for the entire chain
- **Stage-level handlers** (`errorHandler` property) handle errors for specific stages
- Stage-level handlers are called **before** chain-level handlers
- Stage-level handlers are useful for stage-specific error handling, logging, or cleanup

##### Async Error Handlers

Both chain-level and stage-level error handlers support async operations:

```typescript
await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    errorHandler: async (error) => {
      // Perform async error handling
      await logErrorToService('user-fetch', error);
      await sendNotification('User fetch failed', error.message);
    }
  },
  adapter
).execute();
```

##### Error Handler Execution Order

When an error occurs, handlers are called in this order:

1. **Stage-level error handler** (if the failing stage has one)
2. **Chain-level error handler** (if set via `.withErrorHandler()`)
3. Error is thrown (can be caught with `.catch()`)

```typescript
await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    errorHandler: (error) => {
      console.log('1. Stage-level handler called');
    }
  },
  adapter
)
  .withErrorHandler((error) => {
    console.log('2. Chain-level handler called');
  })
  .execute()
  .catch((error) => {
    console.log('3. Promise rejection caught');
  });
```

##### Error Handler with Retry

Stage-level error handlers work seamlessly with retry mechanisms. The error handler is called **after** all retry attempts are exhausted:

```typescript
await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' },
    retry: {
      maxRetries: 3,
      retryDelay: 1000,
    },
    errorHandler: (error) => {
      // Called after all retries are exhausted
      console.error('Request failed after 3 retries:', error.message);
      // Log final failure, perform cleanup, etc.
    }
  },
  adapter
).execute();
```

##### Error Context Information

Error handlers receive additional context information through the `error.cause` property. This includes the request configuration that failed:

```typescript
await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' },
    errorHandler: (error) => {
      // Access request configuration from error.cause
      const requestConfig = error.cause?.requestConfig;
      
      if (requestConfig) {
        console.error('Failed request:', {
          url: requestConfig.url,
          method: requestConfig.method,
          error: error.message
        });
        // Use requestConfig for logging, retry logic, or error reporting
      }
    }
  },
  adapter
).execute();
```

**Important notes:**
- `error.cause.requestConfig` contains the request configuration for **request stages** (stages with `config` property)
- `error.cause.requestConfig` is `undefined` for **manager stages** (nested chains with `request` property)
- This information is available in both stage-level and chain-level error handlers
- The request config is the actual configuration object used for the request, including any dynamic values resolved from factory functions

##### Error Handler with Mapper

If an error occurs before a mapper executes, the error handler is called and the mapper is skipped:

```typescript
await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    mapper: async (result) => {
      // This won't be called if the request fails
      return await result.json();
    },
    errorHandler: (error) => {
      // This is called if the request fails (before mapper)
      console.error('Request failed, mapper skipped:', error.message);
    }
  },
  adapter
).execute();
```

##### Error Handler with Result Interceptor

If an error occurs, the error handler is called and the result interceptor is skipped:

```typescript
await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    resultInterceptor: (result) => {
      // This won't be called if the request fails
      console.log('Request succeeded:', result);
    },
    errorHandler: (error) => {
      // This is called if the request fails (before interceptor)
      console.error('Request failed, interceptor skipped:', error.message);
    }
  },
  adapter
).execute();
```

##### Error Handler with Precondition

Error handlers are only called if a stage actually executes. If a stage is skipped due to a precondition returning `false`, the error handler is not called:

```typescript
await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    precondition: () => false, // Stage is skipped
    errorHandler: (error) => {
      // This will never be called because the stage is skipped
    }
  },
  adapter
).execute();
```

##### Accessing Error Properties

Error handlers receive the full error object, allowing you to access custom properties:

```typescript
const customError = new Error('Custom error');
(customError as any).code = 'ERR_CUSTOM';
(customError as any).statusCode = 500;

await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' },
    errorHandler: (error) => {
      console.error('Error code:', (error as any).code);
      console.error('Status code:', (error as any).statusCode);
      console.error('Message:', error.message);
    }
  },
  adapter
).execute();
```

#### Finish Handler

Execute code after request completion (success or failure):

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const finishHandler = () => {
  console.log('Request chain finished');
  // Cleanup, hide loading indicators, etc.
};

await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' }
  },
  adapter
)
  .withErrorHandler((error) => {
    console.error('Error:', error.message);
  })
  .withFinishHandler(finishHandler)
  .execute()
  .catch(() => {
    // Handle promise rejection
  });
```

#### Combining All Handlers

Use multiple handlers together:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' }
  },
  adapter
)
  .withResultHandler(async (result) => {
    const data = await result.json();
    console.log('Success:', data);
  })
  .withErrorHandler((error) => {
    console.error('Error:', error);
  })
  .withFinishHandler(() => {
    console.log('Finished');
  })
  .execute()
  .catch(() => {
    // Handle promise rejection
  });
```

### Retry Mechanism

flow-conductor includes a powerful retry mechanism that automatically retries failed requests based on configurable conditions. This is especially useful for handling transient network errors or temporary server issues.

#### Basic Retry Configuration

Retry failed requests with default settings (retries on network errors):

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const result = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' },
    retry: {
      maxRetries: 3, // Retry up to 3 times
    }
  },
  adapter
).execute();
```

#### Retry on Specific Status Codes

Retry on specific HTTP status codes (e.g., 5xx server errors or 429 rate limits):

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
import { retryOnStatusCodes } from '@flow-conductor/core';

const adapter = new FetchRequestAdapter();

const result = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' },
    retry: {
      maxRetries: 5,
      retryCondition: retryOnStatusCodes(500, 502, 503, 504, 429)
    }
  },
  adapter
).execute();
```

#### Retry on Network Errors or Status Codes

Retry on both network errors and specific HTTP status codes:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
import { retryOnNetworkOrStatusCodes } from '@flow-conductor/core';

const adapter = new FetchRequestAdapter();

const result = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' },
    retry: {
      maxRetries: 3,
      retryCondition: retryOnNetworkOrStatusCodes(500, 502, 503, 504, 429)
    }
  },
  adapter
).execute();
```

#### Custom Retry Condition

Define custom logic for when to retry:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
import { getErrorStatus } from '@flow-conductor/core';

const adapter = new FetchRequestAdapter();

const result = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' },
    retry: {
      maxRetries: 3,
      retryCondition: (error, attempt) => {
        // Retry on 5xx errors or rate limits (429)
        const status = getErrorStatus(error);
        if (status !== undefined) {
          return status >= 500 || status === 429;
        }
        // Retry on network errors for first 2 attempts
        return attempt < 2;
      }
    }
  },
  adapter
).execute();
```

#### Retry Delays

Configure delays between retry attempts:

**Fixed Delay:**

```typescript
const result = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' },
    retry: {
      maxRetries: 3,
      retryDelay: 1000 // Wait 1 second between retries
    }
  },
  adapter
).execute();
```

**Exponential Backoff:**

```typescript
const result = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' },
    retry: {
      maxRetries: 5,
      retryDelay: 1000, // Start with 1 second
      exponentialBackoff: true, // Double delay each time: 1s, 2s, 4s, 8s...
      maxDelay: 10000 // Cap at 10 seconds
    }
  },
  adapter
).execute();
```

**Custom Delay Function:**

```typescript
const result = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' },
    retry: {
      maxRetries: 3,
      retryDelay: (attempt, error) => {
        // Custom delay logic based on attempt number and error
        const status = getErrorStatus(error);
        if (status === 429) {
          // Rate limited - wait longer
          return 5000;
        }
        // Exponential backoff: 1s, 2s, 4s
        return 1000 * Math.pow(2, attempt - 1);
      }
    }
  },
  adapter
).execute();
```

#### Retry Configuration Options

The `retry` configuration object supports the following options:

- **`maxRetries`** (number, default: `3`): Maximum number of retry attempts
- **`retryDelay`** (number | function, default: `1000`): Delay in milliseconds between retries. Can be a fixed number or a function `(attempt: number, error: Error) => number`
- **`exponentialBackoff`** (boolean, default: `false`): Whether to use exponential backoff (doubles delay each retry)
- **`maxDelay`** (number): Maximum delay cap when using exponential backoff
- **`retryCondition`** (function, default: retries on network errors): Function that determines whether to retry: `(error: Error, attempt: number) => boolean`

#### Retry Helpers

flow-conductor provides helper functions for common retry scenarios:

- **`retryOnStatusCodes(...codes: number[])`**: Creates a retry condition that retries on specific HTTP status codes
- **`retryOnNetworkOrStatusCodes(...codes: number[])`**: Creates a retry condition that retries on network errors OR specific status codes
- **`getErrorStatus(error: Error)`**: Extracts HTTP status code from error objects (works with all adapters)
- **`isNetworkError(error: Error)`**: Checks if an error is a network error

#### Important Notes

- **Retry only applies to request stages**: Retry configuration is only applied to `PipelineRequestStage` (HTTP requests), not to nested `PipelineManagerStage` (nested chains)
- **Default behavior**: If no `retryCondition` is provided, retries only occur on network errors (connection failures, timeouts, etc.)
- **Error handling**: After all retries are exhausted, the error is thrown and can be caught by error handlers or `.catch()`
- **Per-stage configuration**: Each stage in a chain can have its own retry configuration

### Progressive Chunk Processing

flow-conductor supports progressive chunk processing for streaming responses, allowing you to process large responses incrementally without loading everything into memory. This is especially useful for handling large files, streaming APIs, or Server-Sent Events (SSE).

#### Basic Chunk Processing

Process streaming responses chunk by chunk as they arrive:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const processedChunks: Uint8Array[] = [];

await begin(
  {
    config: { url: 'https://api.example.com/large-file', method: 'GET' },
    chunkProcessing: {
      enabled: true,
      chunkHandler: async (chunk, metadata) => {
        console.log(`Processing chunk ${metadata.index}:`, chunk);
        processedChunks.push(chunk);
        // Process chunk incrementally (e.g., write to file, parse JSON, etc.)
        await processChunk(chunk);
      },
    },
  },
  adapter
).execute();
```

#### Chunk Handler Metadata

The chunk handler receives metadata about each chunk:

```typescript
chunkProcessing: {
  enabled: true,
  chunkHandler: (chunk, metadata) => {
    console.log(`Chunk index: ${metadata.index}`);
    console.log(`Is last chunk: ${metadata.isLast}`);
    console.log(`Total bytes read: ${metadata.totalBytesRead}`);
  },
}
```

#### Accumulating Chunks

You can accumulate chunks and get the complete result:

```typescript
const result = await begin(
  {
    config: { url: 'https://api.example.com/data', method: 'GET' },
    chunkProcessing: {
      enabled: true,
      chunkHandler: (chunk) => {
        console.log('Received chunk:', chunk);
      },
      accumulate: true, // Accumulate all chunks
    },
  },
  adapter
).execute();

// Result will be the accumulated data (Uint8Array or string)
if (result instanceof Uint8Array) {
  const text = new TextDecoder().decode(result);
  console.log('Complete data:', text);
}
```

#### Text Stream Processing

Process text streams with custom encoding:

```typescript
await begin(
  {
    config: { url: 'https://api.example.com/text-stream', method: 'GET' },
    chunkProcessing: {
      enabled: true,
      chunkHandler: (chunk) => {
        // Chunk will be Uint8Array, decode as needed
        const text = new TextDecoder('utf-8').decode(chunk);
        console.log('Text chunk:', text);
      },
      encoding: 'utf-8', // Default encoding
    },
  },
  adapter
).execute();
```

#### Processing Line-by-Line (NDJSON, CSV)

For line-delimited data (NDJSON, CSV, logs), you can process chunks and split by newlines:

```typescript
let buffer = '';

await begin(
  {
    config: { url: 'https://api.example.com/ndjson-stream', method: 'GET' },
    chunkProcessing: {
      enabled: true,
      chunkHandler: (chunk) => {
        // Decode chunk and process line by line
        const decoder = new TextDecoder('utf-8');
        buffer += decoder.decode(chunk, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim()) {
            const data = JSON.parse(line); // Process each JSON line
            console.log('Parsed line:', data);
          }
        }
      },
      encoding: 'utf-8',
    },
  },
  adapter
).execute();
```

#### Chunk Processing with Mappers

Chunk processing works seamlessly with mappers:

```typescript
await begin(
  {
    config: { url: 'https://api.example.com/stream', method: 'GET' },
    chunkProcessing: {
      enabled: true,
      chunkHandler: (chunk) => {
        console.log('Processing chunk:', chunk);
      },
    },
    mapper: async (result) => {
      // Mapper receives the final result (Response or accumulated data)
      if (result instanceof Response) {
        return await result.json();
      }
      return result;
    },
  },
  adapter
).execute();
```

#### Chunk Processing with Retry

Chunk processing works with retry mechanisms:

```typescript
await begin(
  {
    config: { url: 'https://api.example.com/stream', method: 'GET' },
    chunkProcessing: {
      enabled: true,
      chunkHandler: (chunk) => {
        console.log('Chunk:', chunk);
      },
    },
    retry: {
      maxRetries: 3,
      retryDelay: 1000,
      retryCondition: (error) => {
        // Retry on network errors
        return error.name === 'TypeError';
      },
    },
  },
  adapter
).execute();
```

#### Use Cases

Progressive chunk processing is ideal for:

- **Large file downloads**: Process files incrementally without loading everything into memory
- **Streaming APIs**: Handle real-time data streams (e.g., Server-Sent Events)
- **NDJSON/CSV processing**: Process line-delimited data formats
- **Log processing**: Stream and process log files
- **Data transformation**: Transform large datasets incrementally

#### Important Notes

- **Streaming support**: Chunk processing works with responses that have readable streams (e.g., Fetch API `Response.body`)
- **Memory efficiency**: When `accumulate` is `false`, chunks are processed without storing them in memory
- **Non-streaming responses**: If a response doesn't support streaming, chunk processing is skipped gracefully
- **Adapter compatibility**: Works best with Fetch-based adapters that support ReadableStream

### Executing All Requests

#### Get All Results

Execute all requests and get all results as an array. Each step can use the previous result:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const results = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' }
  },
  adapter
)
  .next({
    // Use previous result to build next request
    config: async (previousResult) => {
      const user = await previousResult.json();
      return { 
        url: `https://api.example.com/users/${user.id}/posts`, 
        method: 'GET' 
      };
    }
  })
  .next({
    // Use previous result (posts) to get comments
    config: async (previousResult) => {
      const posts = await previousResult.json();
      return { 
        url: `https://api.example.com/posts/${posts[0].id}/comments`, 
        method: 'GET' 
      };
    },
    mapper: async (result) => {
      const comments = await result.json();
      return comments.length; // Transform to count
    }
  })
  .executeAll();

const user = await results[0].json(); // First request result (user)
const posts = await results[1].json(); // Second request result (posts)
const commentCount = results[2]; // Third request result (transformed comment count)

console.log(user, posts, commentCount);
```

#### Execute All with Result Handler

Handle all results together. Each step builds on the previous one:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const resultHandler = async (results) => {
  console.log('All results:', results);
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result instanceof Response) {
      const data = await result.json();
      console.log(`Request ${i + 1}:`, data);
    } else {
      console.log(`Request ${i + 1}:`, result);
    }
  }
};

await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' }
  },
  adapter
)
  .next({
    // Second request uses user ID from first request
    config: async (previousResult) => {
      const user = await previousResult.json();
      return { 
        url: `https://api.example.com/users/${user.id}/posts`, 
        method: 'GET' 
      };
    }
  })
  .next({
    // Third request uses first post ID from second request
    config: async (previousResult) => {
      const posts = await previousResult.json();
      return { 
        url: `https://api.example.com/posts/${posts[0].id}/comments`, 
        method: 'GET' 
      };
    },
    mapper: async (result) => {
      const comments = await result.json();
      return comments[0]?.name;
    }
  })
  .withResultHandler(resultHandler)
  .executeAll();
```

#### Execute All with Error Handler

Handle errors when executing all requests. Each step depends on the previous:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' }
  },
  adapter
)
  .next({
    // Uses previous result
    config: async (previousResult) => {
      const user = await previousResult.json();
      return { 
        url: `https://api.example.com/users/${user.id}/posts`, 
        method: 'GET' 
      };
    }
  })
  .next({
    // Uses previous result
    config: async (previousResult) => {
      const posts = await previousResult.json();
      return { 
        url: `https://api.example.com/posts/${posts[0].id}`, 
        method: 'GET' 
      };
    }
  })
  .withResultHandler(async (results) => {
    console.log('Success:', results);
  })
  .withErrorHandler((error) => {
    console.error('Error occurred:', error.message);
  })
  .executeAll();
```

### Nested Request Managers

Chain request managers together. Nested chains can also use previous results:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

// Create a nested chain that uses the parent result
const nestedChain = begin(
  {
    config: async (previousResult) => {
      const user = await previousResult.json();
      return { 
        url: `https://api.example.com/users/${user.id}/posts`, 
        method: 'GET' 
      };
    }
  },
  adapter
);

const result = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' }
  },
  adapter
)
  .next({ request: nestedChain }) // Nested chain receives the previous result
  .execute();

console.log(await result.json());
```

Alternatively, using the `begin()` function:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const nestedChain = begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' }
  },
  adapter
);

const result = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' }
  },
  adapter
)
  .next({ request: nestedChain })
  .execute();
```

### Adding Multiple Requests at Once

Use `addAll()` to add multiple requests to a chain:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const chain = begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' }
  },
  adapter
);

// Add multiple requests at once
chain.addAll([
  {
    config: { url: 'https://api.example.com/posts', method: 'GET' }
  },
  {
    config: { url: 'https://api.example.com/comments', method: 'GET' }
  }
]);

const results = await chain.executeAll();
```

## Adapters

Adapters are responsible for executing the actual HTTP requests. Flow-conductor uses a **modular adapter system** that allows you to choose the HTTP library that best fits your needs. Each adapter is a separate package.

### Available Adapters

Flow-conductor provides three official adapters, each optimized for different use cases:

#### 1. Fetch Adapter (Recommended for most cases)

The Fetch adapter uses the native Fetch API, available in Node.js 18+ and modern browsers. **No additional dependencies required.**

**Installation:**
```bash
npm install @flow-conductor/adapter-fetch @flow-conductor/core
# Or install main package and use subpath exports:
npm install flow-conductor
```

**Usage:**
```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
// Or using main package with subpath exports:
// import { begin } from 'flow-conductor';
// import { FetchRequestAdapter } from 'flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const result = await begin(
  { 
    config: { 
      url: 'https://api.example.com/users', 
      method: 'GET' 
    } 
  },
  adapter
).execute();

const data = await result.json(); // Standard Response object
```

**Best for:** Modern Node.js applications, browser environments, minimal bundle size

**Features:**
- Zero dependencies (uses native Fetch API)
- Standard `Response` object
- Automatic JSON stringification for request bodies
- Supports all Fetch API options

**Important Notes:**
- ⚠️ **No default timeout**: You must configure timeouts manually using `AbortSignal.timeout()` (Node.js 18+) or `AbortController`:

```typescript
// Set a 5-second timeout
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

const result = await begin(
  {
    config: {
      url: 'https://api.example.com/users',
      method: 'GET',
      signal: controller.signal
    }
  },
  adapter
).execute();

clearTimeout(timeoutId);
```

#### 2. Node-Fetch Adapter

The Node-Fetch adapter uses the `node-fetch` package, making it ideal for Node.js environments where you need a reliable HTTP client with consistent behavior across Node.js versions.

**Installation:**
```bash
npm install @flow-conductor/adapter-node-fetch @flow-conductor/core node-fetch
# Or install main package and use subpath exports:
npm install flow-conductor node-fetch
```

**Usage:**
```typescript
import { begin } from '@flow-conductor/core';
import { NodeFetchRequestAdapter } from '@flow-conductor/adapter-node-fetch';
// Or using main package with subpath exports:
// import { begin } from 'flow-conductor';
// import { NodeFetchRequestAdapter } from 'flow-conductor/adapter-node-fetch';

const adapter = new NodeFetchRequestAdapter();

const result = await begin(
  { 
    config: { 
      url: 'https://api.example.com/users', 
      method: 'GET' 
    } 
  },
  adapter
).execute();

const data = await result.json(); // Standard Response object
```

**Best for:** Node.js-only applications, projects that prefer node-fetch over native fetch

**Features:**
- Uses `node-fetch` package (explicit dependency)
- Standard `Response` object
- Automatic JSON stringification for request bodies
- Supports all node-fetch options
- Consistent API across Node.js versions

**Important Notes:**
- ⚠️ **Requires node-fetch**: You must install `node-fetch` v3.x as a peer dependency
- ⚠️ **Node.js only**: This adapter is designed for Node.js environments only
- ⚠️ **ESM only**: node-fetch v3 is ESM-only, ensure your project uses `"type": "module"` in package.json
- ⚠️ **No default timeout**: You must configure timeouts manually using the `timeout` option:

```typescript
const result = await begin(
  {
    config: {
      url: 'https://api.example.com/users',
      method: 'GET',
      timeout: 5000 // 5 second timeout
    }
  },
  adapter
).execute();
```

#### 3. Axios Adapter

The Axios adapter provides automatic JSON parsing, better error handling, and request/response interceptors.

**Installation:**
```bash
npm install @flow-conductor/adapter-axios @flow-conductor/core axios
# Or install main package and use subpath exports:
npm install flow-conductor axios
```

**Usage:**
```typescript
import { begin } from '@flow-conductor/core';
import { AxiosRequestAdapter } from '@flow-conductor/adapter-axios';
// Or using main package with subpath exports:
// import { begin } from 'flow-conductor';
// import { AxiosRequestAdapter } from 'flow-conductor/adapter-axios';

const adapter = new AxiosRequestAdapter();

const result = await begin(
  { 
    config: { 
      url: 'https://api.example.com/users', 
      method: 'GET' 
    } 
  },
  adapter
).execute();

console.log(result.data); // Already parsed JSON - no .json() needed!
console.log(result.status); // HTTP status code
```

**Best for:** Applications already using Axios, need interceptors, or prefer automatic JSON parsing

**Features:**
- Automatic JSON parsing (no `.json()` calls needed)
- Better error handling (throws on HTTP errors)
- Request/response interceptors support
- Query parameters via `params` option
- Request cancellation support

**Important Notes:**
- ⚠️ **No default timeout**: You must configure timeouts manually using the `timeout` option:

```typescript
const result = await begin(
  {
    config: {
      url: 'https://api.example.com/users',
      method: 'GET',
      timeout: 5000 // 5 second timeout
    }
  },
  adapter
).execute();
```

#### 4. Superagent Adapter

The Superagent adapter offers a lightweight alternative with excellent browser and Node.js support.

**Installation:**
```bash
npm install @flow-conductor/adapter-superagent @flow-conductor/core superagent
# Or install main package and use subpath exports:
npm install flow-conductor superagent
```

**Usage:**
```typescript
import { begin } from '@flow-conductor/core';
import { SuperagentRequestAdapter } from '@flow-conductor/adapter-superagent';
// Or using main package with subpath exports:
// import { begin } from 'flow-conductor';
// import { SuperagentRequestAdapter } from 'flow-conductor/adapter-superagent';

const adapter = new SuperagentRequestAdapter();

const result = await begin(
  { 
    config: { 
      url: 'https://api.example.com/users', 
      method: 'GET' 
    } 
  },
  adapter
).execute();

console.log(result.body); // Already parsed JSON
console.log(result.status); // HTTP status code
```

**Best for:** Cross-platform applications, lightweight requirements, fluent API preference

**Features:**
- Automatic JSON parsing
- Cross-platform (browser & Node.js)
- Lightweight bundle size
- Fluent API design

**Important Notes:**
- ⚠️ **No default timeout**: You must configure timeouts manually using the `timeout` option:

```typescript
const result = await begin(
  {
    config: {
      url: 'https://api.example.com/users',
      method: 'GET',
      timeout: 5000 // 5 second timeout
    }
  },
  adapter
).execute();
```

### Importing Adapters

You can import adapters in three ways:

**Option 1: From individual packages**
```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
```

**Option 2: Using subpath exports from main package**
```typescript
import { begin } from 'flow-conductor';
import { FetchRequestAdapter } from 'flow-conductor/adapter-fetch';
```

**Option 3: Using subpath exports for all adapters**
```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
import { NodeFetchRequestAdapter } from '@flow-conductor/adapter-node-fetch';
import { AxiosRequestAdapter } from '@flow-conductor/adapter-axios';
import { SuperagentRequestAdapter } from '@flow-conductor/adapter-superagent';
```

**Important**: The main package (`flow-conductor`) only exports core functionality. Adapters must be imported from their respective subpath exports (`flow-conductor/adapter-*`) or from individual packages (`@flow-conductor/adapter-*`).

### Adapter Comparison

| Feature | Fetch | Node-Fetch | Axios | Superagent |
|---------|-------|------------|-------|------------|
| Dependencies | None (native) | node-fetch | axios | superagent |
| JSON Parsing | Manual (`.json()`) | Manual (`.json()`) | Automatic | Automatic |
| Error Handling | Manual status checks | Manual status checks | Automatic throws | Automatic throws |
| Bundle Size | Smallest | Small | Medium | Small |
| Interceptors | ❌ | ❌ | ✅ | ❌ |
| Query Params | URL string | URL string | `params` option | URL string |
| Browser Support | Modern browsers | ❌ (Node.js only) | All | All |
| Node.js Support | 18+ | 18+ | All versions | All versions |
| Environment | Browser + Node.js | Node.js only | Browser + Node.js | Browser + Node.js |

### Switching Adapters

All adapters share the same interface, making it easy to switch:

```typescript
// Easy to swap adapters - same API!
const fetchAdapter = new FetchRequestAdapter();
const nodeFetchAdapter = new NodeFetchRequestAdapter();
const axiosAdapter = new AxiosRequestAdapter();
const superagentAdapter = new SuperagentRequestAdapter();

// Use any adapter with the same code
const result = await begin(
  { config: { url: '...', method: 'GET' } },
  fetchAdapter // or nodeFetchAdapter, axiosAdapter, or superagentAdapter
).execute();
```

### Creating Custom Adapters

The modular adapter system makes it easy to create custom adapters for any HTTP library. All adapters extend the base `RequestAdapter` class:

```typescript
import { RequestAdapter, IRequestConfig } from '@flow-conductor/core';
// Or from the main package:
// import { RequestAdapter, IRequestConfig } from '@flow-conductor/core';
// Note: Adapters themselves must be imported from subpath exports or individual packages

class CustomAdapter extends RequestAdapter<Response, IRequestConfig> {
  public async createRequest(requestConfig: IRequestConfig): Promise<Response> {
    // Custom request logic
    const response = await fetch(requestConfig.url, {
      method: requestConfig.method,
      headers: {
        'X-Custom-Header': 'value',
        ...requestConfig.headers
      },
      body: requestConfig.data ? JSON.stringify(requestConfig.data) : undefined
    });
    return response;
  }

  public getResult(result: Response): Response {
    // Transform result if needed
    return result;
  }
}

const adapter = new CustomAdapter();
const result = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' }
  },
  adapter
).execute();
```

**Benefits of the modular adapter system:**
- ✅ **Consistent API**: All adapters work the same way
- ✅ **Type-safe**: Full TypeScript support for custom adapters
- ✅ **Independent packages**: Publish your adapter separately
- ✅ **Easy testing**: Mock adapters for unit tests

For a complete guide on creating adapters, see the [adapter template](./packages/ADAPTER_TEMPLATE.md).

## Common Patterns

### Webhook Processing Pipeline

A common use case for flow-conductor is processing webhooks that require multiple sequential API calls:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

async function processPaymentWebhook(paymentId: string) {
  return begin(
    {
      config: {
        url: `/api/payments/${paymentId}`,
        method: 'GET'
      }
    },
    adapter
  )
    .next({
      config: async (prev) => {
        const payment = await prev.json();
        return {
          url: `/api/orders/${payment.orderId}`,
          method: 'PATCH',
          data: { status: 'paid', paymentId: payment.id }
        };
      }
    })
    .next({
      config: async (prev) => {
        const order = await prev.json();
        return {
          url: '/api/inventory/reserve',
          method: 'POST',
          data: { orderId: order.id, items: order.items }
        };
      }
    })
    .next({
      config: async (prev) => {
        const order = await prev.json();
        return {
          url: '/api/emails/send',
          method: 'POST',
          data: {
            to: order.customer.email,
            template: 'order-confirmation',
            orderId: order.id
          }
        };
      }
    })
    .withErrorHandler(async (error) => {
      // Centralized error handling with compensation
      await logError('payment-webhook', error);
      if (error.step === 'inventory') {
        // Rollback order status
        await fetch(`/api/orders/${error.context.orderId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'pending' })
        });
      }
    })
    .withFinishHandler(() => {
      metrics.increment('webhook.payment.processed');
    })
    .execute();
}
```

### Authentication Flow

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

// Login and use token for subsequent requests
const userData = await begin(
  {
    config: {
      url: 'https://api.example.com/auth/login',
      method: 'POST',
      data: { username: 'user', password: 'pass' }
    }
  },
  adapter
)
  .next({
    config: async (previousResult) => {
      const auth = await previousResult.json();
      return {
        url: 'https://api.example.com/user/profile',
        method: 'GET',
        headers: { Authorization: `Bearer ${auth.token}` }
      };
    }
  })
  .execute();

console.log(await userData.json());
```

### Data Aggregation

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

// Fetch user, then their posts, then comments
const allData = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' }
  },
  adapter
)
  .next({
    config: async (previousResult) => {
      const user = await previousResult.json();
      return {
        url: `https://api.example.com/users/${user.id}/posts`,
        method: 'GET'
      };
    }
  })
  .next({
    config: async (previousResult) => {
      const posts = await previousResult.json();
      return {
        url: `https://api.example.com/posts/${posts[0].id}/comments`,
        method: 'GET'
      };
    }
  })
  .executeAll();

const [user, posts, comments] = await Promise.all([
  allData[0].json(),
  allData[1].json(),
  allData[2].json()
]);

console.log({ user, posts, comments });
```

### Error Recovery

Flow-conductor provides multiple ways to handle errors:

#### Chain-Level Error Recovery

Handle errors for the entire chain:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

try {
  const result = await begin(
    {
      config: { url: 'https://api.example.com/users', method: 'GET' }
    },
    adapter
  )
    .withErrorHandler((error) => {
      // Log error but don't throw
      console.error('Request failed:', error);
      // Access request configuration from error.cause
      const requestConfig = error.cause?.requestConfig;
      if (requestConfig) {
        console.error('Failed request details:', {
          url: requestConfig.url,
          method: requestConfig.method
        });
      }
    })
    .execute();
  
  console.log(await result.json());
} catch (error) {
  // Handle final error if needed
  console.error('Chain execution failed:', error);
}
```

#### Stage-Level Error Recovery

Handle errors for individual stages with stage-specific recovery logic:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

try {
  const result = await begin(
    {
      config: { url: 'https://api.example.com/users/1', method: 'GET' },
      errorHandler: async (error) => {
        // Stage-specific error handling
        console.error('Failed to fetch user:', error.message);
        // Access request configuration from error.cause
        const requestConfig = error.cause?.requestConfig;
        await logError('user-fetch', error, requestConfig);
      }
    },
    adapter
  )
    .next({
      config: { url: 'https://api.example.com/users/1/posts', method: 'GET' },
      errorHandler: async (error) => {
        // Different handling for posts stage
        console.error('Failed to fetch posts:', error.message);
        // Access request configuration from error.cause
        const requestConfig = error.cause?.requestConfig;
        await logError('posts-fetch', error, requestConfig);
        // Could perform stage-specific cleanup or fallback
      }
    })
    .withErrorHandler((error) => {
      // Chain-level handler called after stage handlers
      console.error('Chain failed:', error.message);
      // Access request configuration from error.cause
      const requestConfig = error.cause?.requestConfig;
      if (requestConfig) {
        console.error('Failed at:', requestConfig.url);
      }
    })
    .execute();
  
  console.log(await result.json());
} catch (error) {
  // Final error handling
  console.error('Execution failed:', error);
}
```

#### Combining Stage and Chain Error Handlers

Use both stage-level and chain-level handlers for comprehensive error handling:

```typescript
const result = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    errorHandler: (error) => {
      // Stage-specific: log, cleanup, or perform recovery
      console.error('User fetch failed:', error);
      // Access request configuration from error.cause
      const requestConfig = error.cause?.requestConfig;
      if (requestConfig) {
        console.error('Failed request:', requestConfig.url);
      }
      // Could return a default value or perform fallback logic
    }
  },
  adapter
)
  .next({
    config: { url: 'https://api.example.com/users/1/posts', method: 'GET' },
    errorHandler: (error) => {
      // Stage-specific: handle posts fetch failure
      console.error('Posts fetch failed:', error);
      // Access request configuration from error.cause
      const requestConfig = error.cause?.requestConfig;
      if (requestConfig) {
        console.error('Failed request:', requestConfig.url);
      }
    }
  })
  .withErrorHandler((error) => {
    // Chain-level: centralized error handling
    // Called after stage handlers
    metrics.increment('chain.errors');
    // Access request configuration from error.cause
    const requestConfig = error.cause?.requestConfig;
    if (requestConfig) {
      notifyAdmin('Chain execution failed', { error, failedAt: requestConfig.url });
    } else {
      notifyAdmin('Chain execution failed', error);
    }
  })
  .execute();
```

### Retry with Exponential Backoff

Handle transient failures with automatic retry and exponential backoff:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
import { retryOnNetworkOrStatusCodes } from '@flow-conductor/core';

const adapter = new FetchRequestAdapter();

const result = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' },
    retry: {
      maxRetries: 5,
      retryDelay: 1000, // Start with 1 second
      exponentialBackoff: true, // Double each time: 1s, 2s, 4s, 8s, 16s
      maxDelay: 10000, // Cap at 10 seconds
      retryCondition: retryOnNetworkOrStatusCodes(500, 502, 503, 504, 429)
    }
  },
  adapter
).execute();

console.log(await result.json());
```

### Conditional Requests

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const shouldFetchPosts = true;

const chain = begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' }
  },
  adapter
);

if (shouldFetchPosts) {
  chain.next({
    config: async (previousResult) => {
      const user = await previousResult.json();
      return {
        url: `https://api.example.com/users/${user.id}/posts`,
        method: 'GET'
      };
    }
  });
}

const result = await chain.execute();
```

## API Reference

### RequestChain

The main class for creating and managing request chains.

#### Static Methods

- `RequestChain.begin<Out, AdapterExecutionResult, AdapterRequestConfig>(stage: PipelineRequestStage | PipelineManagerStage, adapter: RequestAdapter): RequestChain` - Start a new request chain

#### Instance Methods

- `next<NewOut>(stage: PipelineRequestStage | PipelineManagerStage): RequestChain` - Add the next request to the chain
- `execute(): Promise<Out>` - Execute the chain and return the last result
- `executeAll(): Promise<Types>` - Execute all requests and return all results as a tuple
- `setRequestAdapter(adapter: RequestAdapter): RequestManager` - Set a custom request adapter
- `addAll(stages: Array<PipelineRequestStage | PipelineManagerStage>): RequestManager` - Add multiple requests at once
- `withResultHandler(handler: ResultHandler): RequestManager` - Set result handler
- `withErrorHandler(handler: ErrorHandler): RequestManager` - Set error handler
- `withFinishHandler(handler: VoidFunction): RequestManager` - Set finish handler

### Exported Functions

- `begin<Out, AdapterExecutionResult, AdapterRequestConfig>(stage: PipelineRequestStage | PipelineManagerStage, adapter: RequestAdapter): RequestChain` - Alternative function to start a request chain (same as `RequestChain.begin`)

### Types

#### IRequestConfig

```typescript
interface IRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'CONNECT' | 'TRACE';
  data?: any;
  headers?: Record<string, string>;
  [key: string]: any; // Additional adapter-specific options
}
```

#### PipelineRequestStage

```typescript
interface PipelineRequestStage<Result, Out = Result, AdapterRequestConfig extends IRequestConfig = IRequestConfig> {
  config: AdapterRequestConfig | IRequestConfigFactory<Result, AdapterRequestConfig>;
  precondition?: () => boolean;
  mapper?: (result: Result) => Out | Promise<Out>;
  resultInterceptor?: (result: Out) => void | Promise<void>; // Optional result interceptor for side effects
  errorHandler?: (error: Error) => void | Promise<void>; // Optional error handler for stage-specific error handling
  retry?: RetryConfig; // Optional retry configuration
  chunkProcessing?: ChunkProcessingConfig; // Optional chunk processing configuration
}
```

#### IRequestConfigFactory

The `config` property can be a function that receives the previous result:

```typescript
interface IRequestConfigFactory<Result, AdapterRequestConfig extends IRequestConfig = IRequestConfig> {
  (previousResult?: Result): AdapterRequestConfig;
}
```

This allows each step in the chain to dynamically build its request based on the previous step's result.

#### PipelineManagerStage

```typescript
interface PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig extends IRequestConfig = IRequestConfig> {
  request: RequestManager<Out, AdapterExecutionResult, AdapterRequestConfig>;
  precondition?: () => boolean;
  mapper?: (result: Out) => Out | Promise<Out>;
  resultInterceptor?: (result: Out) => void | Promise<void>; // Optional result interceptor for side effects
  errorHandler?: (error: Error) => void | Promise<void>; // Optional error handler for stage-specific error handling
}
```

#### RetryConfig

```typescript
interface RetryConfig {
  maxRetries?: number; // Default: 3
  retryDelay?: number | ((attempt: number, error: Error) => number); // Default: 1000ms
  exponentialBackoff?: boolean; // Default: false
  maxDelay?: number; // Maximum delay cap for exponential backoff
  retryCondition?: (error: Error, attempt: number) => boolean; // Default: retries on network errors
}
```

#### ChunkProcessingConfig

```typescript
interface ChunkProcessingConfig<Chunk = string | Uint8Array> {
  enabled: boolean; // Whether chunk processing is enabled
  chunkHandler: ChunkHandler<Chunk>; // Handler function called for each chunk
  chunkSize?: number; // Size of each chunk in bytes (default: 8192)
  encoding?: string; // Text encoding for text-based streams (default: 'utf-8')
  accumulate?: boolean; // Whether to accumulate chunks and return them (default: false)
}
```

#### ChunkHandler

```typescript
interface ChunkHandler<Chunk = unknown> {
  (
    chunk: Chunk,
    metadata?: {
      index: number;
      isLast: boolean;
      totalBytesRead?: number;
    }
  ): void | Promise<void>;
}
```

#### Handlers

```typescript
interface ErrorHandler {
  (error: Error): void;
  // The error object includes error.cause.requestConfig containing the request configuration
  // that failed (undefined for manager stages)
}

interface ResultHandler<T = unknown> {
  (result: T): void;
}
```

## Security

### SSRF Protection

flow-conductor includes built-in protection against Server-Side Request Forgery (SSRF) attacks. All URLs are automatically validated before making requests.

#### Default Protection

By default, all adapters block potentially dangerous URLs:

- ✅ **Blocks private IP addresses**: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `169.254.x.x`
- ✅ **Blocks localhost addresses**: `localhost`, `127.0.0.1`, `::1`
- ✅ **Restricts protocols**: Only `http://` and `https://` are allowed
- ✅ **Validates URL format**: Ensures URLs are properly formatted

```typescript
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
import { SSRFError } from '@flow-conductor/core';

const adapter = new FetchRequestAdapter();

try {
  await begin(
    { config: { url: 'http://localhost:3000', method: 'GET' } },
    adapter
  ).execute();
} catch (error) {
  if (error instanceof SSRFError) {
    console.error('SSRF protection blocked request:', error.message);
    // Error: "Localhost addresses are not allowed for security reasons..."
  }
}
```

#### Configuration Options

For development or testing scenarios, you can configure validation:

```typescript
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
import { UrlValidationOptions } from '@flow-conductor/core';

// Allow localhost for local development
const devAdapter = new FetchRequestAdapter({
  allowLocalhost: true
});

// Allow private IPs (use with extreme caution)
const internalAdapter = new FetchRequestAdapter({
  allowPrivateIPs: true
});

// Custom protocol allowlist
const customAdapter = new FetchRequestAdapter({
  allowedProtocols: ['http:', 'https:', 'ws:', 'wss:']
});
```

**⚠️ WARNING**: Disabling or relaxing URL validation can expose your application to SSRF attacks. Only do this if you fully understand the security implications and trust all URL inputs.

#### Disabling Validation (Not Recommended)

```typescript
// ⚠️ SECURITY RISK: Only use in trusted environments
const unsafeAdapter = new FetchRequestAdapter({
  disableValidation: true
});
```

For more security information, see [SECURITY.md](./SECURITY.md).

### Request Timeouts

**Important**: flow-conductor does **not** set default timeouts for requests. You must configure timeouts manually to prevent requests from hanging indefinitely.

#### Fetch Adapter Timeout

```typescript
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

// Node.js 18+ - Using AbortSignal.timeout()
const result = await begin(
  {
    config: {
      url: 'https://api.example.com/users',
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    }
  },
  adapter
).execute();

// Browser or older Node.js - Using AbortController
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

try {
  const result = await begin(
    {
      config: {
        url: 'https://api.example.com/users',
        method: 'GET',
        signal: controller.signal
      }
    },
    adapter
  ).execute();
} finally {
  clearTimeout(timeoutId);
}
```

#### Axios Adapter Timeout

```typescript
import { AxiosRequestAdapter } from '@flow-conductor/adapter-axios';

const adapter = new AxiosRequestAdapter();

const result = await begin(
  {
    config: {
      url: 'https://api.example.com/users',
      method: 'GET',
      timeout: 5000 // 5 second timeout (in milliseconds)
    }
  },
  adapter
).execute();
```

#### Superagent Adapter Timeout

```typescript
import { SuperagentRequestAdapter } from '@flow-conductor/adapter-superagent';

const adapter = new SuperagentRequestAdapter();

const result = await begin(
  {
    config: {
      url: 'https://api.example.com/users',
      method: 'GET',
      timeout: 5000 // 5 second timeout (in milliseconds)
    }
  },
  adapter
).execute();
```

**Best Practice**: Always set appropriate timeouts based on your use case:
- **API requests**: 5-30 seconds
- **File uploads**: 30-120 seconds
- **Long-running operations**: Configure per-operation

## Troubleshooting

### Common Issues

#### "Adapter is required"

**Problem**: You're trying to start a chain without providing an adapter.

**Solution**: Always provide an adapter when calling `begin()`. Make sure you've installed the adapter package:

```typescript
// Make sure you've installed the adapter:
// npm install @flow-conductor/adapter-fetch @flow-conductor/core

import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();
const result = await begin(
  { config: { url: '...', method: 'GET' } },
  adapter // Don't forget this!
).execute();
```

#### "Cannot find module '@flow-conductor/adapter-*'"

**Problem**: The adapter package is not installed.

**Solution**: Install the adapter package you need:

```bash
# For Fetch adapter
npm install @flow-conductor/adapter-fetch @flow-conductor/core

# For Axios adapter
npm install @flow-conductor/adapter-axios @flow-conductor/core axios

# For Superagent adapter
npm install @flow-conductor/adapter-superagent @flow-conductor/core superagent

# Or install the main package (adapters available via subpath exports)
npm install flow-conductor
# Then import adapters using: import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
```

#### "Cannot read property 'body' of undefined" or Response handling differences

**Problem**: Different adapters return different response formats.

**Solution**: Each adapter returns a different response type:

```typescript
// Fetch adapter - returns standard Response
const fetchResult = await begin(..., fetchAdapter).execute();
const data = await fetchResult.json(); // Must call .json()

// Axios adapter - returns AxiosResponse with parsed data
const axiosResult = await begin(..., axiosAdapter).execute();
const data = axiosResult.data; // Already parsed, no .json() needed

// Superagent adapter - returns Superagent Response with parsed body
const superagentResult = await begin(..., superagentAdapter).execute();
const data = superagentResult.body; // Already parsed, no .json() needed
```

#### TypeScript Type Errors

**Problem**: TypeScript isn't inferring types correctly.

**Solution**: Explicitly type your chain or use type assertions:

```typescript
// Explicit typing
const result = await begin<MyType, Response, IRequestConfig>(
  { config: { url: '...', method: 'GET' } },
  adapter
).execute();

// Or use type assertions
const data = await (result as Response).json() as MyType;
```

#### Mapper Not Working

**Problem**: Mapper function isn't transforming the result.

**Solution**: Make sure your mapper returns the transformed value and handles async operations:

```typescript
// ✅ Correct - async mapper
mapper: async (result) => {
  const data = await result.json();
  return data.id;
}

// ✅ Correct - sync mapper
mapper: (result) => {
  return result.status;
}
```

### Getting Help

- Check the [examples](#common-patterns) section for common use cases
- Review the [API Reference](#api-reference) for detailed method signatures
- Open an issue on [GitHub](https://github.com/dawidhermann/flow-conductor)

