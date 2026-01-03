# Common Patterns

This document describes common patterns and use cases for flow-conductor. For complete API documentation, see [DOCUMENTATION.md](./DOCUMENTATION.md).

## Table of Contents

- [Webhook Processing Pipeline](#webhook-processing-pipeline)
- [Authentication Flow](#authentication-flow)
- [Data Aggregation](#data-aggregation)
- [The Accumulator Pattern (Passing Context)](#the-accumulator-pattern-passing-context)
- [Error Recovery](#error-recovery)
- [Retry with Exponential Backoff](#retry-with-exponential-backoff)
- [Conditional Requests](#conditional-requests)
- [Nested Batch and Chained Requests](#nested-batch-and-chained-requests)

### Webhook Processing Pipeline

A common use case for flow-conductor is processing webhooks that require multiple sequential API calls:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

async function processPaymentWebhook(paymentId: string) {
  return begin(
    {
      config: {
        url: `/api/payments/${paymentId}`,
        method: 'GET'
      }
    },
    adapter
  )
    .next({
      config: async (prev) => {
        const payment = await prev.json();
        return {
          url: `/api/orders/${payment.orderId}`,
          method: 'PATCH',
          data: { status: 'paid', paymentId: payment.id }
        };
      }
    })
    .next({
      config: async (prev) => {
        const order = await prev.json();
        return {
          url: '/api/inventory/reserve',
          method: 'POST',
          data: { orderId: order.id, items: order.items }
        };
      }
    })
    .next({
      config: async (prev) => {
        const order = await prev.json();
        return {
          url: '/api/emails/send',
          method: 'POST',
          data: {
            to: order.customer.email,
            template: 'order-confirmation',
            orderId: order.id
          }
        };
      }
    })
    .withErrorHandler(async (error) => {
      // Centralized error handling with compensation
      await logError('payment-webhook', error);
      if (error.step === 'inventory') {
        // Rollback order status
        await fetch(`/api/orders/${error.context.orderId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'pending' })
        });
      }
    })
    .withFinishHandler(() => {
      metrics.increment('webhook.payment.processed');
    })
    .execute();
}
```

### Authentication Flow

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

// Login and use token for subsequent requests
const userData = await begin(
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
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

// Fetch user, then their posts, then comments
const allData = await begin(
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

### The Accumulator Pattern (Passing Context)

Sometimes a later stage needs data from an earlier stage. Instead of relying on external variables or re-fetching data, you can accumulate context in your mappers and pass it through the chain. This is called the **accumulator pattern**.

#### Basic Accumulator Pattern

Build up an object containing all the data you need:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const result = await begin(
  {
    config: { url: '/users/1', method: 'GET' },
    // Return an object containing the context you want to pass down
    mapper: async (res) => {
      const user = await res.json();
      return { user };
    }
  },
  adapter
)
  .next({
    config: (prev) => {
      // prev is { user: {...} }
      return {
        url: `/users/${prev.user.id}/orders`,
        method: 'GET'
      };
    },
    // Merge previous context with new result
    mapper: async (res, prev) => {
      const orders = await res.json();
      return {
        ...prev, // Keep user data
        orders   // Add orders
      };
    }
  })
  .next({
    config: (prev) => {
      // Now you have access to both user and orders!
      console.log(`Processing for ${prev.user.name} with ${prev.orders.length} orders`);
      return {
        url: '/final-step',
        method: 'POST',
        data: {
          userId: prev.user.id,
          orderCount: prev.orders.length,
          totalAmount: prev.orders.reduce((sum, order) => sum + order.total, 0)
        }
      };
    }
  })
  .execute();
```

#### Why Use the Accumulator Pattern?

**Without accumulator pattern** - Re-fetching or using external variables:

```typescript
// ❌ Bad: Re-fetching data
.next({
  config: async (prev) => {
    const user = await fetch('/users/1').then(r => r.json()); // Re-fetch!
    const orders = await prev.json();
    return { url: `/process/${user.id}`, method: 'POST' };
  }
})

// ❌ Bad: Using external variables
let userData; // External variable
.begin({ config: {...}, mapper: (r) => { userData = await r.json(); } })
.next({ config: (prev) => { /* use userData */ } })
```

**With accumulator pattern** - Clean, type-safe, no side effects:

```typescript
// ✅ Good: Accumulate data through the chain
.begin({
  config: {...},
  mapper: async (r) => ({ user: await r.json() })
})
.next({
  config: (prev) => { /* prev.user is available */ },
  mapper: async (r, prev) => ({ ...prev, orders: await r.json() })
})
.next({
  config: (prev) => { /* prev.user AND prev.orders available */ }
})
```

#### Type Safety with Accumulator Pattern

TypeScript correctly infers types through the accumulator pattern:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

interface Order {
  id: number;
  total: number;
  items: string[];
}

const result = await begin<{ user: User }, Response, IRequestConfig>(
  {
    config: { url: '/users/1', method: 'GET' },
    mapper: async (res) => ({ user: await res.json() })
  },
  adapter
)
  .next<{ user: User; orders: Order[] }>({
    config: (prev) => {
      // TypeScript knows prev.user exists and has type User
      return { url: `/users/${prev.user.id}/orders`, method: 'GET' };
    },
    mapper: async (res, prev) => {
      // TypeScript knows prev.user is User type
      const orders = await res.json();
      return { ...prev, orders };
    }
  })
  .next<{ user: User; orders: Order[] }>({
    config: (prev) => {
      // TypeScript knows prev has both user (User) and orders (Order[])
      return {
        url: '/process',
        method: 'POST',
        data: {
          userName: prev.user.name,      // ✅ Type-safe
          orderCount: prev.orders.length  // ✅ Type-safe
        }
      };
    }
  })
  .execute();
```

#### Real-World Example: Order Processing

Here's a complete example showing how to accumulate order processing context:

```typescript
async function processOrder(orderId: string) {
  return begin(
    {
      config: { url: `/orders/${orderId}`, method: 'GET' },
      mapper: async (res) => {
        const order = await res.json();
        return { order };
      }
    },
    adapter
  )
    .next({
      config: (prev) => ({
        url: `/customers/${prev.order.customerId}`,
        method: 'GET'
      }),
      mapper: async (res, prev) => {
        const customer = await res.json();
        return {
          ...prev,
          customer
        };
      }
    })
    .next({
      config: (prev) => ({
        url: `/inventory/check`,
        method: 'POST',
        data: {
          items: prev.order.items.map(item => item.productId)
        }
      }),
      mapper: async (res, prev) => {
        const inventory = await res.json();
        return {
          ...prev,
          inventory
        };
      }
    })
    .next({
      config: (prev) => {
        // All context available: order, customer, inventory
        return {
          url: '/orders/fulfill',
          method: 'POST',
          data: {
            orderId: prev.order.id,
            customerEmail: prev.customer.email,
            items: prev.inventory.availableItems
          }
        };
      }
    })
    .execute();
}
```

**Benefits:**
- ✅ No external variables or closures needed
- ✅ Type-safe access to accumulated data
- ✅ Easy to test - each stage is independent
- ✅ Clear data flow - see exactly what data is available at each stage
- ✅ No re-fetching - data flows through the chain efficiently

### Error Recovery

Flow-conductor provides multiple ways to handle errors including chain-level and stage-level error handlers. For comprehensive error handling examples, error context information, execution order, and best practices, see [Error Handler](./DOCUMENTATION.md#handlers) in the documentation.

### Retry with Exponential Backoff

Handle transient failures with automatic retry and exponential backoff:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
import { retryOnNetworkOrStatusCodes } from '@flow-conductor/core';

const adapter = new FetchRequestAdapter();

const result = await begin(
  {
    config: { url: 'https://api.example.com/users', method: 'GET' },
    retry: {
      maxRetries: 5,
      retryDelay: 1000, // Start with 1 second
      exponentialBackoff: true, // Double each time: 1s, 2s, 4s, 8s, 16s
      maxDelay: 10000, // Cap at 10 seconds
      retryCondition: retryOnNetworkOrStatusCodes(500, 502, 503, 504, 429)
    }
  },
  adapter
).execute();

console.log(await result.json());
```

### Conditional Requests

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const shouldFetchPosts = true;

const chain = begin(
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

### Nested Batch and Chained Requests

Flow-conductor supports nesting `RequestBatch` inside `RequestChain` and `RequestChain` inside `RequestBatch`. This allows you to combine sequential and parallel execution patterns in powerful ways.

For comprehensive examples including nesting patterns, mappers, concurrency limits, deep nesting, and type safety, see [Nested Request Managers](./DOCUMENTATION.md#nested-request-managers) in the documentation.

