import type RequestAdapter from "./request-adapter";
import RequestFlow from "./request-manager";
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
          AdapterRequestConfig,
          Out
        >
      | PipelineManagerStage<
          NewOut,
          AdapterExecutionResult,
          AdapterRequestConfig,
          Out
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
  private addRequestEntity = <NewOut, PrevOut = Out>(
    stage:
      | PipelineRequestStage<
          AdapterExecutionResult,
          NewOut,
          AdapterRequestConfig,
          PrevOut
        >
      | PipelineManagerStage<
          NewOut,
          AdapterExecutionResult,
          AdapterRequestConfig,
          PrevOut
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
              requestResult as unknown as AdapterExecutionResult,
              previousResult
            );
          } else if (isPipelineManagerStage(requestEntity)) {
            mappedResult = requestEntity.mapper(
              requestResult as unknown as Out,
              previousResult
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
          ? (config(previousResult as Out) as AdapterRequestConfig)
          : (config as AdapterRequestConfig);

      // If retry config is provided, wrap execution in retry logic
      if (retry) {
        return executeWithRetry<
          Out,
          AdapterExecutionResult,
          AdapterRequestConfig
        >(requestConfig, this.adapter, retry, chunkProcessing);
      }

      // Execute request and handle chunk processing if enabled
      const rawResult: AdapterExecutionResult =
        await this.adapter.executeRequest(requestConfig);
      return processResultWithChunks<Out, AdapterExecutionResult>(
        rawResult,
        this.adapter,
        chunkProcessing
      );
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
