import type RequestAdapter from "./request-adapter";
import RequestFlow from "./request-manager";
import type {
  IRequestConfig,
  PipelineRequestStage,
  PipelineManagerStage,
  RetryConfig,
} from "./models/request-params";
import { defaultRetryCondition } from "./utils/retry-utils";
import {
  processResponseStream,
  hasReadableStream,
} from "./utils/chunk-processor";

/**
 * A chainable request pipeline that allows sequential execution of HTTP requests.
 * Each stage can depend on the result of the previous stage, and stages can be conditionally executed.
 *
 * @template Out - The output type of the current chain
 * @template AdapterExecutionResult - The type of result returned by the adapter
 * @template AdapterRequestConfig - The type of request configuration
 * @template Types - Tuple type tracking all output types in the chain
 *
 * @example
 * ```typescript
 * const chain = RequestChain.begin(
 *   { config: { url: 'https://api.example.com/users', method: 'GET' } },
 *   adapter
 * ).next({ config: { url: 'https://api.example.com/posts', method: 'GET' } });
 *
 * const result = await chain.execute();
 * ```
 */
export default class RequestChain<
  Out,
  AdapterExecutionResult = Out,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig,
  Types extends readonly unknown[] = [Out],
> extends RequestFlow<Out, AdapterExecutionResult, AdapterRequestConfig> {
  //  #region Public methods

  /**
   * Creates a new RequestChain with an initial stage.
   * This is the entry point for building a request chain.
   *
   * @template Out - The output type of the initial stage
   * @template AdapterExecutionResult - The type of result returned by the adapter
   * @template AdapterRequestConfig - The type of request configuration
   * @param stage - The initial pipeline stage (request or manager stage)
   * @param adapter - The request adapter to use for HTTP requests
   * @returns A new RequestChain instance with the initial stage
   */
  public static begin = <
    Out,
    AdapterExecutionResult,
    AdapterRequestConfig extends IRequestConfig = IRequestConfig,
  >(
    stage:
      | PipelineRequestStage<AdapterExecutionResult, Out, AdapterRequestConfig>
      | PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig>,
    adapter: RequestAdapter<AdapterExecutionResult, AdapterRequestConfig>
  ): RequestChain<Out, AdapterExecutionResult, AdapterRequestConfig, [Out]> => {
    const requestChain = new RequestChain<
      Out,
      AdapterExecutionResult,
      AdapterRequestConfig,
      []
    >();
    requestChain.setRequestAdapter(adapter);
    return requestChain.next(stage);
  };

  /**
   * Adds a new stage to the request chain and returns a new chain with updated types.
   * This method enables type-safe chaining of requests.
   *
   * @template NewOut - The output type of the new stage
   * @param stage - The pipeline stage to add (request or manager stage)
   * @returns A new RequestChain instance with the added stage
   */
  public next = <NewOut>(
    stage:
      | PipelineRequestStage<
          AdapterExecutionResult,
          NewOut,
          AdapterRequestConfig
        >
      | PipelineManagerStage<
          NewOut,
          AdapterExecutionResult,
          AdapterRequestConfig
        >
  ): RequestChain<
    NewOut,
    AdapterExecutionResult,
    AdapterRequestConfig,
    [...Types, NewOut]
  > => {
    return this.addRequestEntity(stage);
  };

  /**
   * Executes all stages in the chain sequentially and returns the final result.
   * Handles errors and calls registered handlers appropriately.
   *
   * @returns A promise that resolves to the final output result
   * @throws {Error} If an error occurs and no error handler is registered
   */
  public execute = async (): Promise<Out> => {
    try {
      const results: Out[] = await this.executeAllRequests(this.requestList);
      const result: Out = results[results.length - 1];
      if (this.resultHandler && result) {
        this.resultHandler(result);
      }
      return result;
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
   * Executes all stages in the chain and returns all results as a tuple.
   * Useful when you need access to intermediate results.
   *
   * @returns A promise that resolves to a tuple of all stage results
   * @throws {Error} If an error occurs and no error handler is registered
   */
  public async executeAll(): Promise<Types> {
    try {
      const results = await this.executeAllRequests(this.requestList);
      if (this.resultHandler && results.length > 0) {
        this.resultHandler(results);
      }
      return results as unknown as Types;
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
  }

  //  #endregion

  //  #region Private methods

  /**
   * Adds a request entity (stage) to the internal request list.
   *
   * @template NewOut - The output type of the new stage
   * @param stage - The pipeline stage to add
   * @returns A new RequestChain instance with updated types
   */
  private addRequestEntity = <NewOut>(
    stage:
      | PipelineRequestStage<
          AdapterExecutionResult,
          NewOut,
          AdapterRequestConfig
        >
      | PipelineManagerStage<
          NewOut,
          AdapterExecutionResult,
          AdapterRequestConfig
        >
  ): RequestChain<
    NewOut,
    AdapterExecutionResult,
    AdapterRequestConfig,
    [...Types, NewOut]
  > => {
    this.requestList.push(stage);
    return this as unknown as RequestChain<
      NewOut,
      AdapterExecutionResult,
      AdapterRequestConfig,
      [...Types, NewOut]
    >;
  };

  /**
   * Executes all request entities in sequence, handling preconditions and mappers.
   * Stages with failed preconditions are skipped but preserve the previous result.
   *
   * @template Out - The output type
   * @param requestEntityList - List of pipeline stages to execute
   * @returns A promise that resolves to an array of all stage results
   */
  private executeAllRequests = async <Out>(
    requestEntityList: (
      | PipelineRequestStage<AdapterExecutionResult, Out, AdapterRequestConfig>
      | PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig>
    )[]
  ): Promise<Out[]> => {
    const results: Out[] = [];
    for (let i = 0; i < requestEntityList.length; i++) {
      const requestEntity:
        | PipelineRequestStage<
            AdapterExecutionResult,
            Out,
            AdapterRequestConfig
          >
        | PipelineManagerStage<
            Out,
            AdapterExecutionResult,
            AdapterRequestConfig
          > = requestEntityList[i];

      // Check precondition - skip stage if precondition returns false
      if (requestEntity.precondition && !requestEntity.precondition()) {
        const previousEntity = requestEntityList[i - 1];
        const previousResult: Out | undefined = previousEntity?.result;
        // Use previous result or undefined if this is the first stage
        // Don't push to results - skipped stages don't produce new results
        requestEntityList[i].result = previousResult as Out | undefined;
        continue;
      }

      const previousEntity = requestEntityList[i - 1];
      const previousResult: Out | undefined = previousEntity?.result;
      try {
        const requestResult: Out = await this.executeSingle<Out>(
          requestEntity,
          previousResult
        );
        let result: Out = requestResult;
        if (requestEntity.mapper) {
          let mappedResult: Out | Promise<Out>;
          if (isPipelineRequestStage(requestEntity)) {
            mappedResult = requestEntity.mapper(
              requestResult as unknown as AdapterExecutionResult
            );
          } else if (isPipelineManagerStage(requestEntity)) {
            mappedResult = requestEntity.mapper(
              requestResult as unknown as Out
            );
          } else {
            mappedResult = result;
          }
          result =
            mappedResult instanceof Promise ? await mappedResult : mappedResult;
        }
        if (requestEntity.resultInterceptor) {
          await requestEntity.resultInterceptor(result);
        }
        requestEntityList[i].result = result as Out;
        results.push(result);
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
    return results;
  };

  /**
   * Executes a single request entity (stage).
   * Handles both request stages and nested manager stages.
   * Implements retry logic for request stages when retry configuration is provided.
   * Supports progressive chunk processing for streaming responses.
   *
   * @template Out - The output type
   * @param requestEntity - The pipeline stage to execute
   * @param previousResult - The result from the previous stage (optional)
   * @returns A promise that resolves to the stage result
   * @throws {Error} If the stage type is unknown or all retries are exhausted
   */
  private executeSingle = async <Out>(
    requestEntity:
      | PipelineRequestStage<AdapterExecutionResult, Out, AdapterRequestConfig>
      | PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig>,
    previousResult?: Out
  ): Promise<Out> => {
    if (isPipelineRequestStage(requestEntity)) {
      const { config, retry, chunkProcessing } = requestEntity;
      const requestConfig: AdapterRequestConfig =
        typeof config === "function"
          ? (config(
              previousResult as AdapterExecutionResult
            ) as AdapterRequestConfig)
          : (config as AdapterRequestConfig);

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
      // For nested managers, the result is already processed, so we return it directly
      // The adapter's getResult expects AdapterExecutionResult, but nested results are already Out
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
    requestConfig: AdapterRequestConfig,
    retryConfig: RetryConfig,
    chunkProcessing?: import("./models/request-params").ChunkProcessingConfig
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
    chunkProcessing?: import("./models/request-params").ChunkProcessingConfig
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

  //  #endregion
}

/**
 * Creates a new RequestChain with an initial stage.
 * This is a convenience function that wraps RequestChain.begin.
 *
 * @template Out - The output type of the initial stage
 * @template AdapterExecutionResult - The type of result returned by the adapter
 * @template AdapterRequestConfig - The type of request configuration
 * @param stage - The initial pipeline stage (request or manager stage)
 * @param adapter - The request adapter to use for HTTP requests
 * @returns A new RequestChain instance with the initial stage
 */
export function begin<
  Out,
  AdapterExecutionResult,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig,
>(
  stage:
    | PipelineRequestStage<AdapterExecutionResult, Out, AdapterRequestConfig>
    | PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig>,
  adapter: RequestAdapter<AdapterExecutionResult, AdapterRequestConfig>
): RequestChain<Out, AdapterExecutionResult, AdapterRequestConfig, [Out]> {
  const requestChain = new RequestChain<
    Out,
    AdapterExecutionResult,
    AdapterRequestConfig,
    []
  >();
  requestChain.setRequestAdapter(adapter);
  return requestChain.next(stage);
}

/**
 * Type guard to check if a stage is a PipelineRequestStage.
 *
 * @template Out - The output type
 * @template AdapterExecutionResult - The adapter execution result type
 * @template AdapterRequestConfig - The request configuration type
 * @param stage - The stage to check
 * @returns True if the stage is a PipelineRequestStage
 */
function isPipelineRequestStage<
  Out,
  AdapterExecutionResult,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig,
>(
  stage:
    | PipelineRequestStage<AdapterExecutionResult, Out, AdapterRequestConfig>
    | PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig>
): stage is PipelineRequestStage<
  AdapterExecutionResult,
  Out,
  AdapterRequestConfig
> {
  return "config" in stage && !("request" in stage);
}

/**
 * Type guard to check if a stage is a PipelineManagerStage.
 *
 * @template Out - The output type
 * @template AdapterExecutionResult - The adapter execution result type
 * @template AdapterRequestConfig - The request configuration type
 * @param stage - The stage to check
 * @returns True if the stage is a PipelineManagerStage
 */
function isPipelineManagerStage<
  Out,
  AdapterExecutionResult,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig,
>(
  stage:
    | PipelineRequestStage<AdapterExecutionResult, Out, AdapterRequestConfig>
    | PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig>
): stage is PipelineManagerStage<
  Out,
  AdapterExecutionResult,
  AdapterRequestConfig
> {
  return "request" in stage && !("config" in stage);
}
