# @flow-pipe/adapter-axios

Axios adapter for flow-pipe. This adapter uses Axios for making HTTP requests, providing features like request/response interceptors, automatic JSON parsing, and better error handling.

## Installation

```bash
npm install @flow-pipe/adapter-axios @flow-pipe/core axios
```

**Note**: Both `@flow-pipe/core` and `axios` are peer dependencies and must be installed alongside this package.

## Quick Start

```typescript
import { RequestChain } from "@flow-pipe/core";
import { AxiosRequestAdapter } from "@flow-pipe/adapter-axios";

const adapter = new AxiosRequestAdapter();

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
    },
  },
  adapter
).execute();

console.log(result.data); // Axios automatically parses JSON
console.log(result.status); // HTTP status code
console.log(result.headers); // Response headers
```

## Usage

### Basic GET Request

```typescript
import { RequestChain } from "@flow-pipe/core";
import { AxiosRequestAdapter } from "@flow-pipe/adapter-axios";

const adapter = new AxiosRequestAdapter();

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users/1",
      method: "GET",
    },
  },
  adapter
).execute();

const user = result.data; // Already parsed JSON
console.log(user);
```

### POST Request with Data

```typescript
import { RequestChain } from "@flow-pipe/core";
import { AxiosRequestAdapter } from "@flow-pipe/adapter-axios";

const adapter = new AxiosRequestAdapter();

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

const newUser = result.data;
console.log(newUser);
```

### Request with Custom Headers

```typescript
import { RequestChain } from "@flow-pipe/core";
import { AxiosRequestAdapter } from "@flow-pipe/adapter-axios";

const adapter = new AxiosRequestAdapter();

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
import { AxiosRequestAdapter } from "@flow-pipe/adapter-axios";

const adapter = new AxiosRequestAdapter();

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
      const user = previousResult.data;
      return {
        url: `https://api.example.com/users/${user.id}/posts`,
        method: "GET",
      };
    },
  })
  .execute();

const posts = result.data;
console.log(posts);
```

## Configuration

The `AxiosRequestAdapter` accepts `IRequestConfig` objects and extends them with Axios-specific options. The adapter automatically:

- Parses JSON responses (available in `result.data`)
- Handles request data serialization
- Supports all Axios configuration options

### Request Config Interface

```typescript
interface AxiosRequestConfigType extends IRequestConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
  data?: any; // Automatically serialized by Axios
  headers?: Record<string, string>;
  // ... other Axios options (params, timeout, auth, etc.)
}
```

### Supported Axios Options

All standard Axios configuration options are supported:

```typescript
const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
      headers: {
        Authorization: "Bearer token",
      },
      params: {
        page: 1,
        limit: 10,
      },
      timeout: 5000,
      auth: {
        username: "user",
        password: "pass",
      },
      // ... any other AxiosRequestConfig options
    },
  },
  adapter
).execute();
```

### Query Parameters

Axios handles query parameters separately from the URL:

```typescript
const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
      params: {
        page: 1,
        limit: 10,
        sort: "name",
      },
    },
  },
  adapter
).execute();
```

### Data Handling

Axios automatically handles data serialization:

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

### Custom Axios Instance

You can create a custom Axios instance with default configuration:

```typescript
import axios from "axios";
import { AxiosRequestAdapter } from "@flow-pipe/adapter-axios";

// Create a custom axios instance
const axiosInstance = axios.create({
  baseURL: "https://api.example.com",
  timeout: 5000,
  headers: {
    "X-Custom-Header": "value",
  },
});

// Note: The adapter uses the default axios instance
// For custom instances, you may need to extend the adapter
```

## Response Handling

The adapter returns an `AxiosResponse` object with the following properties:

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
console.log(result.data); // Response data (automatically parsed JSON)
console.log(result.status); // HTTP status code
console.log(result.statusText); // HTTP status text
console.log(result.headers); // Response headers
console.log(result.config); // Request configuration
```

