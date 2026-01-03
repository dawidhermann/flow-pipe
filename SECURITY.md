# Security Policy

## Supported Versions

We actively support and provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via GitHub's Security Advisory feature:

**Report here**: [GitHub Security Advisory](https://github.com/dawidhermann/flow-conductor/security/advisories/new)

This allows us to:
- Review the vulnerability privately
- Coordinate a fix before public disclosure
- Credit you for the discovery (if desired)

### What to Include

When reporting a vulnerability, please include:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact and severity
- Suggested fix (if any)
- Your contact information

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity (typically 30-90 days)

We appreciate your help in keeping flow-conductor secure!

## Security Features

### SSRF Protection

flow-conductor includes built-in protection against Server-Side Request Forgery (SSRF) attacks. For detailed information about SSRF protection, default behavior, configuration options, and best practices, see [SSRF Protection](./DOCUMENTATION.md#ssrf-protection) in the documentation.

When a potentially dangerous URL is detected, flow-conductor throws an `SSRFError`:

```typescript
import { SSRFError } from '@flow-conductor/core';

try {
  await begin(
    { config: { url: 'http://localhost:3000', method: 'GET' } },
    adapter
  ).execute();
} catch (error) {
  if (error instanceof SSRFError) {
    console.error('SSRF protection blocked request:', error.message);
  }
}
```

## Security Best Practices

### 1. Always Validate User Input

Even with built-in SSRF protection, always validate and sanitize user-provided URLs:

```typescript
function sanitizeUserUrl(userInput: string): string {
  // Whitelist approach: Only allow specific domains
  const allowedDomains = ['api.example.com', 'api.trusted.com'];
  const url = new URL(userInput);
  
  if (!allowedDomains.includes(url.hostname)) {
    throw new Error('Domain not allowed');
  }
  
  return userInput;
}
```

### 2. Use Environment Variables for Sensitive Data

Never hardcode API keys, tokens, or credentials:

```typescript
// ✅ Good
const adapter = new FetchRequestAdapter();
const result = await RequestChain.begin(
  {
    config: {
      url: process.env.API_URL,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.API_TOKEN}`
      }
    }
  },
  adapter
).execute();

// ❌ Bad
const result = await RequestChain.begin(
  {
    config: {
      url: 'https://api.example.com',
      headers: {
        Authorization: 'Bearer hardcoded-token-12345' // Never do this!
      }
    }
  },
  adapter
).execute();
```

### 3. Implement Rate Limiting

For server-side usage, implement rate limiting to prevent abuse:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
```

### 4. Use HTTPS in Production

Always use HTTPS for production requests:

```typescript
// ✅ Good
const url = 'https://api.example.com/data';

// ❌ Bad (unless in development)
const url = 'http://api.example.com/data';
```

### 5. Set Request Timeouts

**Important**: flow-conductor does **not** set default timeouts for requests. You must configure timeouts manually to prevent requests from hanging indefinitely.

For detailed timeout configuration examples for all adapters, see [Request Timeouts](./BEST_PRACTICES.md#request-timeouts) in Best Practices or [Adapters](./DOCUMENTATION.md#adapters) in the documentation.

### 6. Handle Errors Gracefully

Always handle errors and avoid exposing sensitive information. For comprehensive error handling examples including chain-level and stage-level handlers, see [Error Handler](./DOCUMENTATION.md#handlers) in the documentation.

### 7. Validate Response Data

Validate and sanitize response data before using it:

```typescript
const result = await RequestChain.begin(
  { config: { url: 'https://api.example.com/users', method: 'GET' } },
  adapter
).execute();

const data = await result.json();

// Validate response structure
if (!Array.isArray(data) || !data.every(user => user.id && user.name)) {
  throw new Error('Invalid response format');
}
```

## Known Security Considerations

### Server-Side Usage

When using flow-conductor server-side:

1. **SSRF Protection**: Enabled by default, but ensure you're not disabling it unnecessarily
2. **Input Validation**: Always validate user-provided URLs, even with SSRF protection
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Error Handling**: Don't expose internal error details to clients

### Client-Side Usage

When using flow-conductor in browsers:

1. **CORS**: Be aware of CORS policies when making cross-origin requests
2. **Credentials**: Use `credentials: 'include'` carefully - only for trusted domains
3. **XSS Prevention**: Ensure response data is properly sanitized before rendering

## Dependency Security

We regularly update dependencies and monitor for security vulnerabilities:

- **Automated Scanning**: We use `npm audit` to check for vulnerabilities
- **Dependency Updates**: Dependencies are updated regularly
- **Minimal Dependencies**: We keep dependencies minimal to reduce attack surface

To check for vulnerabilities in your project:

```bash
npm audit
```

## Security Updates

Security updates are released as:

- **Patch versions** (1.0.x) for security fixes
- **Minor versions** (1.x.0) for security features that don't break compatibility

We recommend keeping flow-conductor up to date:

```bash
npm update flow-conductor
```

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

## License

This security policy is part of the flow-conductor project and is subject to the same license terms.

