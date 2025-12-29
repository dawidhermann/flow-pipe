import { RequestAdapter } from "@request-orchestrator/core";
import type {
  IRequestConfig,
  UrlValidationOptions,
} from "@request-orchestrator/core";
import superagent, { type Response, type Request } from "superagent";

/**
 * Request configuration type for Superagent adapter.
 * Extends IRequestConfig with Superagent-specific options via the index signature.
 */
export type SuperagentRequestConfig = IRequestConfig & {};

/**
 * Request adapter implementation using Superagent as the underlying HTTP client.
 * Provides a fluent API for building HTTP requests with Superagent.
 *
 * @example
 * ```typescript
 * const adapter = new SuperagentRequestAdapter();
 * const chain = begin(
 *   { config: { url: 'https://api.example.com/users', method: 'GET' } },
 *   adapter
 * );
 * ```
 */
export default class SuperagentRequestAdapter extends RequestAdapter<
  Response,
  SuperagentRequestConfig
> {
  /**
   * Creates a new SuperagentRequestAdapter instance.
   *
   * @param urlValidationOptions - Optional URL validation options to prevent SSRF attacks
   */
  constructor(urlValidationOptions?: UrlValidationOptions) {
    super(urlValidationOptions);
  }

  /**
   * Creates and executes an HTTP request using Superagent.
   * Supports all standard HTTP methods and automatically handles headers and body data.
   *
   * @param requestConfig - The request configuration object
   * @returns A promise that resolves to a Superagent Response object
   */
  public async createRequest(
    requestConfig: SuperagentRequestConfig
  ): Promise<Response> {
    const { url, method, data, headers } = requestConfig;

    // Create the request based on method
    let request: Request;
    const methodLower = method.toLowerCase();

    switch (methodLower) {
      case "get":
        request = superagent.get(url);
        break;
      case "post":
        request = superagent.post(url);
        break;
      case "put":
        request = superagent.put(url);
        break;
      case "patch":
        request = superagent.patch(url);
        break;
      case "delete":
        request = superagent.delete(url);
        break;
      case "head":
        request = superagent.head(url);
        break;
      case "options":
        request = superagent.options(url);
        break;
      default:
        request = superagent(methodLower, url);
    }

    // Set headers if provided
    if (headers) {
      request.set(headers as Record<string, string>);
    }

    // Set data/body if provided
    if (data !== undefined) {
      request.send(data);
    }

    return request;
  }
}
