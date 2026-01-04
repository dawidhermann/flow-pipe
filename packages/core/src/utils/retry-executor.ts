import type RequestAdapter from "../request-adapter";
import type { IRequestConfig, RetryConfig, ChunkProcessingConfig } from "../models/request-params";
import { defaultRetryCondition } from "./retry-utils";
import { processResponseStream, hasReadableStream } from "./chunk-processor";

/**
 * Sleeps for the specified number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 * @returns A promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates the delay before the next retry attempt.
 *
 * @param attempt - The current attempt number (1-indexed for retries)
 * @param error - The error that occurred
 * @param retryConfig - The retry configuration
 * @returns The delay in milliseconds
 */
export function calculateRetryDelay(
  attempt: number,
  error: Error,
  retryConfig: RetryConfig
): number {
  const baseDelay = retryConfig.retryDelay ?? 1000;
  const maxDelay = retryConfig.maxDelay;

  let delay: number;

  if (typeof baseDelay === "function") {
    // Custom delay function
    delay = baseDelay(attempt, error);
  } else if (retryConfig.exponentialBackoff) {
    // Exponential backoff: delay * 2^attempt
    delay = baseDelay * Math.pow(2, attempt - 1);
    // Apply maxDelay cap if provided
    if (maxDelay !== undefined && delay > maxDelay) {
      delay = maxDelay;
    }
  } else {
    // Fixed delay
    delay = baseDelay;
  }

  return Math.max(0, delay);
}

/**
 * Processes a result with chunk processing if enabled.
 * Handles streaming responses by processing chunks progressively.
 *
 * @template Out - The output type
 * @template AdapterExecutionResult - The type of result returned by the adapter
 * @param rawResult - The raw result from the adapter
 * @param adapter - The request adapter instance
 * @param chunkProcessing - Optional chunk processing configuration
 * @returns A promise that resolves to the processed result
 */
export async function processResultWithChunks<Out, AdapterExecutionResult>(
  rawResult: AdapterExecutionResult,
  adapter: RequestAdapter<AdapterExecutionResult, any>,
  chunkProcessing?: ChunkProcessingConfig
): Promise<Out> {
  // If chunk processing is enabled and result is a Response with readable stream
  if (
    chunkProcessing?.enabled &&
    rawResult instanceof Response &&
    hasReadableStream(rawResult)
  ) {
    // Clone the response to avoid consuming the original stream
    const clonedResponse = rawResult.clone();

    // Process the stream
    const processed = await processResponseStream(clonedResponse, {
      ...chunkProcessing,
    });

    // If accumulation is enabled, return the accumulated data
    // Otherwise, return the original response (chunks were processed via handler)
    if (chunkProcessing.accumulate && processed !== rawResult) {
      return processed as unknown as Out;
    }

    // Return original response if chunks were only processed via handler
    return adapter.getResult(rawResult) as unknown as Out;
  }

  // No chunk processing, return result normally
  return adapter.getResult(rawResult) as unknown as Out;
}

/**
 * Executes a request with retry logic based on the provided retry configuration.
 * Supports chunk processing for streaming responses.
 *
 * @template Out - The output type
 * @template AdapterExecutionResult - The type of result returned by the adapter
 * @template RequestConfig - The type of request configuration
 * @param requestConfig - The request configuration
 * @param adapter - The request adapter instance
 * @param retryConfig - The retry configuration
 * @param chunkProcessing - Optional chunk processing configuration
 * @returns A promise that resolves to the request result
 * @throws {Error} If all retry attempts are exhausted
 */
export async function executeWithRetry<
  Out,
  AdapterExecutionResult,
  RequestConfig extends IRequestConfig = IRequestConfig,
>(
  requestConfig: RequestConfig,
  adapter: RequestAdapter<AdapterExecutionResult, RequestConfig>,
  retryConfig: RetryConfig,
  chunkProcessing?: ChunkProcessingConfig
): Promise<Out> {
  const maxRetries = retryConfig.maxRetries ?? 3;
  const retryCondition = retryConfig.retryCondition ?? defaultRetryCondition;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const rawResult: AdapterExecutionResult =
        await adapter.executeRequest(requestConfig);
      return processResultWithChunks<Out, AdapterExecutionResult>(
        rawResult,
        adapter,
        chunkProcessing
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const shouldRetry =
        attempt < maxRetries && retryCondition(lastError, attempt);

      if (!shouldRetry) {
        throw lastError;
      }

      // Calculate delay before retrying
      const delay = calculateRetryDelay(attempt + 1, lastError, retryConfig);

      // Wait before retrying
      if (delay > 0) {
        await sleep(delay);
      }
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error("Retry failed");
}

