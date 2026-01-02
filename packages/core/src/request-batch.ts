import RequestFlow from "./request-manager";
import type {
  IRequestConfig,
  PipelineRequestStage,
  PipelineManagerStage,
  RetryConfig,
  ChunkProcessingConfig,
} from "./models/request-params";
import { defaultRetryCondition } from "./utils/retry-utils";
import {
  processResponseStream,
  hasReadableStream,
} from "./utils/chunk-processor";

/**
 * A batch request manager that executes multiple requests in parallel (or with a concurrency limit).
 * All requests are executed simultaneously (or in controlled batches), and results are returned as an array.
 *
 * @template Out - The output type (should be an array type, e.g., `User[]` for batches)
 * @template AdapterExecutionResult - The type of result returned by the adapter
 * @template RequestConfig - The type of request configuration
 *
 * @example
 * ```typescript
 * // Each request returns a User, so Out should be User[] for the batch
 * const batch = new RequestBatch<User[], Response, FetchRequestConfig>();
 * batch.setRequestAdapter(adapter);
 * batch.addAll([
 *   { config: { url: '/api/users/1', method: 'GET' } },
 *   { config: { url: '/api/users/2', method: 'GET' } },
 *   { config: { url: '/api/users/3', method: 'GET' } }
 * ]);
 *
 * // Execute all requests in parallel (default)
 * const results: User[] = await batch.execute();
 *
 * // Or limit concurrency to 5 requests at a time
 * batch.withConcurrency(5);
 * const results: User[] = await batch.execute();
 * ```
 */
export class RequestBatch<
  Out,
  AdapterExecutionResult = Out,
  RequestConfig extends IRequestConfig = IRequestConfig,
