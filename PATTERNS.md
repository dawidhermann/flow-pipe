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

Flow-conductor provides multiple ways to handle errors:

#### Chain-Level Error Recovery

Handle errors for the entire chain:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

try {
  const result = await begin(
    {
      config: { url: 'https://api.example.com/users', method: 'GET' }
    },
    adapter
  )
    .withErrorHandler((error) => {
      // Log error but don't throw
      console.error('Request failed:', error);
      // Access request configuration from error.cause
      const requestConfig = error.cause?.requestConfig;
      if (requestConfig) {
        console.error('Failed request details:', {
          url: requestConfig.url,
          method: requestConfig.method
        });
      }
    })
    .execute();
  
  console.log(await result.json());
} catch (error) {
  // Handle final error if needed
  console.error('Chain execution failed:', error);
}
```

#### Stage-Level Error Recovery

Handle errors for individual stages with stage-specific recovery logic:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

try {
  const result = await begin(
    {
      config: { url: 'https://api.example.com/users/1', method: 'GET' },
      errorHandler: async (error) => {
        // Stage-specific error handling
        console.error('Failed to fetch user:', error.message);
        // Access request configuration from error.cause
        const requestConfig = error.cause?.requestConfig;
        await logError('user-fetch', error, requestConfig);
      }
    },
    adapter
  )
    .next({
      config: { url: 'https://api.example.com/users/1/posts', method: 'GET' },
      errorHandler: async (error) => {
        // Different handling for posts stage
        console.error('Failed to fetch posts:', error.message);
        // Access request configuration from error.cause
        const requestConfig = error.cause?.requestConfig;
        await logError('posts-fetch', error, requestConfig);
        // Could perform stage-specific cleanup or fallback
      }
    })
    .withErrorHandler((error) => {
      // Chain-level handler called after stage handlers
      console.error('Chain failed:', error.message);
      // Access request configuration from error.cause
      const requestConfig = error.cause?.requestConfig;
      if (requestConfig) {
        console.error('Failed at:', requestConfig.url);
      }
    })
    .execute();
  
  console.log(await result.json());
} catch (error) {
  // Final error handling
  console.error('Execution failed:', error);
}
```

#### Combining Stage and Chain Error Handlers

Use both stage-level and chain-level handlers for comprehensive error handling:

```typescript
const result = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    errorHandler: (error) => {
      // Stage-specific: log, cleanup, or perform recovery
      console.error('User fetch failed:', error);
      // Access request configuration from error.cause
      const requestConfig = error.cause?.requestConfig;
      if (requestConfig) {
        console.error('Failed request:', requestConfig.url);
      }
      // Could return a default value or perform fallback logic
    }
  },
  adapter
)
  .next({
    config: { url: 'https://api.example.com/users/1/posts', method: 'GET' },
    errorHandler: (error) => {
      // Stage-specific: handle posts fetch failure
      console.error('Posts fetch failed:', error);
      // Access request configuration from error.cause
      const requestConfig = error.cause?.requestConfig;
      if (requestConfig) {
        console.error('Failed request:', requestConfig.url);
      }
    }
  })
  .withErrorHandler((error) => {
    // Chain-level: centralized error handling
    // Called after stage handlers
    metrics.increment('chain.errors');
    // Access request configuration from error.cause
    const requestConfig = error.cause?.requestConfig;
    if (requestConfig) {
      notifyAdmin('Chain execution failed', { error, failedAt: requestConfig.url });
    } else {
      notifyAdmin('Chain execution failed', error);
    }
  })
  .execute();
```

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

#### Nesting RequestBatch inside RequestChain

Execute a batch of parallel requests as a stage in a sequential chain:

```typescript
import { begin, batch } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

// Create a batch that fetches multiple users in parallel
const userBatch = batch([
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    mapper: async (result) => await result.json()
  },
  {
    config: { url: 'https://api.example.com/users/2', method: 'GET' },
    mapper: async (result) => await result.json()
  }
], adapter);

// Chain that uses the batch, then processes the results
const result = await begin(
  {
    request: userBatch // Nested batch executes first
  },
  adapter
)
  .next({
    config: async (previousResult) => {
      // previousResult is the array of users from the batch
      const userIds = previousResult.map(user => user.id).join(',');
      return {
        url: `https://api.example.com/posts?userIds=${userIds}`,
        method: 'GET'
      };
    }
  })
  .execute();

const posts = await result.json();
console.log(posts);
```

#### Nesting RequestBatch with Mapper

Transform the batch result before passing it to the next stage:

```typescript
const userBatch = batch([
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    mapper: async (result) => await result.json()
  },
  {
    config: { url: 'https://api.example.com/users/2', method: 'GET' },
    mapper: async (result) => await result.json()
  }
], adapter);

const result = await begin(
  {
    request: userBatch,
    mapper: (users: User[]) => {
      // Transform batch result - extract user names
      return users.map(user => user.name).join(', ');
    }
  },
  adapter
)
  .next({
    config: (previousResult) => {
      // previousResult is now the string "John Doe, Jane Doe"
      return {
        url: `https://api.example.com/search?q=${previousResult}`,
        method: 'GET'
      };
    }
  })
  .execute();
