# @flow-conductor/core

Core types and base classes for flow-conductor request adapters.

## Installation

```bash
npm install @flow-conductor/core
```

## Overview

This package provides the foundational types and classes for building request adapters and managing request chains. It's the core dependency that all flow-conductor adapters depend on.

## What's Included

### Classes

- **`RequestAdapter`** - Base abstract class for all request adapters
- **`RequestChain`** - Main class for chaining requests together
- **`RequestBatch`** - Class for executing multiple requests in parallel
- **`RequestManager`** - Base class for request management (extended by `RequestChain` and `RequestBatch`)

### Types

- **`IRequestConfig`** - Interface for request configuration
- **`IRequestConfigFactory`** - Function type for dynamic request configuration
- **`PipelineRequestStage`** - Interface for individual request stages
- **`PipelineManagerStage`** - Interface for nested request manager stages
- **`BasePipelineStage`** - Base interface for pipeline stages
- **`ErrorHandler`** - Type for error handling functions
- **`ResultHandler`** - Type for result handling functions

## Usage

### Basic Usage

```typescript
import { begin, RequestAdapter, IRequestConfig } from "@flow-conductor/core";

// You need to provide an adapter - see adapter packages
class MyAdapter extends RequestAdapter<Response, IRequestConfig> {
  public async createRequest(config: IRequestConfig): Promise<Response> {
    // Implement your request logic
    return fetch(config.url, { method: config.method });
  }
}

const adapter = new MyAdapter();
const result = await begin(
  {
    config: { url: "https://api.example.com/users", method: "GET" }
  },
  adapter
).execute();
```

### Creating a Custom Adapter

To create a custom adapter, extend the `RequestAdapter` class:

```typescript
import { RequestAdapter, IRequestConfig } from "@flow-conductor/core";

export default class MyCustomAdapter extends RequestAdapter<
  MyResponseType,
  MyRequestConfig
> {
  public async createRequest(
    requestConfig: MyRequestConfig
  ): Promise<MyResponseType> {
    // Implement your custom request logic
    // This could use axios, node-fetch, or any other HTTP library
    const response = await myHttpLibrary.request({
      url: requestConfig.url,
      method: requestConfig.method,
      data: requestConfig.data
    });
    return response;
  }

  public getResult(result: MyResponseType): MyResponseType {
    // Optionally transform the result before it's passed to the next step
    return result;
  }
}
```

### Using RequestChain

```typescript
import { begin } from "@flow-conductor/core";
import { MyAdapter } from "./MyAdapter";

const adapter = new MyAdapter();

// Simple chain
const result = await begin(
  {
    config: { url: "https://api.example.com/users/1", method: "GET" }
  },
  adapter
)
  .next({
    config: async (previousResult) => {
      const user = await previousResult.json();
      return {
        url: `https://api.example.com/users/${user.id}/posts`,
        method: "GET"
      };
    }
  })
  .execute();
```

### Using RequestManager Methods

`RequestChain` extends `RequestManager`, which provides additional methods:

```typescript
import { begin } from "@flow-conductor/core";

const adapter = new MyAdapter();

const chain = begin(
  { config: { url: "https://api.example.com/users", method: "GET" } },
  adapter
)
  .withResultHandler((result) => {
    console.log("Success:", result);
  })
  .withErrorHandler((error) => {
    console.error("Error:", error);
  })
  .withFinishHandler(() => {
    console.log("Finished");
  });

// Add multiple requests at once
chain.addAll([
  { config: { url: "https://api.example.com/posts", method: "GET" } },
  { config: { url: "https://api.example.com/comments", method: "GET" } }
]);

const results = await chain.executeAll();
```

### Using RequestBatch

`RequestBatch` executes multiple requests in parallel (or with a concurrency limit). It supports both homogeneous batches (all requests return the same type) and heterogeneous batches (each request can return a different type).

#### Homogeneous Batch

All requests return the same type:

```typescript
import { batch } from "@flow-conductor/core";
import { MyAdapter } from "./MyAdapter";

const adapter = new MyAdapter();

// Execute multiple requests in parallel
const batchInstance = batch(
  [
    { config: { url: "https://api.example.com/users/1", method: "GET" } },
    { config: { url: "https://api.example.com/users/2", method: "GET" } },
    { config: { url: "https://api.example.com/users/3", method: "GET" } }
  ],
  adapter
);

