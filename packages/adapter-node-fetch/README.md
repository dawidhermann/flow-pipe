# @flow-pipe/adapter-node-fetch

node-fetch adapter for flow-pipe. This adapter uses node-fetch, making it ideal for Node.js environments where you need a reliable HTTP client.

## Installation

```bash
npm install @flow-pipe/adapter-node-fetch @flow-pipe/core node-fetch
```

**Note**: `@flow-pipe/core` and `node-fetch` are peer dependencies and must be installed alongside this package.

## Quick Start

```typescript
import { RequestChain } from "@flow-pipe/core";
import { NodeFetchRequestAdapter } from "@flow-pipe/adapter-node-fetch";

const adapter = new NodeFetchRequestAdapter();

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
    },
  },
  adapter
).execute();

const data = await result.json();
console.log(data);
```

## Usage

### Basic GET Request

```typescript
import { RequestChain } from "@flow-pipe/core";
import { NodeFetchRequestAdapter } from "@flow-pipe/adapter-node-fetch";

const adapter = new NodeFetchRequestAdapter();

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users/1",
      method: "GET",
    },
  },
  adapter
).execute();

const user = await result.json();
console.log(user);
```

### POST Request with Data

```typescript
import { RequestChain } from "@flow-pipe/core";
import { NodeFetchRequestAdapter } from "@flow-pipe/adapter-node-fetch";

const adapter = new NodeFetchRequestAdapter();

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "POST",
      data: {
        name: "John Doe",
        email: "john@example.com",
      },
    },
  },
  adapter
).execute();

const newUser = await result.json();
console.log(newUser);
```

### Request with Custom Headers

```typescript
import { RequestChain } from "@flow-pipe/core";
import { NodeFetchRequestAdapter } from "@flow-pipe/adapter-node-fetch";

const adapter = new NodeFetchRequestAdapter();

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
      headers: {
        Authorization: "Bearer your-token-here",
        "X-Custom-Header": "value",
      },
    },
  },
  adapter
).execute();
```

### Chained Requests

```typescript
import { RequestChain } from "@flow-pipe/core";
import { NodeFetchRequestAdapter } from "@flow-pipe/adapter-node-fetch";

const adapter = new NodeFetchRequestAdapter();

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users/1",
      method: "GET",
    },
  },
  adapter
)
  .next({
    config: async (previousResult) => {
      const user = await previousResult.json();
      return {
        url: `https://api.example.com/users/${user.id}/posts`,
        method: "GET",
      };
    },
  })
  .execute();

const posts = await result.json();
console.log(posts);
```

## Configuration

The `NodeFetchRequestAdapter` accepts standard `IRequestConfig` objects compatible with node-fetch. The adapter automatically:

- JSON stringifies `data` for non-GET requests
- Sets `Content-Type: application/json` header when data is provided
- Passes through all other node-fetch options

### Request Config Interface

```typescript
interface NodeFetchRequestConfig extends IRequestConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
  data?: any; // Will be JSON stringified for non-GET requests
  headers?: Record<string, string>;
  // ... other fetch options (redirect, timeout, etc.)
}
```

### Supported Fetch Options

All standard node-fetch options are supported:

```typescript
const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
      headers: {
        "Authorization": "Bearer token",
      },
      redirect: "follow", // Redirect handling
      timeout: 5000, // Request timeout
      // ... any other RequestInit options
    },
  },
  adapter
).execute();
```

### Data Handling

The adapter automatically handles data serialization:

- **GET requests**: Data is ignored (use query parameters in URL instead)
- **Other methods**: Data is JSON stringified and sent as the request body
- **Content-Type**: Automatically set to `application/json` when data is provided
- **String data**: Passed through as-is
- **Buffer/Uint8Array**: Passed through as binary data

```typescript
// POST with JSON data
const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "POST",
      data: { name: "John", email: "john@example.com" },
      // Content-Type: application/json is automatically added
    },
  },
  adapter
).execute();

// POST with string data
const textResult = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/data",
      method: "POST",
      data: "raw string data",
      // Content-Type will not be automatically set for string data
    },
  },
  adapter
).execute();

// PUT with JSON data
const updateResult = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users/1",
      method: "PUT",
      data: { name: "Jane" },
    },
  },
  adapter
).execute();
```

### Custom Headers

You can provide custom headers, which will be merged with default headers:

```typescript
const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "POST",
      data: { name: "John" },
      headers: {
        "Authorization": "Bearer token",
        "X-Custom-Header": "value",
        // Content-Type will be automatically added if not specified
      },
    },
  },
  adapter
).execute();
```

## Response Handling

The adapter returns a standard `Response` object from node-fetch. You can use all standard Response methods:

```typescript
const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
    },
  },
  adapter
).execute();

