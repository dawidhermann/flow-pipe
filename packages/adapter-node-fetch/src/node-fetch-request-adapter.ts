import { RequestAdapter } from "@request-orchestrator/core";
import type {
  IRequestConfig,
  UrlValidationOptions,
} from "@request-orchestrator/core";
import fetch from "node-fetch";
import type { RequestInit, Response } from "node-fetch";

/**
 * Request configuration type for node-fetch adapter.
 * Extends IRequestConfig with node-fetch-specific options via the index signature.
 */
export type NodeFetchRequestConfig = IRequestConfig;

/**
 * Request adapter implementation using node-fetch.
 * Provides a Node.js-specific HTTP client adapter that works in Node.js environments.
 *
 * @example
 * ```typescript
 * const adapter = new NodeFetchRequestAdapter();
 * const chain = begin(
 *   { config: { url: 'https://api.example.com/users', method: 'GET' } },
 *   adapter
 * );
 * ```
 */
export default class NodeFetchRequestAdapter extends RequestAdapter<
  Response,
  NodeFetchRequestConfig
> {
  /**
   * Creates a new NodeFetchRequestAdapter instance.
   *
   * @param urlValidationOptions - Optional URL validation options to prevent SSRF attacks
   */
  constructor(urlValidationOptions?: UrlValidationOptions) {
    super(urlValidationOptions);
  }

  /**
   * Creates and executes an HTTP request using node-fetch.
   * Automatically handles JSON serialization for request bodies.
   *
   * @param requestConfig - The request configuration object
   * @returns A promise that resolves to a Response object
   */
  public async createRequest(requestConfig: IRequestConfig): Promise<Response> {
    const { data, url, method, headers, ...rest } = requestConfig;
    const fetchConfig: RequestInit = {
      method,
      ...rest,
    };

    // Handle headers - merge with existing headers if any
    const headersObj: Record<string, string> = headers
      ? { ...(headers as Record<string, string>) }
      : {};

    // Handle request body
    if (data !== undefined) {
      if (data === null) {
        fetchConfig.body = JSON.stringify(null);
        // Set Content-Type header if not already set
        if (!headersObj["Content-Type"] && !headersObj["content-type"]) {
          headersObj["Content-Type"] = "application/json";
        }
      } else if (typeof data === "string") {
        fetchConfig.body = data;
      } else if (data instanceof Buffer) {
        fetchConfig.body = data;
      } else if (data instanceof Uint8Array) {
        fetchConfig.body = Buffer.from(data);
      } else {
        fetchConfig.body = JSON.stringify(data);
        // Set Content-Type header if not already set
        if (!headersObj["Content-Type"] && !headersObj["content-type"]) {
          headersObj["Content-Type"] = "application/json";
        }
      }
    }

    // Set headers if we have any
    if (Object.keys(headersObj).length > 0) {
      fetchConfig.headers = headersObj;
    }

    return fetch(url, fetchConfig);
  }
}