### Automatic JSON Parsing

Unlike the Fetch API, Axios automatically parses JSON responses:

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

// No need to call .json() - data is already parsed
const user = result.data; // Already a JavaScript object
console.log(user.name);
```

## Error Handling

Axios throws errors for HTTP error statuses (4xx, 5xx), making error handling more straightforward:

```typescript
import { RequestChain } from "@flow-pipe/core";
import { AxiosRequestAdapter } from "@flow-pipe/adapter-axios";
import { AxiosError } from "axios";

const adapter = new AxiosRequestAdapter();

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
      if (error instanceof AxiosError) {
        console.error("Request failed:", error.message);
        console.error("Status:", error.response?.status);
        console.error("Data:", error.response?.data);
      }
    })
    .execute();

  const data = result.data;
  console.log(data);
} catch (error) {
  if (error instanceof AxiosError) {
    // Handle Axios-specific errors
    console.error("Axios error:", error.response?.data);
  } else {
    console.error("Error:", error);
  }
}
```

### Error Response Access

Axios provides detailed error information:

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
} catch (error) {
  if (error instanceof AxiosError) {
    if (error.response) {
      // Server responded with error status
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
      console.error("Headers:", error.response.headers);
    } else if (error.request) {
      // Request made but no response received
      console.error("No response:", error.request);
    } else {
      // Error setting up request
      console.error("Error:", error.message);
    }
  }
}
```

## Examples

### Authentication Flow

```typescript
import { RequestChain } from "@flow-pipe/core";
import { AxiosRequestAdapter } from "@flow-pipe/adapter-axios";

const adapter = new AxiosRequestAdapter();

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
      const auth = previousResult.data;
      return {
        url: "https://api.example.com/user/profile",
        method: "GET",
        headers: { Authorization: `Bearer ${auth.token}` },
      };
    },
  })
  .execute();

const profile = userData.data;
console.log(profile);
```

### File Upload

```typescript
import { RequestChain } from "@flow-pipe/core";
import { AxiosRequestAdapter } from "@flow-pipe/adapter-axios";

const adapter = new AxiosRequestAdapter();

const formData = new FormData();
formData.append("file", fileBlob);
formData.append("name", "document.pdf");

const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/upload",
      method: "POST",
      data: formData,
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  },
  adapter
).execute();

console.log(result.data);
```

### Request with Timeout

```typescript
const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
      timeout: 5000, // 5 seconds
    },
  },
  adapter
).execute();
```

### Request with Authentication

```typescript
const result = await RequestChain.begin(
  {
    config: {
      url: "https://api.example.com/users",
      method: "GET",
      auth: {
        username: "user",
        password: "pass",
      },
    },
  },
  adapter
).execute();
```

## API Reference

### AxiosRequestAdapter

```typescript
class AxiosRequestAdapter extends RequestAdapter<AxiosResponse, AxiosRequestConfigType> {
  createRequest(requestConfig: AxiosRequestConfigType): Promise<AxiosResponse>;
}
```

### AxiosRequestConfigType

```typescript
type AxiosRequestConfigType = IRequestConfig & Partial<AxiosRequestConfig>;
```

Extends `IRequestConfig` with all Axios configuration options.

## Advantages over Fetch Adapter

- **Automatic JSON parsing**: No need to call `.json()` on responses
- **Better error handling**: Throws errors for HTTP error statuses
- **Request/Response interceptors**: Can be configured globally
- **Request cancellation**: Built-in support for canceling requests
- **Automatic request body serialization**: Handles FormData, URLSearchParams, etc.
- **Request/Response transformation**: Built-in support for transforming data
- **Progress tracking**: Support for upload/download progress

## Requirements

- `@flow-pipe/core` (peer dependency)
- `axios` ^1.0.0 (peer dependency)
- Node.js 18+
- TypeScript 5.0+

## License

MIT