const results = await batchInstance.execute(); // Returns User[]
```

#### Heterogeneous Batch

Each request can return a different type (using tuple types for type safety):

```typescript
import { batch } from "@flow-conductor/core";
import { MyAdapter } from "./MyAdapter";

const adapter = new MyAdapter();

// Each request returns a different type
const batchInstance = batch(
  [
    {
      config: { url: "https://api.example.com/users/1", method: "GET" },
      mapper: (r) => r.json() as Promise<User>
    },
    {
      config: { url: "https://api.example.com/products/1", method: "GET" },
      mapper: (r) => r.json() as Promise<Product>
    },
    {
      config: { url: "https://api.example.com/orders/1", method: "GET" },
      mapper: (r) => r.json() as Promise<Order>
    }
  ],
  adapter
);

const results = await batchInstance.execute(); // Returns [User, Product, Order]
```

#### Concurrency Control

Limit the number of concurrent requests:

```typescript
import { batch } from "@flow-conductor/core";

const batchInstance = batch([...requests], adapter)
  .withConcurrency(5); // Execute max 5 requests at a time

const results = await batchInstance.execute();
```

#### Using Handlers

`RequestBatch` supports the same handlers as `RequestManager`:

```typescript
import { batch } from "@flow-conductor/core";

const batchInstance = batch([...requests], adapter)
  .withResultHandler((results) => {
    console.log("Batch completed:", results);
  })
  .withErrorHandler((error) => {
    console.error("Batch error:", error);
  })
  .withFinishHandler(() => {
    console.log("Batch finished");
  });

const results = await batchInstance.execute();
```

#### Nested in RequestChain

`RequestBatch` can be nested within a `RequestChain`:

```typescript
import { begin, batch } from "@flow-conductor/core";

const adapter = new MyAdapter();

const result = await begin(
  { config: { url: "https://api.example.com/users", method: "GET" } },
  adapter
)
  .next({
    request: batch(
      [
        { config: { url: "https://api.example.com/posts", method: "GET" } },
        { config: { url: "https://api.example.com/comments", method: "GET" } }
      ],
      adapter
    ),
    mapper: (batchResults) => {
      // Process the batch results
      return batchResults;
    }
  })
  .execute();
```

## Type Definitions

### IRequestConfig

```typescript
interface IRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'CONNECT' | 'TRACE';
  data?: any;
  headers?: Record<string, string>;
  [key: string]: any; // Additional adapter-specific options
}
```

### PipelineRequestStage

```typescript
interface PipelineRequestStage<Result, Out = Result, AdapterRequestConfig extends IRequestConfig = IRequestConfig> {
  config: AdapterRequestConfig | IRequestConfigFactory<Result, AdapterRequestConfig>;
  precondition?: () => boolean;
  mapper?: (result: Result) => Out | Promise<Out>;
  resultInterceptor?: (result: Out) => void | Promise<void>; // Optional result interceptor for side effects
  retry?: RetryConfig; // Optional retry configuration
}
```

### RequestAdapter

```typescript
abstract class RequestAdapter<ExecutionResult, RequestConfig extends IRequestConfig = IRequestConfig> {
  abstract createRequest(requestConfig: RequestConfig): Promise<ExecutionResult>;
  getResult<T extends ExecutionResult>(result: ExecutionResult): T;
  executeRequest(requestConfig: RequestConfig): Promise<ExecutionResult>;
}
```

## Exports

### Main Exports

- `RequestAdapter` - Base adapter class
- `RequestManager` - Base manager class
- `RequestChain` - Main chain class
- `RequestBatch` - Batch request class for parallel execution
- `begin` - Function alternative to `RequestChain.begin`
- `batch` - Function alternative to `RequestBatch.batch`

### Type Exports

- `IRequestConfig`
- `IRequestConfigFactory`
- `PipelineRequestStage`
- `PipelineManagerStage`
- `BasePipelineStage`
- `ErrorHandler`
- `ResultHandler`

## Examples

See the [adapter-fetch](../adapter-fetch) package for a complete example of an adapter implementation.

## Requirements

- TypeScript 5.0+
- Node.js 18.0+ (for ES modules support)

## License

MIT
