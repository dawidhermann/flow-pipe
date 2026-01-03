# flow-conductor

**Declarative API workflow orchestration for Node.js**

Stop writing spaghetti code for complex API workflows. Flow-conductor gives you a declarative, type-safe way to orchestrate sequential HTTP operations with built-in error handling, compensation, and observability.

## Quick Start

### Example: Stripe Webhook Processing

**Without flow-conductor** - 80+ lines of error handling spaghetti:

```typescript
app.post('/webhook/stripe', async (req, res) => {
  try {
    // Validate signature
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(req.body, sig, secret);
    
    // Get order
    const orderResp = await fetch(`/api/orders/by-payment/${event.data.object.id}`);
    if (!orderResp.ok) {
      await logError('Failed to fetch order');
      return res.status(500).json({ error: 'Order fetch failed' });
    }
    const order = await orderResp.json();
    
    // Update order
    const updateResp = await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paid' })
    });
    if (!updateResp.ok) {
      await logError('Failed to update order');
      return res.status(500).json({ error: 'Update failed' });
    }
    
    // Reserve inventory
    const inventoryResp = await fetch('/api/inventory/reserve', {
      method: 'POST',
      body: JSON.stringify({ orderId: order.id })
    });
    if (!inventoryResp.ok) {
      // Rollback logic...
      await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pending' })
      });
      return res.status(500).json({ error: 'Inventory failed' });
    }
    
    // Send email, create shipping label, notify Slack...
    // More error handling everywhere...
    
    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});
```

**With flow-conductor** - Clean, declarative workflow:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

