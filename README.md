# flow-pipe

A powerful TypeScript library for creating and managing request chains. Flow-pipe allows you to chain multiple HTTP requests together, transform results, and handle responses with ease.

## Features

- 🔗 **Chain Requests**: Link multiple HTTP requests in sequence
- 🔄 **Result Transformation**: Map and transform request results
- 📊 **Previous Result Access**: Each step can use the previous request's result
- 🎯 **Handler Support**: Result, error, and finish handlers
- 📦 **Batch Execution**: Execute all requests and get all results
- 🔌 **Modular Adapters**: Choose from Fetch, Axios, or Superagent adapters (or create your own)
- 🎨 **Nested Chains**: Support for nested request managers
- ⚡ **TypeScript First**: Full TypeScript support with type inference
- 📦 **Tree-Shakeable**: Install only the adapter you need for smaller bundle sizes
- 🔒 **Built-in SSRF Protection**: Automatic URL validation to prevent Server-Side Request Forgery attacks

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Basic Usage](#basic-usage)
- [Advanced Features](#advanced-features)
- [Adapters](#adapters)
- [API Reference](#api-reference)
- [Common Patterns](#common-patterns)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## Installation

### Main Package

Install the main package for core functionality. **Note**: Adapters are NOT included in the main export and must be imported separately using subpath exports or individual packages.

```bash
npm install flow-pipe
```

### Individual Packages (Modular Installation)

For better tree-shaking and smaller bundle sizes, you can install packages individually:

```bash
# Core package (required)
npm install @flow-pipe/core

# Choose your adapter (install only what you need):
npm install @flow-pipe/adapter-fetch      # Native Fetch API (Node.js 18+ / browsers)
npm install @flow-pipe/adapter-axios      # Axios adapter
npm install @flow-pipe/adapter-superagent # Superagent adapter
```

**Benefits of modular installation:**
- 🎯 **Smaller bundles**: Only include the adapter you use
- 🔄 **Flexibility**: Switch adapters without changing your code
- 📦 **Independent versioning**: Each adapter can be updated independently
- 🚀 **Better tree-shaking**: Unused adapters are eliminated from your bundle

See [MONOREPO_MIGRATION.md](./MONOREPO_MIGRATION.md) for more details on the package structure.

## Quick Start

Here's a minimal example to get you started:

```typescript
// Option 1: Using the main package with subpath exports
import { RequestChain } from 'flow-pipe';
import { FetchRequestAdapter } from 'flow-pipe/adapter-fetch';

// Option 2: Using individual packages (better for tree-shaking)
// import { RequestChain } from '@flow-pipe/core';
// import { FetchRequestAdapter } from '@flow-pipe/adapter-fetch';

// Create a simple GET request chain
const adapter = new FetchRequestAdapter();
const result = await RequestChain.begin(
  {
    config: { 
      url: 'https://api.example.com/users/1', 
      method: 'GET' 
    }
  },
  adapter
).execute();

console.log(await result.json()); // User data
```

**Important**: 
- You must provide a request adapter when starting a chain. Adapters handle the actual HTTP requests.
- Choose the adapter that fits your needs: `FetchRequestAdapter` (native Fetch), `AxiosRequestAdapter`, or `SuperagentRequestAdapter`.
- See the [Adapters](#adapters) section for details on each adapter and when to use them.

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

Adapters are responsible for executing the actual HTTP requests. Flow-pipe uses a **modular adapter system** that allows you to choose the HTTP library that best fits your needs. Each adapter is a separate package, enabling better tree-shaking and smaller bundle sizes.

> **Recent Improvements**: Flow-pipe has been restructured as a monorepo with modular adapters. This enables:
> - ✅ **Independent versioning** of each adapter
> - ✅ **Better tree-shaking** - only include the adapter you use
> - ✅ **Smaller bundle sizes** - no need to bundle unused adapters
> - ✅ **Easy adapter switching** - swap adapters without code changes
> - ✅ **Custom adapter support** - create and publish your own adapters

### Available Adapters

Flow-pipe provides three official adapters, each optimized for different use cases:

#### 1. Fetch Adapter (Recommended for most cases)

The Fetch adapter uses the native Fetch API, available in Node.js 18+ and modern browsers. **No additional dependencies required.**

**Installation:**
```bash
npm install @flow-pipe/adapter-fetch @flow-pipe/core
# Or install main package and use subpath exports:
npm install flow-pipe
```

**Usage:**
```typescript
import { RequestChain } from '@flow-pipe/core';
import { FetchRequestAdapter } from '@flow-pipe/adapter-fetch';
// Or using main package with subpath exports:
// import { RequestChain } from 'flow-pipe';
// import { FetchRequestAdapter } from 'flow-pipe/adapter-fetch';

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

const result = await RequestChain.begin(
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

#### 2. Axios Adapter

The Axios adapter provides automatic JSON parsing, better error handling, and request/response interceptors.

**Installation:**
```bash
npm install @flow-pipe/adapter-axios @flow-pipe/core axios
# Or install main package and use subpath exports:
npm install flow-pipe axios
```

**Usage:**
```typescript
import { RequestChain } from '@flow-pipe/core';
import { AxiosRequestAdapter } from '@flow-pipe/adapter-axios';
// Or using main package with subpath exports:
// import { RequestChain } from 'flow-pipe';
// import { AxiosRequestAdapter } from 'flow-pipe/adapter-axios';

const adapter = new AxiosRequestAdapter();

const result = await RequestChain.begin(
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
const result = await RequestChain.begin(
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

#### 3. Superagent Adapter

The Superagent adapter offers a lightweight alternative with excellent browser and Node.js support.

**Installation:**
```bash
npm install @flow-pipe/adapter-superagent @flow-pipe/core superagent
# Or install main package and use subpath exports:
npm install flow-pipe superagent
```

**Usage:**
```typescript
import { RequestChain } from '@flow-pipe/core';
import { SuperagentRequestAdapter } from '@flow-pipe/adapter-superagent';
// Or using main package with subpath exports:
// import { RequestChain } from 'flow-pipe';
// import { SuperagentRequestAdapter } from 'flow-pipe/adapter-superagent';

const adapter = new SuperagentRequestAdapter();

const result = await RequestChain.begin(
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
const result = await RequestChain.begin(
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

**Option 1: From individual packages (recommended for tree-shaking)**
```typescript
import { RequestChain } from '@flow-pipe/core';
import { FetchRequestAdapter } from '@flow-pipe/adapter-fetch';
```

**Option 2: Using subpath exports from main package**
```typescript
import { RequestChain } from 'flow-pipe';
import { FetchRequestAdapter } from 'flow-pipe/adapter-fetch';
```

**Option 3: Using subpath exports for all adapters**
```typescript
import { RequestChain } from 'flow-pipe';
import { FetchRequestAdapter } from 'flow-pipe/adapter-fetch';
import { AxiosRequestAdapter } from 'flow-pipe/adapter-axios';
import { SuperagentRequestAdapter } from 'flow-pipe/adapter-superagent';
```

**Important**: The main package (`flow-pipe`) only exports core functionality. Adapters must be imported from their respective subpath exports (`flow-pipe/adapter-*`) or from individual packages (`@flow-pipe/adapter-*`).

### Adapter Comparison

| Feature | Fetch | Axios | Superagent |
|---------|-------|-------|------------|
| Dependencies | None (native) | axios | superagent |
| JSON Parsing | Manual (`.json()`) | Automatic | Automatic |
| Error Handling | Manual status checks | Automatic throws | Automatic throws |
| Bundle Size | Smallest | Medium | Small |
| Interceptors | ❌ | ✅ | ❌ |
| Query Params | URL string | `params` option | URL string |
| Browser Support | Modern browsers | All | All |
| Node.js Support | 18+ | All versions | All versions |

### Switching Adapters

All adapters share the same interface, making it easy to switch:

```typescript
// Easy to swap adapters - same API!
const fetchAdapter = new FetchRequestAdapter();
const axiosAdapter = new AxiosRequestAdapter();
const superagentAdapter = new SuperagentRequestAdapter();

// Use any adapter with the same code
const result = await RequestChain.begin(
  { config: { url: '...', method: 'GET' } },
  fetchAdapter // or axiosAdapter, or superagentAdapter
).execute();
```

### Creating Custom Adapters

The modular adapter system makes it easy to create custom adapters for any HTTP library. All adapters extend the base `RequestAdapter` class:

```typescript
import { RequestAdapter, IRequestConfig } from '@flow-pipe/core';
// Or from the main package:
// import { RequestAdapter, IRequestConfig } from 'flow-pipe';
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
const result = await RequestChain.begin(
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

## Security

### SSRF Protection

flow-pipe includes built-in protection against Server-Side Request Forgery (SSRF) attacks. All URLs are automatically validated before making requests.

#### Default Protection

By default, all adapters block potentially dangerous URLs:

- ✅ **Blocks private IP addresses**: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `169.254.x.x`
- ✅ **Blocks localhost addresses**: `localhost`, `127.0.0.1`, `::1`
- ✅ **Restricts protocols**: Only `http://` and `https://` are allowed
- ✅ **Validates URL format**: Ensures URLs are properly formatted

```typescript
import { FetchRequestAdapter, SSRFError } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

try {
  await RequestChain.begin(
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
import { FetchRequestAdapter, UrlValidationOptions } from 'flow-pipe';

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

**Important**: flow-pipe does **not** set default timeouts for requests. You must configure timeouts manually to prevent requests from hanging indefinitely.

#### Fetch Adapter Timeout

```typescript
import { FetchRequestAdapter } from 'flow-pipe';

const adapter = new FetchRequestAdapter();

// Node.js 18+ - Using AbortSignal.timeout()
const result = await RequestChain.begin(
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
  const result = await RequestChain.begin(
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
import { AxiosRequestAdapter } from 'flow-pipe/adapter-axios';

const adapter = new AxiosRequestAdapter();

const result = await RequestChain.begin(
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
import { SuperagentRequestAdapter } from 'flow-pipe/adapter-superagent';

const adapter = new SuperagentRequestAdapter();

const result = await RequestChain.begin(
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

**Solution**: Always provide an adapter when calling `RequestChain.begin()` or `begin()`. Make sure you've installed the adapter package:

```typescript
// Make sure you've installed the adapter:
// npm install @flow-pipe/adapter-fetch @flow-pipe/core

import { RequestChain } from '@flow-pipe/core';
import { FetchRequestAdapter } from '@flow-pipe/adapter-fetch';

const adapter = new FetchRequestAdapter();
const result = await RequestChain.begin(
  { config: { url: '...', method: 'GET' } },
  adapter // Don't forget this!
).execute();
```

#### "Cannot find module '@flow-pipe/adapter-*'"

**Problem**: The adapter package is not installed.

**Solution**: Install the adapter package you need:

```bash
# For Fetch adapter
npm install @flow-pipe/adapter-fetch @flow-pipe/core

# For Axios adapter
npm install @flow-pipe/adapter-axios @flow-pipe/core axios

# For Superagent adapter
npm install @flow-pipe/adapter-superagent @flow-pipe/core superagent

# Or install the main package (adapters available via subpath exports)
npm install flow-pipe
# Then import adapters using: import { FetchRequestAdapter } from 'flow-pipe/adapter-fetch';
```

#### "Cannot read property 'body' of undefined" or Response handling differences

**Problem**: Different adapters return different response formats.

**Solution**: Each adapter returns a different response type:

```typescript
// Fetch adapter - returns standard Response
const fetchResult = await RequestChain.begin(..., fetchAdapter).execute();
const data = await fetchResult.json(); // Must call .json()

// Axios adapter - returns AxiosResponse with parsed data
const axiosResult = await RequestChain.begin(..., axiosAdapter).execute();
const data = axiosResult.data; // Already parsed, no .json() needed

// Superagent adapter - returns Superagent Response with parsed body
const superagentResult = await RequestChain.begin(..., superagentAdapter).execute();
const data = superagentResult.body; // Already parsed, no .json() needed
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
