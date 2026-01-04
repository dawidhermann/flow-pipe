import RequestFlow from "./request-manager";
import type RequestAdapter from "./request-adapter";
import type {
  IRequestConfig,
  PipelineRequestStage,
  PipelineManagerStage,
} from "./models/request-params";
import {
  executeWithRetry,
  processResultWithChunks,
} from "./utils/retry-executor";
import {
  isPipelineRequestStage,
  isPipelineManagerStage,
} from "./utils/stage-type-guards";

/**
 * Type helper to extract the output type from a pipeline stage.
 */
type ExtractStageOutput<
  Stage extends
    | PipelineRequestStage<any, any, any>
    | PipelineManagerStage<any, any, any>,
> =
  Stage extends PipelineRequestStage<any, infer Out, any>
    ? Out
    : Stage extends PipelineManagerStage<infer Out, any, any>
      ? Out
      : never;

/**
 * Type helper to convert an array of stages into a tuple of their output types.
 * This enables heterogeneous batch requests where each request can return a different type.
 */
type StagesToTuple<
  Stages extends readonly (
    | PipelineRequestStage<any, any, any>
    | PipelineManagerStage<any, any, any>
  )[],
> = {
  readonly [K in keyof Stages]: ExtractStageOutput<Stages[K]>;
};

/**
 * A batch request manager that executes multiple requests in parallel (or with a concurrency limit).
 * All requests are executed simultaneously (or in controlled batches), and results are returned as an array or tuple.
 *
 * Supports both homogeneous batches (all requests return the same type) and heterogeneous batches
 * (each request can return a different type, using tuple types for type safety).
 *
 * @template Out - The output type:
 *   - For homogeneous batches: an array type (e.g., `User[]`)
 *   - For heterogeneous batches: a tuple type (e.g., `[User, Product, Order]`)
 * @template AdapterExecutionResult - The type of result returned by the adapter
 * @template RequestConfig - The type of request configuration
 *
 * @example
 * ```typescript
 * // Homogeneous batch - each request returns a User
 * const batch = new RequestBatch<User[], Response, FetchRequestConfig>();
 * batch.setRequestAdapter(adapter);
 * batch.addAll([
 *   { config: { url: '/api/users/1', method: 'GET' } },
 *   { config: { url: '/api/users/2', method: 'GET' } },
 *   { config: { url: '/api/users/3', method: 'GET' } }
 * ]);
 * const results: User[] = await batch.execute();
 *
 * // Heterogeneous batch - each request returns a different type
 * const heterogeneousBatch = RequestBatch.batch(
 *   [
 *     { config: { url: '/api/users/1', method: 'GET' }, mapper: (r) => r.json() as Promise<User> },
 *     { config: { url: '/api/products/1', method: 'GET' }, mapper: (r) => r.json() as Promise<Product> },
 *     { config: { url: '/api/orders/1', method: 'GET' }, mapper: (r) => r.json() as Promise<Order> }
 *   ],
 *   adapter
 * );
 * const results: [User, Product, Order] = await heterogeneousBatch.execute();
 * ```
 */
export class RequestBatch<
  Out,
  AdapterExecutionResult = Out,
  RequestConfig extends IRequestConfig = IRequestConfig,