app.post('/webhook/stripe', async (req, res) => {
  try {
    await processStripeWebhook(req.body, req.headers['stripe-signature']);
    res.json({ received: true });
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

async function processStripeWebhook(body: string, signature: string) {
  return begin(
    {
      config: {
        url: '/webhooks/stripe/validate',
        method: 'POST',
        data: { body, signature }
      },
      mapper: async (response) => {
        // Extract validated event from validation response
        const validation = await response.json();
        return validation.event; // Return the validated event object
      }
    },
    adapter
  )
    .next({
      config: async (prev) => {
        // prev is the validated event from step 1
        // This demonstrates sequential dependency - step 2 uses step 1's result
        return { url: `/orders/by-payment/${prev.data.object.id}` };
      }
    })
    .next({
      config: async (prev) => {
        const order = await prev.json();
        return {
          url: `/orders/${order.id}`,
          method: 'PATCH',
          data: { status: 'paid' }
        };
      }
    })
    .next({
      config: async (prev) => {
        const order = await prev.json();
        return {
          url: '/inventory/reserve',
          method: 'POST',
          data: { orderId: order.id }
        };
      }
    })
    .next({
      config: async (prev) => {
        const order = await prev.json();
        return {
          url: '/emails/send',
          method: 'POST',
          data: { to: order.customer.email, template: 'order-confirmation' }
        };
      }
    })
    .next({
      config: async (prev) => {
        const order = await prev.json();
        return {
          url: '/shipping/create-label',
          method: 'POST',
          data: { orderId: order.id }
        };
      }
    })
    .withErrorHandler(async (error) => {
      // Example error handling - implement these functions in your application
      await logError('stripe-webhook', error);
      await rollbackIfNeeded(error);
    })
    .withFinishHandler(() => {
      metrics.increment('webhook.processed');
    })
    .execute();
}
```

### Example: OAuth Flow

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

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

### Simple Example

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const result = await begin(
  { config: { url: 'https://api.example.com/users/1', method: 'GET' } },
  adapter
).execute();

console.log(await result.json());
```

## Key Advantages

### Type Safety Across Steps
```typescript
begin(
  {
    config: { url: '/api/users/1', method: 'GET' },
    mapper: async (response) => await response.json() // Extract JSON data
  },
  adapter
)
.next({
  config: (prev) => {
    // prev is typed based on previous mapper!
    // TypeScript knows prev has userId because mapper returned the JSON object
    return { url: `/api/posts?userId=${prev.userId}` };
  }
})
```

### Declarative Error Handling
```typescript
.withErrorHandler((error) => {
  // Access request context from error.cause
  const config = error.cause?.requestConfig;
  if (config?.id === 'payment') rollbackInventory();
  if (config?.id === 'inventory') refundPayment();
})
```

### Testability
```typescript
// Mock adapter, test each step independently
const mockAdapter = new MockRequestAdapter();
const chain = createWebhookChain(mockAdapter);
// Test without hitting real APIs
```

### Observability
```typescript
.withFinishHandler(() => metrics.increment('workflow.complete'))
```

### Composability
```typescript
const authFlow = createAuthFlow();
const dataFlow = createDataFlow();

begin(authFlow, adapter)
  .next({ request: dataFlow })
  .execute();
```

## Installation

```bash
npm install flow-conductor
```

Or install packages individually:

```bash
# Core package (required)
npm install @flow-conductor/core

# Choose your adapter:
npm install @flow-conductor/adapter-fetch         # Native Fetch API
npm install @flow-conductor/adapter-node-fetch    # node-fetch adapter
npm install @flow-conductor/adapter-axios         # Axios adapter
npm install @flow-conductor/adapter-superagent    # Superagent adapter
```

## Request Adapters

Flow-conductor uses a **modular adapter system** - you choose which HTTP library to use:

- **`FetchRequestAdapter`** - Native Fetch API (Node.js 18+, browsers) - Zero dependencies
- **`NodeFetchRequestAdapter`** - node-fetch package (Node.js only)
- **`AxiosRequestAdapter`** - Axios with automatic JSON parsing
- **`SuperagentRequestAdapter`** - Superagent for cross-platform support

All adapters share the same API - easy to switch:

```typescript
import { begin } from '@flow-conductor/core';
import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';

const adapter = new FetchRequestAdapter();

const result = await begin(
  { config: { url: '...', method: 'GET' } },
  adapter
).execute();
```

## Features

- 🔗 **Chain Requests**: Link multiple HTTP requests in sequence
- 🔄 **Result Transformation**: Map and transform request results
- 🎬 **Result Interceptors**: Perform side effects on results (logging, caching, analytics)
- 📊 **Previous Result Access**: Each step can use the previous request's result
- 🎯 **Handler Support**: Result, error, and finish handlers
- 🔁 **Automatic Retry**: Configurable retry mechanism with exponential backoff
- 📦 **Batch Execution**: Execute all requests and get all results
- 🌊 **Progressive Chunk Processing**: Process large streaming responses incrementally
- 🔌 **Modular Adapters**: Choose from Fetch, Axios, or Superagent adapters
- 🎨 **Nested Chains**: Support for nested request managers
- ⚡ **TypeScript First**: Full TypeScript support with type inference
- 🔒 **Built-in SSRF Protection**: Automatic URL validation

## When you need flow-conductor

❌ **Simple data fetching** → Use `fetch()` or `axios`  
❌ **React data management** → Use React Query or RTK Query  
✅ **Complex backend workflows** → Use flow-conductor  
✅ **Multi-step API orchestration** → Use flow-conductor  
✅ **Webhook processing pipelines** → Use flow-conductor  
✅ **LLM agent tool chains** → Use flow-conductor

## Is flow-conductor for you?

✅ **YES** if you're building:
- Backend API services with complex workflows
- Webhook processors
- CLI tools that chain multiple APIs
- AI agents / LangChain-like systems
- Microservice orchestration
- ETL pipelines
- E-commerce order processing

❌ **NO** if you're building:
- Simple CRUD APIs
- React/Vue frontend apps
- Single-page applications
- Anything where React Query fits better
- **Long-running workflows that must survive crashes** (use Temporal.io instead)
- **Critical business processes requiring durability** (use Step Functions/Inngest instead)

🤔 **MAYBE** if:
- You have 3-5 sequential API calls
- Error handling is becoming complex
- You want better testability

## Why not just use fetch() + async/await?

You should! For simple cases like:
- Single API call
- 2-3 sequential requests
- React component data fetching

Use flow-conductor when you have:
- 5+ sequential API calls where each depends on previous result
- Complex error handling with compensation logic
- Need to transform data between steps
- Want declarative, testable API workflows
- Building webhook processors or agent systems

## flow-conductor vs Alternatives

| Tool | Use Case | flow-conductor Advantage |
|------|----------|---------------------|
| fetch/axios | Simple requests | ❌ Use those instead |
| React Query | Frontend caching | ❌ Different problem |
| Bull/BullMQ | Background jobs | ✅ flow-conductor = sync workflows |
| Temporal | Complex orchestration | ✅ flow-conductor = simpler, lighter (but NOT durable) |
| Inngest | Serverless workflows | ✅ flow-conductor = self-hosted (but NOT durable) |

### ⚠️ Important: Durability and Crash Recovery

**Flow-conductor is NOT a durable workflow engine.** It's an in-memory orchestration library designed for synchronous, short-lived workflows.

- ❌ **No state persistence**: Workflow state is lost if the server crashes
- ❌ **No automatic recovery**: Workflows don't resume after crashes
- ✅ **Simple and lightweight**: Perfect for webhook processing, API orchestration, and request chains
- ✅ **Synchronous execution**: Workflows complete in seconds/minutes

**Use flow-conductor for:**
- Webhook processing (can be retried by webhook provider)
- API request orchestration
- Short-lived workflows (< 5 minutes)
- Scenarios where losing a workflow on crash is acceptable

**Use Temporal.io / Step Functions / Inngest for:**
- Long-running workflows (hours/days)
- Critical business processes that must complete
- Workflows that need to survive server crashes
- Exactly-once execution guarantees

See [Durability and Crash Recovery](./DOCUMENTATION.md#important-durability-and-crash-recovery) in the documentation for detailed comparison.

## Documentation

For complete documentation, including:
- Detailed usage examples
- Advanced features (retry, chunk processing, nested chains)
- Adapter comparison and configuration
- API reference
- Common patterns
- Security guidelines
- Troubleshooting

See **[DOCUMENTATION.md](./DOCUMENTATION.md)**.

## License

MIT
