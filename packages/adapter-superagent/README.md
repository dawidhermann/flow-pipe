# @flow-pipe/adapter-superagent

Superagent adapter for flow-pipe. This adapter uses Superagent for making HTTP requests, providing a fluent API and excellent browser/Node.js support.

## Installation

```bash
npm install @flow-pipe/adapter-superagent @flow-pipe/core superagent
```

**Note**: Both `@flow-pipe/core` and `superagent` are peer dependencies and must be installed alongside this package.

## Quick Start

```typescript
import { RequestChain } from "@flow-pipe/core";
import { SuperagentRequestAdapter } from "@flow-pipe/adapter-superagent";

const adapter = new SuperagentRequestAdapter();

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
    },
  },
  adapter
).execute();

console.log(result.body); // Response body
console.log(result.status); // HTTP status code
console.log(result.headers); // Response headers
```

## Usage

### Basic GET Request

```typescript
import { RequestChain } from "@flow-pipe/core";
import { SuperagentRequestAdapter } from "@flow-pipe/adapter-superagent";

const adapter = new SuperagentRequestAdapter();

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users/1",
      method: "GET",
    },
  },
  adapter
).execute();

const user = result.body; // Response body
console.log(user);
```

### POST Request with Data

```typescript
import { RequestChain } from "@flow-pipe/core";
import { SuperagentRequestAdapter } from "@flow-pipe/adapter-superagent";

const adapter = new SuperagentRequestAdapter();

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

const newUser = result.body;
console.log(newUser);
```

### Request with Custom Headers

```typescript
import { RequestChain } from "@flow-pipe/core";
import { SuperagentRequestAdapter } from "@flow-pipe/adapter-superagent";

const adapter = new SuperagentRequestAdapter();

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
import { SuperagentRequestAdapter } from "@flow-pipe/adapter-superagent";

const adapter = new SuperagentRequestAdapter();

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
    config: (previousResult) => {
      const user = previousResult.body;
      return {
        url: `https://api.example.com/users/${user.id}/posts`,
        method: "GET",
      };
    },
  })
  .execute();

const posts = result.body;
console.log(posts);
```

## Configuration

The `SuperagentRequestAdapter` accepts `IRequestConfig` objects. The adapter automatically:

- Handles request data serialization
- Sets headers appropriately
- Supports all HTTP methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)

### Request Config Interface

```typescript
interface SuperagentRequestConfig extends IRequestConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
  data?: any; // Request body
  headers?: Record<string, string>;
}
```

### Supported HTTP Methods

All standard HTTP methods are supported:

```typescript
// GET
const getResult = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
    },
  },
  adapter
).execute();

// POST
const postResult = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "POST",
      data: { name: "John" },
    },
  },
  adapter
).execute();

// PUT
const putResult = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users/1",
      method: "PUT",
      data: { name: "Jane" },
    },
  },
  adapter
).execute();

// DELETE
const deleteResult = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users/1",
      method: "DELETE",
    },
  },
  adapter
).execute();
```

### Data Handling

Superagent automatically handles data serialization:

- **Objects**: Automatically JSON stringified
- **FormData**: Sent as multipart/form-data
- **URLSearchParams**: Sent as application/x-www-form-urlencoded
- **Strings**: Sent as-is

```typescript
// POST with JSON data
const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "POST",
      data: { name: "John", email: "john@example.com" },
      // Content-Type: application/json is automatically set
    },
  },
  adapter
).execute();

// POST with FormData
const formData = new FormData();
formData.append("file", fileBlob);

const uploadResult = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/upload",
      method: "POST",
      data: formData,
      // Content-Type: multipart/form-data is automatically set
    },
  },
  adapter
).execute();
```

## Response Handling

The adapter returns a Superagent `Response` object with the following properties:

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

// Response properties
console.log(result.body); // Response body (automatically parsed JSON)
console.log(result.text); // Response text
console.log(result.status); // HTTP status code
console.log(result.headers); // Response headers
console.log(result.type); // Content-Type
```

### Automatic JSON Parsing

Superagent automatically parses JSON responses:

```typescript
const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users/1",
      method: "GET",
    },
  },
  adapter
).execute();

// No need to call .json() - body is already parsed
const user = result.body; // Already a JavaScript object
console.log(user.name);
```

## Error Handling

Superagent throws errors for HTTP error statuses (4xx, 5xx):

```typescript
import { RequestChain } from "@flow-pipe/core";
import { SuperagentRequestAdapter } from "@flow-pipe/adapter-superagent";

const adapter = new SuperagentRequestAdapter();

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
      console.error("Request failed:", error.message);
      if (error.status) {
        console.error("Status:", error.status);
        console.error("Response:", error.response?.body);
      }
    })
    .execute();

  const data = result.body;
  console.log(data);
} catch (error: any) {
  if (error.status) {
    // Handle HTTP errors
    console.error("Status:", error.status);
    console.error("Response:", error.response?.body);
  } else {
    console.error("Error:", error);
  }
}
```

### Error Response Access

Superagent provides detailed error information:

```typescript
try {
  await RequestChain.begin(
    {
      config: {
        url: "https://api.example.com/users",
        method: "GET",
      },
    },
    adapter
  ).execute();
} catch (error: any) {
  if (error.status) {
    // Server responded with error status
    console.error("Status:", error.status);
    console.error("Body:", error.response?.body);
    console.error("Headers:", error.response?.headers);
  } else {
    // Network or other error
    console.error("Error:", error.message);
  }
}
```

## Examples

### Authentication Flow

```typescript
import { RequestChain } from "@flow-pipe/core";
import { SuperagentRequestAdapter } from "@flow-pipe/adapter-superagent";

const adapter = new SuperagentRequestAdapter();

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
    config: (previousResult) => {
      const auth = previousResult.body;
      return {
        url: "https://api.example.com/user/profile",
        method: "GET",
        headers: { Authorization: `Bearer ${auth.token}` },
      };
    },
  })
  .execute();

const profile = userData.body;
console.log(profile);
```

### File Upload

```typescript
import { RequestChain } from "@flow-pipe/core";
import { SuperagentRequestAdapter } from "@flow-pipe/adapter-superagent";

const adapter = new SuperagentRequestAdapter();

const formData = new FormData();
formData.append("file", fileBlob);
formData.append("name", "document.pdf");

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/upload",
      method: "POST",
      data: formData,
    },
  },
  adapter
).execute();

console.log(result.body);
```

## API Reference

### SuperagentRequestAdapter

```typescript
class SuperagentRequestAdapter extends RequestAdapter<Response, SuperagentRequestConfig> {
  createRequest(requestConfig: SuperagentRequestConfig): Promise<Response>;
}
```

### SuperagentRequestConfig

```typescript
type SuperagentRequestConfig = IRequestConfig;
```

Extends `IRequestConfig` with standard request configuration options.

## Advantages

- **Fluent API**: Clean and intuitive request building
- **Automatic JSON parsing**: No need to call `.json()` on responses
- **Cross-platform**: Works in both browser and Node.js
- **Lightweight**: Smaller bundle size compared to some alternatives
- **Flexible**: Supports various data formats (JSON, FormData, etc.)

## Requirements

- `@flow-pipe/core` (peer dependency)
- `superagent` ^8.0.0 (peer dependency)
- Node.js 18+
- TypeScript 5.0+

## License

MIT