> extends RequestFlow<Out, AdapterExecutionResult, RequestConfig> {
  /**
   * Creates a new RequestBatch with stages and adapter.
   * This is the entry point for building a request batch.
   *
   * Supports both homogeneous batches (all requests return the same type) and
   * heterogeneous batches (each request can return a different type, using tuple types).
   *
   * @template Out - The output type (should be an array type, e.g., `User[]` for homogeneous batches)
   * @template AdapterExecutionResult - The type of result returned by the adapter
   * @template RequestConfig - The type of request configuration
   * @param stages - Array of pipeline stages (request or manager stages)
   * @param adapter - The request adapter to use for HTTP requests
   * @returns A new RequestBatch instance with the stages and adapter configured
   *
   * @example
   * ```typescript
   * // Homogeneous batch - all requests return User
   * const batch = RequestBatch.batch(
   *   [
   *     { config: { url: '/api/users/1', method: 'GET' } },
   *     { config: { url: '/api/users/2', method: 'GET' } },
   *     { config: { url: '/api/users/3', method: 'GET' } }
   *   ],
   *   adapter
   * );
   * const results: User[] = await batch.execute();
   *
   * // Heterogeneous batch - each request returns a different type
   * const heterogeneousBatch = RequestBatch.batch(
   *   [
   *     { config: { url: '/api/users/1', method: 'GET' }, mapper: (r) => r.json() as Promise<User> },
   *     { config: { url: '/api/products/1', method: 'GET' }, mapper: (r) => r.json() as Promise<Product> },
   *     { config: { url: '/api/orders/1', method: 'GET' }, mapper: (r) => r.json() as Promise<Order> }
   *   ],
   *   adapter
   * );
   * const results: [User, Product, Order] = await heterogeneousBatch.execute();
   * ```
   */
  public static batch = <
    Stages extends readonly (
      | PipelineRequestStage<AdapterExecutionResult, any, RequestConfig>
      | PipelineManagerStage<any, AdapterExecutionResult, RequestConfig>
    )[],
    AdapterExecutionResult,
    RequestConfig extends IRequestConfig = IRequestConfig,
  >(
    stages: Stages,
    adapter: RequestAdapter<AdapterExecutionResult, RequestConfig>
  ): RequestBatch<
    StagesToTuple<Stages>,
    AdapterExecutionResult,
    RequestConfig
  > => {
    const batch = new RequestBatch<
      StagesToTuple<Stages>,
      AdapterExecutionResult,
      RequestConfig
    >();
    batch.setRequestAdapter(adapter);
    // Type assertion needed: stages have individual types, but we store them as any for internal processing
    // Convert readonly array to mutable array for addAll
    batch.addAll([...stages] as Array<
      | PipelineRequestStage<
          AdapterExecutionResult,
          StagesToTuple<Stages>[number],
          RequestConfig
        >
      | PipelineManagerStage<
          StagesToTuple<Stages>[number],
          AdapterExecutionResult,
          RequestConfig
        >
    >);
    return batch;
  };

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
   * For homogeneous batches, `Out` should be an array type (e.g., `User[]`).
   * For heterogeneous batches, `Out` should be a tuple type (e.g., `[User, Product, Order]`).
   *
   * @returns A promise that resolves to an array or tuple of all results (typed as Out)
   * @throws {Error} If an error occurs and no error handler is registered
   */
  public execute = async (): Promise<Out> => {
    try {
      // Execute all requests - results will be in order
      const results = await this.executeAllRequestsHeterogeneous(
        this.requestList
      );
      if (this.resultHandler && results.length > 0) {
        this.resultHandler(results as Out | Out[]);
      }
      // Cast to Out - preserves tuple types for heterogeneous batches
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
   * This method preserves individual types for each stage, enabling heterogeneous batches.
   *
   * @param requestEntityList - List of pipeline stages to execute
   * @returns A promise that resolves to an array of all stage results (preserves tuple types)
   */
  private executeAllRequestsHeterogeneous = async (
    requestEntityList: (
      | PipelineRequestStage<AdapterExecutionResult, any, RequestConfig>
      | PipelineManagerStage<any, AdapterExecutionResult, RequestConfig>
    )[]
  ): Promise<any[]> => {
    // Filter out stages that don't meet their preconditions
    const stagesToExecute = requestEntityList.filter(
      (stage) => !stage.precondition || stage.precondition() // If precondition is not provided, execute the stage
    );

    // Track original indices to preserve order (important for tuple types)
    const stageIndices = stagesToExecute.map((_, index) => {
      const originalIndex = requestEntityList.indexOf(stagesToExecute[index]);
      return originalIndex >= 0 ? originalIndex : index;
    });

    // Create promise factories (not promises yet) to control when they start
    const promiseFactories = stagesToExecute.map(
      (requestEntity, localIndex) => async () => {
        try {
          // Execute the stage - type is inferred from the stage itself
          const result = await this.executeSingleHeterogeneous(
            requestEntity,
            undefined
          );

          // Apply mapper if provided
          let mappedResult = result;
          if (requestEntity.mapper) {
            let mapperResult: any;
            if (isPipelineRequestStage(requestEntity)) {
              mapperResult = requestEntity.mapper(
                result as unknown as AdapterExecutionResult,
                undefined
              );
            } else if (isPipelineManagerStage(requestEntity)) {
              mapperResult = requestEntity.mapper(
                result as unknown as any,
                undefined
              );
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
          requestEntity.result = mappedResult;
          return { index: stageIndices[localIndex], result: mappedResult };
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
    let results: Array<{ index: number; result: any }>;
    if (this.concurrency !== undefined && this.concurrency > 0) {
      results = await this.executeWithConcurrencyLimitHeterogeneous(
        promiseFactories,
        this.concurrency
      );
    } else {
      // Execute all promises in parallel
      const promises = promiseFactories.map((factory) => factory());
      results = await Promise.all(promises);
    }

    // Sort results by original index to preserve order (critical for tuple types)
    results.sort((a, b) => a.index - b.index);

    // Return results in the correct order, preserving tuple structure
    return results.map((r) => r.result);
  };

  /**
   * Executes promise factories with a concurrency limit.
   * Processes promises in batches, ensuring only a limited number run concurrently.
   * This version preserves index information for tuple type support.
   *
   * @param promiseFactories - Array of functions that return promises when called
   * @param limit - Maximum number of concurrent promises to execute
   * @returns A promise that resolves to an array of results with index information
   */
  private executeWithConcurrencyLimitHeterogeneous = async (
    promiseFactories: Array<() => Promise<{ index: number; result: any }>>,
    limit: number
  ): Promise<Array<{ index: number; result: any }>> => {
    const results: Array<{ index: number; result: any }> = new Array(
      promiseFactories.length
    );
    let currentIndex = 0;
    let completedCount = 0;
    let activeCount = 0;

    return new Promise<Array<{ index: number; result: any }>>(
      (resolve, reject) => {
        // Start the next promise if we haven't exceeded the limit
        const startNext = () => {
          // Don't start more if we've reached the limit or run out of promises
          if (activeCount >= limit || currentIndex >= promiseFactories.length) {
            return;
          }

          const localIndex = currentIndex++;
          const factory = promiseFactories[localIndex];
          activeCount++;

          // Execute the promise factory
          factory()
            .then((result) => {
              results[localIndex] = result;
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
      }
    );
  };

  /**
   * Executes a single request entity (stage).
   * Handles both request stages and nested manager stages.
   * This version supports heterogeneous types by inferring the type from the stage.
   *
   * @param requestEntity - The pipeline stage to execute
   * @param previousResult - The result from the previous stage (optional, not used in batch)
   * @returns A promise that resolves to the stage result (type inferred from stage)
   * @throws {Error} If the stage type is unknown or all retries are exhausted
   */
  private executeSingleHeterogeneous = async (
    requestEntity:
      | PipelineRequestStage<AdapterExecutionResult, any, RequestConfig>
      | PipelineManagerStage<any, AdapterExecutionResult, RequestConfig>,
    previousResult?: any
  ): Promise<any> => {
    if (isPipelineRequestStage(requestEntity)) {
      const { config, retry, chunkProcessing } = requestEntity;
      const requestConfig: RequestConfig =
        typeof config === "function"
          ? (config(previousResult) as RequestConfig)
          : (config as RequestConfig);

      // If retry config is provided, wrap execution in retry logic
      if (retry) {
        return executeWithRetry<any, AdapterExecutionResult, RequestConfig>(
          requestConfig,
          this.adapter,
          retry,
          chunkProcessing
        );
      }

      // Execute request and handle chunk processing if enabled
      const rawResult: AdapterExecutionResult =
        await this.adapter.executeRequest(requestConfig);
      return processResultWithChunks<any, AdapterExecutionResult>(
        rawResult,
        this.adapter,
        chunkProcessing
      );
    } else if (isPipelineManagerStage(requestEntity)) {
      const { request } = requestEntity;
      const rawResult = await request.execute();
      return rawResult;
    } else {
      throw new Error("Unknown type");
    }
  };
}

/**
 * Creates a new RequestBatch with stages and adapter.
 * This is a convenience function that wraps RequestBatch.batch().
 *
 * Supports both homogeneous batches (all requests return the same type) and
 * heterogeneous batches (each request can return a different type, using tuple types).
 *
 * @template Stages - The tuple of stages (inferred from the stages parameter)
 * @template AdapterExecutionResult - The type of result returned by the adapter
 * @template RequestConfig - The type of request configuration
 * @param stages - Array or tuple of pipeline stages (request or manager stages)
 * @param adapter - The request adapter to use for HTTP requests
 * @returns A new RequestBatch instance with the stages and adapter configured
 *
 * @example
 * ```typescript
 * import { batch } from '@flow-conductor/core';
 * import { FetchRequestAdapter } from '@flow-conductor/adapter-fetch';
 *
 * const adapter = new FetchRequestAdapter();
 *
 * // Homogeneous batch - all requests return User
 * const batchInstance = batch(
 *   [
 *     { config: { url: '/api/users/1', method: 'GET' } },
 *     { config: { url: '/api/users/2', method: 'GET' } },
 *     { config: { url: '/api/users/3', method: 'GET' } }
 *   ],
 *   adapter
 * );
 * const results: User[] = await batchInstance.execute();
 *
 * // Heterogeneous batch - each request returns a different type
 * const heterogeneousBatch = batch(
 *   [
 *     { config: { url: '/api/users/1', method: 'GET' }, mapper: (r) => r.json() as Promise<User> },
 *     { config: { url: '/api/products/1', method: 'GET' }, mapper: (r) => r.json() as Promise<Product> },
 *     { config: { url: '/api/orders/1', method: 'GET' }, mapper: (r) => r.json() as Promise<Order> }
 *   ],
 *   adapter
 * );
 * const results: [User, Product, Order] = await heterogeneousBatch.execute();
 * ```
 */
export function batch<
  Stages extends readonly (
    | PipelineRequestStage<AdapterExecutionResult, any, RequestConfig>
    | PipelineManagerStage<any, AdapterExecutionResult, RequestConfig>
  )[],
  AdapterExecutionResult,
  RequestConfig extends IRequestConfig = IRequestConfig,
>(
  stages: Stages,
  adapter: RequestAdapter<AdapterExecutionResult, RequestConfig>
): RequestBatch<StagesToTuple<Stages>, AdapterExecutionResult, RequestConfig> {
  return RequestBatch.batch(stages, adapter);
}