> extends RequestFlow<Out, AdapterExecutionResult, RequestConfig> {
  /**
   * Maximum number of concurrent requests to execute at the same time.
   * If undefined, all requests will execute in parallel (default behavior).
   */
  private concurrency?: number;

  /**
   * Sets the maximum number of concurrent requests to execute simultaneously.
   * If not set, all requests will execute in parallel.
   *
   * @param limit - Maximum number of concurrent requests (must be > 0)
   * @returns The current RequestBatch instance for method chaining
   * @throws {Error} If limit is less than or equal to 0
   *
   * @example
   * ```typescript
   * const batch = new RequestBatch<User[], Response, FetchRequestConfig>();
   * batch.setRequestAdapter(adapter);
   * batch.withConcurrency(5); // Execute max 5 requests at a time
   * batch.addAll([...requests]);
   * const results = await batch.execute();
   * ```
   */
  public withConcurrency(
    limit: number
  ): RequestBatch<Out, AdapterExecutionResult, RequestConfig> {
    if (limit <= 0) {
      throw new Error("Concurrency limit must be greater than 0");
    }
    this.concurrency = limit;
    return this;
  }

  /**
   * Executes all requests in the batch in parallel (or with concurrency limit if set) and returns all results.
   * Handles errors and calls registered handlers appropriately.
   *
   * Note: For batches, the generic type `Out` should be an array type (e.g., `RequestBatch<User[], ...>`)
   * to properly type the returned array of results.
   *
   * @returns A promise that resolves to an array of all results (typed as Out, which should be Out[])
   * @throws {Error} If an error occurs and no error handler is registered
   */
  public execute = async (): Promise<Out> => {
    try {
      const results: Out[] = await this.executeAllRequests(this.requestList);
      if (this.resultHandler && results.length > 0) {
        this.resultHandler(results);
      }
      // Cast to Out - for batches, Out should be typed as the array type (e.g., User[])
      return results as unknown as Out;
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler(error);
        return Promise.reject(error);
      } else {
        throw error;
      }
    } finally {
      if (this.finishHandler) {
        this.finishHandler();
      }
    }
  };

  /**
   * Executes all request entities in parallel (or with concurrency limit if set), handling preconditions and mappers.
   * Stages with failed preconditions are skipped.
   *
   * @template Out - The output type
   * @param requestEntityList - List of pipeline stages to execute
   * @returns A promise that resolves to an array of all stage results
   */
  private executeAllRequests = async <Out>(
    requestEntityList: (
      | PipelineRequestStage<AdapterExecutionResult, Out, RequestConfig>
      | PipelineManagerStage<Out, AdapterExecutionResult, RequestConfig>
    )[]
  ): Promise<Out[]> => {
    // Filter out stages that don't meet their preconditions
    const stagesToExecute = requestEntityList.filter(
      (stage) => !stage.precondition || stage.precondition()
    );

    // Create promise factories (not promises yet) to control when they start
    const promiseFactories = stagesToExecute.map(
      (requestEntity) => async () => {
        try {
          const result = await this.executeSingle<Out>(
            requestEntity,
            undefined
          );

          // Apply mapper if provided
          let mappedResult: Out = result;
          if (requestEntity.mapper) {
            let mapperResult: Out | Promise<Out>;
            if (isPipelineRequestStage(requestEntity)) {
              mapperResult = requestEntity.mapper(
                result as unknown as AdapterExecutionResult,
                undefined
              ) as Out | Promise<Out>;
            } else if (isPipelineManagerStage(requestEntity)) {
              mapperResult = requestEntity.mapper(
                result as unknown as Out,
                undefined
              ) as Out | Promise<Out>;
            } else {
              mapperResult = result;
            }

            mappedResult =
              mapperResult instanceof Promise
                ? await mapperResult
                : mapperResult;
          }

          // Apply result interceptor if provided
          if (requestEntity.resultInterceptor) {
            await requestEntity.resultInterceptor(mappedResult);
          }

          // Store result on the entity
          requestEntity.result = mappedResult as Out;
          return mappedResult;
        } catch (error) {
          const requestConfig = isPipelineRequestStage(requestEntity)
            ? requestEntity.config
            : undefined;
          error.cause = { ...error.cause, requestConfig };
          if (requestEntity.errorHandler) {
            await requestEntity.errorHandler(error);
          }
          throw error;
        }
      }
    );

    // Execute with concurrency limit if set, otherwise execute all in parallel
    if (this.concurrency !== undefined && this.concurrency > 0) {
      return this.executeWithConcurrencyLimit(
        promiseFactories,
        this.concurrency
      );
    } else {
      // Execute all promises in parallel
      const promises = promiseFactories.map((factory) => factory());
      return Promise.all(promises);
    }
  };

  /**
   * Executes promise factories with a concurrency limit.
   * Processes promises in batches, ensuring only a limited number run concurrently.
   *
   * @template Out - The output type
   * @param promiseFactories - Array of functions that return promises when called
   * @param limit - Maximum number of concurrent promises to execute
   * @returns A promise that resolves to an array of all results
   */
  private executeWithConcurrencyLimit = async <Out>(
    promiseFactories: Array<() => Promise<Out>>,
    limit: number
  ): Promise<Out[]> => {
    const results: Out[] = new Array(promiseFactories.length);
    let currentIndex = 0;
    let completedCount = 0;
    let activeCount = 0;

    return new Promise<Out[]>((resolve, reject) => {
      // Start the next promise if we haven't exceeded the limit
      const startNext = () => {
        // Don't start more if we've reached the limit or run out of promises
        if (activeCount >= limit || currentIndex >= promiseFactories.length) {
          return;
        }

        const index = currentIndex++;
        const factory = promiseFactories[index];
        activeCount++;

        // Execute the promise factory
        factory()
          .then((result) => {
            results[index] = result;
            completedCount++;
            activeCount--;

            // If all promises are completed, resolve
            if (completedCount === promiseFactories.length) {
              resolve(results);
            } else {
              // Otherwise, start the next promise
              startNext();
            }
          })
          .catch((error) => {
            activeCount--;
            reject(error);
          });
      };

      // Start initial batch up to the concurrency limit
      for (let i = 0; i < Math.min(limit, promiseFactories.length); i++) {
        startNext();
      }
    });
  };

  /**
   * Executes a single request entity (stage).
   * Handles both request stages and nested manager stages.
   * Implements retry logic for request stages when retry configuration is provided.
   * Supports progressive chunk processing for streaming responses.
   *
   * @template Out - The output type
   * @param requestEntity - The pipeline stage to execute
   * @param previousResult - The result from the previous stage (optional, not used in batch)
   * @returns A promise that resolves to the stage result
   * @throws {Error} If the stage type is unknown or all retries are exhausted
   */
  private executeSingle = async <Out>(
    requestEntity:
      | PipelineRequestStage<AdapterExecutionResult, Out, RequestConfig>
      | PipelineManagerStage<Out, AdapterExecutionResult, RequestConfig>,
    previousResult?: Out
  ): Promise<Out> => {
    if (isPipelineRequestStage(requestEntity)) {
      const { config, retry, chunkProcessing } = requestEntity;
      const requestConfig: RequestConfig =
        typeof config === "function"
          ? (config(previousResult as Out) as RequestConfig)
          : (config as RequestConfig);

      // If retry config is provided, wrap execution in retry logic
      if (retry) {
        return this.executeWithRetry<Out>(
          requestConfig,
          retry,
          chunkProcessing
        );
      }

      // Execute request and handle chunk processing if enabled
      const rawResult: AdapterExecutionResult =
        await this.adapter.executeRequest(requestConfig);
      return this.processResultWithChunks<Out>(rawResult, chunkProcessing);
    } else if (isPipelineManagerStage(requestEntity)) {
      const { request } = requestEntity;
      const rawResult: Out = await request.execute();
      return rawResult;
    } else {
      throw new Error("Unknown type");
    }
  };

  /**
   * Executes a request with retry logic based on the provided retry configuration.
   * Supports chunk processing for streaming responses.
   *
   * @template Out - The output type
   * @param requestConfig - The request configuration
   * @param retryConfig - The retry configuration
   * @param chunkProcessing - Optional chunk processing configuration
   * @returns A promise that resolves to the request result
   * @throws {Error} If all retry attempts are exhausted
   */
  private executeWithRetry = async <Out>(
    requestConfig: RequestConfig,
    retryConfig: RetryConfig,
    chunkProcessing?: ChunkProcessingConfig
  ): Promise<Out> => {
    const maxRetries = retryConfig.maxRetries ?? 3;
    const retryCondition = retryConfig.retryCondition ?? defaultRetryCondition;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const rawResult: AdapterExecutionResult =
          await this.adapter.executeRequest(requestConfig);
        return this.processResultWithChunks<Out>(rawResult, chunkProcessing);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        const shouldRetry =
          attempt < maxRetries && retryCondition(lastError, attempt);

        if (!shouldRetry) {
          throw lastError;
        }

        // Calculate delay before retrying
        const delay = this.calculateRetryDelay(
          attempt + 1,
          lastError,
          retryConfig
        );

        // Wait before retrying
        if (delay > 0) {
          await this.sleep(delay);
        }
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error("Retry failed");
  };

  /**
   * Processes a result with chunk processing if enabled.
   * Handles streaming responses by processing chunks progressively.
   *
   * @template Out - The output type
   * @param rawResult - The raw result from the adapter
   * @param chunkProcessing - Optional chunk processing configuration
   * @returns A promise that resolves to the processed result
   */
  private processResultWithChunks = async <Out>(
    rawResult: AdapterExecutionResult,
    chunkProcessing?: ChunkProcessingConfig
  ): Promise<Out> => {
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
      return this.adapter.getResult(rawResult) as unknown as Out;
    }

    // No chunk processing, return result normally
    return this.adapter.getResult(rawResult) as unknown as Out;
  };

  /**
   * Calculates the delay before the next retry attempt.
   *
   * @param attempt - The current attempt number (1-indexed for retries)
   * @param error - The error that occurred
   * @param retryConfig - The retry configuration
   * @returns The delay in milliseconds
   */
  private calculateRetryDelay(
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
   * Sleeps for the specified number of milliseconds.
   *
   * @param ms - Milliseconds to sleep
   * @returns A promise that resolves after the delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Type guard to check if a stage is a PipelineRequestStage.
 *
 * @template Out - The output type
 * @template AdapterExecutionResult - The adapter execution result type
 * @template RequestConfig - The request configuration type
 * @param stage - The stage to check
 * @returns True if the stage is a PipelineRequestStage
 */
function isPipelineRequestStage<
  Out,
  AdapterExecutionResult,
  RequestConfig extends IRequestConfig = IRequestConfig,
>(
  stage:
    | PipelineRequestStage<AdapterExecutionResult, Out, RequestConfig>
    | PipelineManagerStage<Out, AdapterExecutionResult, RequestConfig>
): stage is PipelineRequestStage<AdapterExecutionResult, Out, RequestConfig> {
  return "config" in stage && !("request" in stage);
}

/**
 * Type guard to check if a stage is a PipelineManagerStage.
 *
 * @template Out - The output type
 * @template AdapterExecutionResult - The adapter execution result type
 * @template RequestConfig - The request configuration type
 * @param stage - The stage to check
 * @returns True if the stage is a PipelineManagerStage
 */
function isPipelineManagerStage<
  Out,
  AdapterExecutionResult,
  RequestConfig extends IRequestConfig = IRequestConfig,
>(
  stage:
    | PipelineRequestStage<AdapterExecutionResult, Out, RequestConfig>
    | PipelineManagerStage<Out, AdapterExecutionResult, RequestConfig>
): stage is PipelineManagerStage<Out, AdapterExecutionResult, RequestConfig> {
  return "request" in stage && !("config" in stage);
}
