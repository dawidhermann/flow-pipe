# flow-pipe

A powerful TypeScript library for creating and managing request chains. Flow-pipe allows you to chain multiple HTTP requests together, transform results, and handle responses with ease.

## Features

- 🔗 **Chain Requests**: Link multiple HTTP requests in sequence
- 🔄 **Result Transformation**: Map and transform request results
- 📊 **Previous Result Access**: Each step can use the previous request's result
- 🎯 **Handler Support**: Result, error, and finish handlers
- 📦 **Batch Execution**: Execute all requests and get all results
- 🔌 **Custom Adapters**: Use custom request adapters
- 🎨 **Nested Chains**: Support for nested request managers
- ⚡ **TypeScript First**: Full TypeScript support with type inference

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Basic Usage](#basic-usage)
- [Advanced Features](#advanced-features)
- [Adapters](#adapters)
- [API Reference](#api-reference)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

## Installation

### Full Package (Recommended)

Install the main package which includes everything:

```bash
npm install flow-pipe
```

### Individual Packages

You can also install packages individually for more control:

```bash
# Core package (required)
npm install @flow-pipe/core

# Fetch adapter (required for HTTP requests)
npm install @flow-pipe/adapter-fetch
```

See [MONOREPO_MIGRATION.md](./MONOREPO_MIGRATION.md) for more details on the package structure.

## Quick Start

Here's a minimal example to get you started:

```typescript
import { RequestChain } from 'flow-pipe';
import { FetchRequestAdapter } from 'flow-pipe/adapter-fetch';

// Create a simple GET request chain
const result = await RequestChain.begin(
  {
    config: { 
      url: 'https://api.example.com/users/1', 
      method: 'GET' 
    }
  },
  new FetchRequestAdapter()
).execute();

console.log(await result.json()); // User data
```

**Important**: You must provide a request adapter (like `FetchRequestAdapter`) when starting a chain. Adapters handle the actual HTTP requests.

## Basic Usage

### Simple GET Request

You can start a request chain using either `RequestChain.begin()` or the exported `begin()` function:

```typescript
import { RequestChain, begin, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

// Using RequestChain.begin()
const result1 = await RequestChain.begin(
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
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

// Each step can access the previous result
const result = await RequestChain.begin(
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
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

const result = await RequestChain.begin(
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
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

const result = await RequestChain.begin(
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

### POST, PUT, DELETE, and Other Methods

All HTTP methods are supported:

```typescript
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

// POST request
const createResult = await RequestChain.begin(
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
const updateResult = await RequestChain.begin(
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
const deleteResult = await RequestChain.begin(
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
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

await RequestChain.begin(
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

Handle errors gracefully:

```typescript
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

await RequestChain.begin(
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

#### Finish Handler

Execute code after request completion (success or failure):

```typescript
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

const finishHandler = () => {
  console.log('Request chain finished');
  // Cleanup, hide loading indicators, etc.
};

await RequestChain.begin(
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
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

await RequestChain.begin(
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

### Executing All Requests

#### Get All Results

Execute all requests and get all results as an array. Each step can use the previous result:

```typescript
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

const results = await RequestChain.begin(
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
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

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

await RequestChain.begin(
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
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

await RequestChain.begin(
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
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

// Create a nested chain that uses the parent result
const nestedChain = RequestChain.begin(
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

const result = await RequestChain.begin(
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
import { begin, FetchRequestAdapter } from 'flow-pipe';

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
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

const chain = RequestChain.begin(
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

Adapters are responsible for executing the actual HTTP requests. Flow-pipe requires an adapter to be provided when starting a chain.

### Using Built-in Adapters

Flow-pipe comes with adapters that can be installed separately:

#### Fetch Adapter

The Fetch adapter uses the native Fetch API (available in Node.js 18+ and browsers):

```bash
npm install @flow-pipe/adapter-fetch @flow-pipe/core
```

```typescript
import { RequestChain } from '@flow-pipe/core';
import { FetchRequestAdapter } from '@flow-pipe/adapter-fetch';

const adapter = new FetchRequestAdapter();

const result = await RequestChain.begin(
  { 
    config: { 
      url: 'https://api.example.com/users', 
      method: 'GET' 
    } 
  },
  adapter
).execute();
```

Or using the main package:

```typescript
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();
const result = await RequestChain.begin(
  { config: { url: 'https://api.example.com/users', method: 'GET' } },
  adapter
).execute();
```

#### Fetch Adapter Configuration

The `FetchRequestAdapter` accepts standard `IRequestConfig` objects compatible with the Fetch API:

```typescript
interface FetchRequestConfig extends IRequestConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
  data?: any; // Will be JSON stringified for non-GET requests
  headers?: Record<string, string>;
  // ... other fetch options (credentials, cache, etc.)
}
```

### Creating Custom Adapters

Use custom request adapters to extend functionality or integrate with other HTTP libraries:

```typescript
import { RequestAdapter, IRequestConfig } from '@flow-pipe/core';
// Or from the main package:
// import { RequestAdapter, IRequestConfig } from 'flow-pipe';

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
const result = await RequestChain.begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' }
  },
  adapter
).execute();
```

For more details on creating adapters, see the [adapter template](./packages/ADAPTER_TEMPLATE.md).

## Common Patterns

### Authentication Flow

```typescript
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

// Login and use token for subsequent requests
const userData = await RequestChain.begin(
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
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

// Fetch user, then their posts, then comments
const allData = await RequestChain.begin(
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

```typescript
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

try {
  const result = await RequestChain.begin(
    {
      config: { url: 'https://api.example.com/users', method: 'GET' }
    },
    adapter
  )
    .withErrorHandler((error) => {
      // Log error but don't throw
      console.error('Request failed:', error);
    })
    .execute();
  
  console.log(await result.json());
} catch (error) {
  // Handle final error if needed
  console.error('Chain execution failed:', error);
}
```

### Conditional Requests

```typescript
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

const shouldFetchPosts = true;

const chain = RequestChain.begin(
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
  precondition?: () => boolean; // Note: Currently in types but not yet implemented
  mapper?: (result: Result) => Out | Promise<Out>;
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
  precondition?: () => boolean; // Note: Currently in types but not yet implemented
  mapper?: (result: Out) => Out | Promise<Out>;
}
```

#### Handlers

```typescript
interface ErrorHandler {
  (error: Error): void;
}

interface ResultHandler<T = unknown> {
  (result: T): void;
}
```

## Troubleshooting

### Common Issues

#### "Adapter is required"

**Problem**: You're trying to start a chain without providing an adapter.

**Solution**: Always provide an adapter when calling `RequestChain.begin()` or `begin()`:

```typescript
import { RequestChain, FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();
const result = await RequestChain.begin(
  { config: { url: '...', method: 'GET' } },
  adapter // Don't forget this!
).execute();
```

#### "Cannot read property 'body' of undefined"

**Problem**: You're trying to access properties on a Response object directly.

**Solution**: Use `.json()` or other Response methods to extract data:

```typescript
// ❌ Wrong
const userId = result.body.id;

// ✅ Correct
const data = await result.json();
const userId = data.id;
```

#### TypeScript Type Errors

**Problem**: TypeScript isn't inferring types correctly.

**Solution**: Explicitly type your chain or use type assertions:

```typescript
// Explicit typing
const result = await RequestChain.begin<MyType, Response, IRequestConfig>(
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
- Open an issue on [GitHub](https://github.com/dawidhermann/flow-pipe)

## License

ISC
