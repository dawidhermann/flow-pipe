# Best Practices

This document outlines best practices and recommendations for using flow-conductor in production environments.

## 🚀 Production Checklist

Before deploying to production, make sure you've addressed these critical items:

- **Timeouts**: Did you configure a timeout? (Default is infinite!)
- **Private IPs**: Are you running in Kubernetes/Docker? Set `allowPrivateIPs: true`.
- **Error Handling**: Do you have a `.catch()` or `.withErrorHandler()` at the end of your chain?

## Request Timeouts

**Important**: flow-conductor does **not** set default timeouts for requests. You must configure timeouts manually to prevent requests from hanging indefinitely.

### Best Practice

Always set appropriate timeouts based on your use case:
- **API requests**: 5-30 seconds
- **File uploads**: 30-120 seconds
- **Long-running operations**: Configure per-operation

### Fetch Adapter Timeout

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

### Axios Adapter Timeout

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

### Superagent Adapter Timeout

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

### Node-Fetch Adapter Timeout

```typescript
import { NodeFetchRequestAdapter } from '@flow-conductor/adapter-node-fetch';

const adapter = new NodeFetchRequestAdapter();

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

## SSRF Protection Configuration

For detailed SSRF protection information, configuration options, and backend usage recommendations, see [SSRF Protection](./DOCUMENTATION.md#ssrf-protection) in the documentation.

**Quick reference**: For backend services (Kubernetes, VPC, Docker networks), enable `allowPrivateIPs: true`:

```typescript
const backendAdapter = new FetchRequestAdapter({
  allowPrivateIPs: true  // Required for internal service communication
});
```

## Error Handling

Always implement proper error handling in your request chains. For comprehensive error handling examples including chain-level and stage-level handlers, error context, and execution order, see [Error Handler](./DOCUMENTATION.md#handlers) in the documentation.

## Adapter Selection

### Recommended Adapters by Use Case

- **Fetch Adapter**: Recommended for most cases, especially modern Node.js applications and browser environments
- **Axios Adapter**: Best for applications already using Axios, need interceptors, or prefer automatic JSON parsing
- **Node-Fetch Adapter**: Ideal for Node.js-only applications that prefer node-fetch over native fetch
- **Superagent Adapter**: Good for cross-platform applications with lightweight requirements

See the [Documentation](./DOCUMENTATION.md#adapters) for detailed adapter comparison and features.