```

#### Nesting RequestBatch with Previous Result Dependency

Use results from previous chain stages to build the batch dynamically:

```typescript
// First stage gets a user
const result = await begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    mapper: async (result) => await result.json()
  },
  adapter
)
  .next({
    config: async (previousResult) => {
      // Create a batch that depends on the previous result
      const userBatch = batch([
        {
          config: {
            url: `https://api.example.com/users/${previousResult.id}/posts`,
            method: 'GET'
          },
          mapper: async (result) => await result.json()
        },
        {
          config: {
            url: `https://api.example.com/users/${previousResult.id}/comments`,
            method: 'GET'
          },
          mapper: async (result) => await result.json()
        }
      ], adapter);
      
      return { request: userBatch };
    }
  })
  .next({
    config: (previousResult) => {
      // previousResult is the array from the nested batch
      return {
        url: 'https://api.example.com/process',
        method: 'POST',
        data: { posts: previousResult }
      };
    }
  })
  .execute();
```

#### Nesting RequestChain inside RequestBatch

Execute multiple sequential chains in parallel:

```typescript
import { begin, batch } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

// Create sequential chains
const chain1 = begin(
  {
    config: { url: 'https://api.example.com/users/1', method: 'GET' },
    mapper: async (result) => await result.json()
  },
  adapter
).next({
  config: (prev) => ({
    url: `https://api.example.com/users/${prev.id}/posts`,
    method: 'GET'
  }),
  mapper: async (result) => await result.json()
});

const chain2 = begin(
  {
    config: { url: 'https://api.example.com/users/2', method: 'GET' },
    mapper: async (result) => await result.json()
  },
  adapter
).next({
  config: (prev) => ({
    url: `https://api.example.com/users/${prev.id}/posts`,
    method: 'GET'
  }),
  mapper: async (result) => await result.json()
});

// Execute both chains in parallel
const batchInstance = batch([
  { request: chain1 },
  { request: chain2 }
], adapter);

const results = await batchInstance.execute();
// results[0] contains posts from user 1
// results[1] contains posts from user 2
```

#### Nesting RequestChain with Concurrency Limit

Control how many nested chains execute simultaneously:

```typescript
const batchInstance = batch([
  { request: chain1 },
  { request: chain2 },
  { request: chain3 },
  { request: chain4 }
], adapter);
batchInstance.withConcurrency(2); // Execute max 2 chains at a time

const results = await batchInstance.execute();
// Chains execute in batches: [chain1, chain2] then [chain3, chain4]
```

#### Deep Nesting

You can nest multiple levels deep for complex workflows:

```typescript
// Batch within chain within batch
const innerBatch = batch([
  { config: { url: 'https://api.example.com/users/1', method: 'GET' } },
  { config: { url: 'https://api.example.com/users/2', method: 'GET' } }
], adapter);

const middleChain = begin(
  { request: innerBatch },
  adapter
).next({
  config: (prev) => ({
    url: 'https://api.example.com/process',
    method: 'POST',
    data: { users: prev }
  })
});

const outerBatch = batch([
  { request: middleChain },
  {
    config: { url: 'https://api.example.com/other', method: 'GET' }
  }
], adapter);

const results = await outerBatch.execute();
```

#### Real-World Example: User Dashboard Data

Here's a practical example combining nested batches and chains to fetch dashboard data efficiently:

```typescript
async function fetchUserDashboard(userId: string) {
  // First, fetch user profile sequentially
  const userChain = begin(
    {
      config: { url: `/api/users/${userId}`, method: 'GET' },
      mapper: async (result) => await result.json()
    },
    adapter
  ).next({
    config: (prev) => ({
      url: `/api/users/${prev.id}/preferences`,
      method: 'GET'
    }),
    mapper: async (result) => await result.json()
  });

  // Then fetch multiple resources in parallel based on user data
  const dashboardBatch = batch([
    {
      request: userChain // Nested chain
    },
    {
      config: { url: `/api/users/${userId}/notifications`, method: 'GET' },
      mapper: async (result) => await result.json()
    },
    {
      config: { url: `/api/users/${userId}/activity`, method: 'GET' },
      mapper: async (result) => await result.json()
    }
  ], adapter);

  const [userData, notifications, activity] = await dashboardBatch.execute();
  
  return {
    user: userData.user,
    preferences: userData.preferences,
    notifications,
    activity
  };
}
```

#### Key Points About Nesting

- **RequestBatch nested in RequestChain**: The batch executes and returns an array or tuple. The next stage receives this array/tuple as `previousResult`.
- **RequestChain nested in RequestBatch**: The chain executes sequentially and returns its final result. The batch collects all chain results into an array or tuple.
- **Mappers work at each level**: You can transform results at the batch level, chain level, or individual request level.
- **Error handling**: Error handlers can be set at the batch level, chain level, or individual request level.
- **Type preservation**: Tuple types are preserved when nesting heterogeneous batches, providing type safety throughout nested structures.
- **Type safety**: TypeScript correctly infers types through nested structures. For heterogeneous batches, tuple types are preserved, providing type safety at each position in the result array.

**Benefits:**
- ✅ Combine sequential and parallel execution patterns
- ✅ Optimize performance by parallelizing independent operations
- ✅ Maintain sequential dependencies where needed
- ✅ Type-safe throughout nested structures
- ✅ Flexible error handling at each level

