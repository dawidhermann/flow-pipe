import type RequestFlow from "../request-manager";
import type { ChunkHandler } from "./handlers";

/**
 * Supported HTTP methods for requests
 */
type HttpMethods =
  | "GET"
  | "POST"
  | "PATCH"
  | "PUT"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "CONNECT"
  | "TRACE";

/**
 * Base interface for HTTP request configuration.
 * Extend this interface to add adapter-specific configuration options.
 *
 * @example
 * ```typescript
 * interface MyRequestConfig extends IRequestConfig {
 *   timeout?: number;
 *   retries?: number;
 * }
 * ```
 */
export interface IRequestConfig {
  /** The URL to make the request to */
  url: string;
  /** The HTTP method to use */
  method: HttpMethods;
  /** Optional request body data */
  data?: any;
  /** Additional adapter-specific configuration options */
  [key: string]: any;
}

/**
 * Factory function type for creating request configurations dynamically based on previous results.
 *
 * @template Result - The type of the previous result
 * @template AdapterRequestConfig - The type of request configuration to create
 * @param previousResult - The result from the previous pipeline stage (optional)
 * @returns The request configuration object
 */
export type IRequestConfigFactory<
  Result,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig,
> = (previousResult?: Result) => AdapterRequestConfig;

/**
 * Configuration for retry behavior when a request fails.
 *
 * @example
 * ```typescript
 * // Retry on network errors and 5xx status codes
 * retry: {
 *   maxRetries: 3,
 *   retryDelay: 1000,
 *   exponentialBackoff: true,
 *   maxDelay: 10000,
 *   retryCondition: (error, attempt) => {
 *     // Retry on network errors
 *     if (error.name === 'TypeError' || error.name === 'NetworkError') {
 *       return true;
 *     }
 *     // Retry on 5xx and 429 status codes
 *     const status = getErrorStatus(error);
 *     return status !== undefined && (status >= 500 || status === 429);
 *   }
 * }
 * ```
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts. Defaults to 3.
   */
  maxRetries?: number;
  /**
   * Delay between retries in milliseconds.
   * Can be a fixed number or a function that calculates delay based on attempt number and error.
   * Defaults to 1000ms.
   *
   * @example
   * ```typescript
   * // Fixed delay
   * retryDelay: 2000
   *
   * // Custom delay function
   * retryDelay: (attempt, error) => attempt * 1000
   *
   * // Exponential backoff (use exponentialBackoff: true instead)
   * retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 10000)
   * ```
   */
  retryDelay?: number | ((attempt: number, error: Error) => number);
  /**
   * Whether to use exponential backoff for retry delays.
   * When true, delays will be: delay * 2^attempt, capped at maxDelay if provided.
   * Defaults to false.
   */
  exponentialBackoff?: boolean;
  /**
   * Maximum delay cap in milliseconds when using exponential backoff.
   * Prevents delays from growing too large.
   * Only applies when exponentialBackoff is true.
   */
  maxDelay?: number;
  /**
   * Function that determines whether to retry based on the error and attempt number.
   * Return true to retry, false to stop retrying.
   * If not provided, defaults to retrying on network errors only.
   *
   * @param error - The error that occurred
   * @param attempt - The current attempt number (0-indexed, so first retry is attempt 1)
   * @returns True if the request should be retried, false otherwise
   */
  retryCondition?: (error: Error, attempt: number) => boolean;
}

/**
 * Base interface for pipeline stages.
 * Defines common properties shared by all pipeline stage types.
 *
 * @template Result - The type of result from the stage
 * @template Out - The output type after mapping (defaults to Result)
 */
export interface BasePipelineStage<Result, Out = Result> {
  /**
   * Optional precondition function. If provided and returns false, the stage will be skipped.
   */
  precondition?: () => boolean;
  /**
   * The result produced by this stage (set after execution)
   */
  result?: Out;
  /**
   * Optional mapper function to transform the stage result.
   * Can return a value or a promise.
   */
  mapper?: (result: Result) => Out | Promise<Out>;

  /**
   * Optional result interceptor function to process the stage result.
   * Can be used to perform additional actions on the result.
   * @param result - The result from the stage
   */
  resultInterceptor?: (result: Out) => void | Promise<void>;
}

/**
 * Configuration for progressive chunk processing of streaming responses.
 * Enables processing large responses incrementally without loading everything into memory.
 *
 * @example
 * ```typescript
 * chunkProcessing: {
 *   enabled: true,
 *   chunkHandler: async (chunk, metadata) => {
 *     console.log(`Chunk ${metadata.index}:`, chunk);
 *     await processChunk(chunk);
 *   },
 *   chunkSize: 1024, // Process in 1KB chunks
 *   encoding: 'utf-8'
 * }
 * ```
 */
export interface ChunkProcessingConfig<Chunk = string | Uint8Array> {
  /**
   * Whether chunk processing is enabled. Defaults to false.
   * When enabled, the response body will be processed as a stream.
   */
  enabled: boolean;
  /**
   * Handler function called for each chunk as it arrives.
   * Required when chunk processing is enabled.
   */
  chunkHandler: ChunkHandler<Chunk>;
  /**
   * Size of each chunk in bytes. Only applies to binary data.
   * For text streams, chunks are delimited by newlines or the stream.
   * Defaults to 8192 (8KB).
   */
  chunkSize?: number;
  /**
   * Text encoding for text-based streams. Defaults to 'utf-8'.
   * Ignored for binary streams.
   * Common values: 'utf-8', 'utf-16', 'ascii', etc.
   */
  encoding?: string;
  /**
   * Whether to accumulate chunks and return them as a complete result.
   * When false, only the chunk handler is called and the final result may be empty.
   * Defaults to false.
   */
  accumulate?: boolean;
}

/**
 * Pipeline stage that executes an HTTP request using the adapter.
 *
 * @template Result - The type of result from the adapter
 * @template Out - The output type after mapping (defaults to Result)
 * @template AdapterRequestConfig - The type of request configuration
 */
export interface PipelineRequestStage<
  Result,
  Out = Result,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig,
> extends BasePipelineStage<Result, Out> {
  /**
   * Request configuration. Can be a static config object or a factory function
   * that creates the config based on previous results.
   */
  config:
    | AdapterRequestConfig
    | IRequestConfigFactory<Result, AdapterRequestConfig>;
  /**
   * Optional retry configuration for handling request failures.
   * Only applies to request stages, not nested manager stages.
   */
  retry?: RetryConfig;
  /**
   * Optional chunk processing configuration for progressive processing of streaming responses.
   * Enables processing large responses incrementally without loading everything into memory.
   * Only applies to request stages that support streaming (e.g., Fetch API with ReadableStream).
   */
  chunkProcessing?: ChunkProcessingConfig;
}

/**
 * Pipeline stage that executes a nested request flow/chain.
 *
 * @template Out - The output type of the nested request flow
 * @template AdapterExecutionResult - The type of result returned by the adapter
 * @template AdapterRequestConfig - The type of request configuration
 */
export interface PipelineManagerStage<
  Out,
  AdapterExecutionResult,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig,
> extends BasePipelineStage<Out> {
  /**
   * The nested request flow to execute
   */
  request: RequestFlow<Out, AdapterExecutionResult, AdapterRequestConfig>;
}
