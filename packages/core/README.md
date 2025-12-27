# @flow-pipe/core

Core types and base classes for flow-pipe request adapters.

## Installation

```bash
npm install @flow-pipe/core
```

## Overview

This package provides the foundational types and classes for building request adapters and managing request chains. It's the core dependency that all flow-pipe adapters depend on.

## What's Included

### Classes

- **`RequestAdapter`** - Base abstract class for all request adapters
- **`RequestChain`** - Main class for chaining requests together
- **`RequestManager`** - Base class for request management (extended by `RequestChain`)

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
import { RequestChain, RequestAdapter, IRequestConfig } from "@flow-pipe/core";

// You need to provide an adapter - see adapter packages
class MyAdapter extends RequestAdapter<Response, IRequestConfig> {
  public async createRequest(config: IRequestConfig): Promise<Response> {
    // Implement your request logic
    return fetch(config.url, { method: config.method });
  }
}

const adapter = new MyAdapter();
const result = await RequestChain.begin(
  {
    config: { url: "https://api.example.com/users", method: "GET" }
  },
  adapter
).execute();
```

### Creating a Custom Adapter

To create a custom adapter, extend the `RequestAdapter` class:

```typescript
import { RequestAdapter, IRequestConfig } from "@flow-pipe/core";

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
import { RequestChain } from "@flow-pipe/core";
import { MyAdapter } from "./MyAdapter";

const adapter = new MyAdapter();

// Simple chain
const result = await RequestChain.begin(
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
import { RequestChain } from "@flow-pipe/core";

const adapter = new MyAdapter();

const chain = RequestChain.begin(
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
  precondition?: () => boolean; // Note: Currently in types but not yet implemented
  mapper?: (result: Result) => Out | Promise<Out>;
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
- `begin` - Function alternative to `RequestChain.begin`

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
