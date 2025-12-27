# @flow-pipe/adapter-fetch

Fetch API adapter for flow-pipe. This adapter uses the native Fetch API available in Node.js 18+ and modern browsers.

## Installation

```bash
npm install @flow-pipe/adapter-fetch @flow-pipe/core
```

**Note**: `@flow-pipe/core` is a peer dependency and must be installed alongside this package.

## Quick Start

```typescript
import { RequestChain } from "@flow-pipe/core";
import { FetchRequestAdapter } from "@flow-pipe/adapter-fetch";

const adapter = new FetchRequestAdapter();

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
import { FetchRequestAdapter } from "@flow-pipe/adapter-fetch";

const adapter = new FetchRequestAdapter();

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
import { FetchRequestAdapter } from "@flow-pipe/adapter-fetch";

const adapter = new FetchRequestAdapter();

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
import { FetchRequestAdapter } from "@flow-pipe/adapter-fetch";

const adapter = new FetchRequestAdapter();

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
import { FetchRequestAdapter } from "@flow-pipe/adapter-fetch";

const adapter = new FetchRequestAdapter();

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

The `FetchRequestAdapter` accepts standard `IRequestConfig` objects compatible with the Fetch API. The adapter automatically:

- JSON stringifies `data` for non-GET requests
- Sets `Content-Type: application/json` header when data is provided
- Passes through all other Fetch API options

### Request Config Interface

```typescript
interface FetchRequestConfig extends IRequestConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
  data?: any; // Will be JSON stringified for non-GET requests
  headers?: Record<string, string>;
  // ... other fetch options (credentials, cache, mode, etc.)
}
```

### Supported Fetch Options

All standard Fetch API options are supported:

```typescript
const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
      headers: {
        "Authorization": "Bearer token",
      },
      credentials: "include", // Include cookies
      cache: "no-cache", // Cache control
      mode: "cors", // CORS mode
      redirect: "follow", // Redirect handling
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

The adapter returns a standard `Response` object from the Fetch API. You can use all standard Response methods:

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

The Fetch API only rejects on network errors, not HTTP error statuses. You may want to check the response status:

```typescript
import { RequestChain } from "@flow-pipe/core";
import { FetchRequestAdapter } from "@flow-pipe/adapter-fetch";

const adapter = new FetchRequestAdapter();

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

## Browser vs Node.js

### Browser

The Fetch API is natively available in modern browsers. No additional setup needed.

```typescript
// Works in browsers with native fetch support
import { FetchRequestAdapter } from "@flow-pipe/adapter-fetch";
const adapter = new FetchRequestAdapter();
```

### Node.js

Node.js 18+ includes native Fetch API support. For older versions, you may need a polyfill:

```typescript
// Node.js 18+
import { FetchRequestAdapter } from "@flow-pipe/adapter-fetch";
const adapter = new FetchRequestAdapter();

// Node.js < 18 (requires polyfill)
import fetch from "node-fetch";
import { FetchRequestAdapter } from "@flow-pipe/adapter-fetch";

// Note: You may need to configure the adapter to use the polyfill
// or use a different adapter implementation
```

## Examples

### Authentication Flow

```typescript
import { RequestChain } from "@flow-pipe/core";
import { FetchRequestAdapter } from "@flow-pipe/adapter-fetch";

const adapter = new FetchRequestAdapter();

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
import { FetchRequestAdapter } from "@flow-pipe/adapter-fetch";

const adapter = new FetchRequestAdapter();

// Note: For file uploads, you may need to customize the adapter
// to handle FormData instead of JSON
const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/upload",
      method: "POST",
      data: formData, // FormData object
      headers: {
        // Don't set Content-Type, let browser set it with boundary
      },
    },
  },
  adapter
).execute();
```

## API Reference

### FetchRequestAdapter

```typescript
class FetchRequestAdapter extends RequestAdapter<Response, FetchRequestConfig> {
  createRequest(requestConfig: IRequestConfig): Promise<Response>;
}
```

### FetchRequestConfig

```typescript
type FetchRequestConfig = IRequestConfig;
```

Extends `IRequestConfig` with all standard Fetch API options.

## Requirements

- `@flow-pipe/core` (peer dependency)
- Node.js 18+ (for native Fetch API) or a Fetch polyfill
- TypeScript 5.0+

## License

MIT
