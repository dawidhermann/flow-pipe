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

### Backend Usage Recommendation

flow-conductor is designed for backend API services and microservice orchestration. In backend environments (Kubernetes, AWS VPC, Docker networks), services communicate using private IP addresses. The default blocking of private IPs will prevent the library from working in most enterprise infrastructure scenarios.

**Recommendation**: For Node.js backend environments where you control the URLs being requested (not user-provided URLs), enable `allowPrivateIPs: true` by default. Only keep the private IP blocking enabled when the library acts as a proxy for URLs provided by end users, where SSRF protection is critical.

### Configuration Examples

```typescript
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
import { UrlValidationOptions } from '@flow-conductor/core';

// Recommended for backend services (Kubernetes, VPC, Docker networks)
const backendAdapter = new FetchRequestAdapter({
  allowPrivateIPs: true  // Required for internal service communication
});

// Allow localhost for local development
const devAdapter = new FetchRequestAdapter({
  allowLocalhost: true
});

// For user-facing proxies (where SSRF protection is critical)
// Keep default blocking enabled - do NOT set allowPrivateIPs: true
const proxyAdapter = new FetchRequestAdapter();

// Custom protocol allowlist
const customAdapter = new FetchRequestAdapter({
  allowedProtocols: ['http:', 'https:', 'ws:', 'wss:']
});
```

**⚠️ WARNING**: Disabling or relaxing URL validation can expose your application to SSRF attacks. Only do this if you fully understand the security implications and trust all URL inputs.

### Disabling Validation (Not Recommended)

```typescript
// ⚠️ SECURITY RISK: Only use in trusted environments
const unsafeAdapter = new FetchRequestAdapter({
  disableValidation: true
});
```

## Error Handling

Always implement proper error handling in your request chains:

```typescript
// Chain-level error handler
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

// Stage-level error handler
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
).execute();
```

## Adapter Selection

### Recommended Adapters by Use Case

- **Fetch Adapter**: Recommended for most cases, especially modern Node.js applications and browser environments
- **Axios Adapter**: Best for applications already using Axios, need interceptors, or prefer automatic JSON parsing
- **Node-Fetch Adapter**: Ideal for Node.js-only applications that prefer node-fetch over native fetch
- **Superagent Adapter**: Good for cross-platform applications with lightweight requirements

See the [Documentation](./DOCUMENTATION.md#adapters) for detailed adapter comparison and features.