// Standard Response methods
const json = await result.json();
const text = await result.text();
const blob = await result.blob();
const arrayBuffer = await result.arrayBuffer();

// Response properties
console.log(result.status); // HTTP status code
console.log(result.statusText); // Status text
console.log(result.ok); // true if status 200-299
console.log(result.headers); // Headers object
```

## Error Handling

node-fetch throws errors for network failures and rejects on HTTP error statuses (depending on configuration). You can handle errors using flow-pipe's error handling:

```typescript
import { RequestChain } from "@flow-pipe/core";
import { NodeFetchRequestAdapter } from "@flow-pipe/adapter-node-fetch";

const adapter = new NodeFetchRequestAdapter();

try {
  const result = await RequestChain.begin(
    {
      config: {
        url: "https://api.example.com/users",
        method: "GET",
      },
    },
    adapter
  )
    .withErrorHandler((error) => {
      console.error("Request failed:", error);
    })
    .execute();

  if (!result.ok) {
    throw new Error(`HTTP error! status: ${result.status}`);
  }

  const data = await result.json();
  console.log(data);
} catch (error) {
  console.error("Error:", error);
}
```

## Node.js Environment

This adapter is specifically designed for Node.js environments and uses `node-fetch` v3, which is ESM-only. Make sure your project is configured for ESM:

```json
{
  "type": "module"
}
```

### Requirements

- Node.js 18+ (for native ESM support)
- node-fetch v3.x

## Examples

### Authentication Flow

```typescript
import { RequestChain } from "@flow-pipe/core";
import { NodeFetchRequestAdapter } from "@flow-pipe/adapter-node-fetch";

const adapter = new NodeFetchRequestAdapter();

// Login and use token
const userData = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/auth/login",
      method: "POST",
      data: { username: "user", password: "pass" },
    },
  },
  adapter
)
  .next({
    config: async (previousResult) => {
      const auth = await previousResult.json();
      return {
        url: "https://api.example.com/user/profile",
        method: "GET",
        headers: { Authorization: `Bearer ${auth.token}` },
      };
    },
  })
  .execute();

const profile = await userData.json();
console.log(profile);
```

### File Upload

```typescript
import { RequestChain } from "@flow-pipe/core";
import { NodeFetchRequestAdapter } from "@flow-pipe/adapter-node-fetch";
import { readFileSync } from "fs";

const adapter = new NodeFetchRequestAdapter();

// Upload file as Buffer
const fileBuffer = readFileSync("./file.pdf");

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/upload",
      method: "POST",
      data: fileBuffer,
      headers: {
        "Content-Type": "application/pdf",
      },
    },
  },
  adapter
).execute();
```

### Request with Timeout

```typescript
import { RequestChain } from "@flow-pipe/core";
import { NodeFetchRequestAdapter } from "@flow-pipe/adapter-node-fetch";

const adapter = new NodeFetchRequestAdapter();

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
      timeout: 5000, // 5 second timeout
    },
  },
  adapter
).execute();
```

## API Reference

### NodeFetchRequestAdapter

```typescript
class NodeFetchRequestAdapter extends RequestAdapter<Response, NodeFetchRequestConfig> {
  createRequest(requestConfig: IRequestConfig): Promise<Response>;
}
```

### NodeFetchRequestConfig

```typescript
type NodeFetchRequestConfig = IRequestConfig;
```

Extends `IRequestConfig` with all standard node-fetch options.

## Differences from Native Fetch Adapter

The `@flow-pipe/adapter-node-fetch` adapter is similar to `@flow-pipe/adapter-fetch`, but:

- **Node.js only**: Designed specifically for Node.js environments
- **node-fetch dependency**: Uses the `node-fetch` package instead of native fetch
- **Better Node.js support**: May have better support for Node.js-specific features
- **Consistent API**: Provides a consistent API across different Node.js versions

Choose `@flow-pipe/adapter-node-fetch` if:
- You're building a Node.js-only application
- You need features specific to node-fetch
- You want explicit control over the fetch implementation

Choose `@flow-pipe/adapter-fetch` if:
- You want to use the native Fetch API (Node.js 18+)
- You want to avoid additional dependencies
- You're building for both browser and Node.js

## Requirements

- `@flow-pipe/core` (peer dependency)
- `node-fetch` v3.x (peer dependency)
- Node.js 18+ (for native ESM support)
- TypeScript 5.0+

## License

MIT


