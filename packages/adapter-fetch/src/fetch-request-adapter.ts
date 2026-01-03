import { RequestAdapter } from "@flow-conductor/core";
import type {
  IRequestConfig,
  UrlValidationOptions,
} from "@flow-conductor/core";

/**
 * Request configuration type for Fetch adapter.
 * Extends IRequestConfig with fetch-specific options via the index signature.
 */
export type FetchRequestConfig = IRequestConfig;

/**
 * Request adapter implementation using the native Fetch API.
 * Provides a lightweight, dependency-free HTTP client adapter.
 *
 * @example
 * ```typescript
 * const adapter = new FetchRequestAdapter();
 * const chain = begin(
 *   { config: { url: 'https://api.example.com/users', method: 'GET' } },
 *   adapter
 * );
 * ```
 */
export class FetchRequestAdapter extends RequestAdapter<
  Response,
  FetchRequestConfig
> {
  /**
   * Creates a new FetchRequestAdapter instance.
   *
   * @param urlValidationOptions - Optional URL validation options to prevent SSRF attacks
   */
  constructor(urlValidationOptions?: UrlValidationOptions) {
    super(urlValidationOptions);
  }

  /**
   * Creates and executes an HTTP request using the Fetch API.
   * Automatically handles JSON serialization for request bodies.
   *
   * @param requestConfig - The request configuration object
   * @returns A promise that resolves to a Response object
   */
  public createRequest(requestConfig: IRequestConfig): Promise<Response> {
    const { data, url, ...rest } = requestConfig;
    const fetchConfig: RequestInit = { ...rest };
    if (data) {
      fetchConfig.body = typeof data === "string" ? data : JSON.stringify(data);
      fetchConfig.headers = {
        "Content-Type": "application/json",
        ...(fetchConfig.headers as Record<string, string>),
      };
    }
    return fetch(url, fetchConfig);
  }
}
