import type RequestAdapter from "./RequestAdapter";
import RequestFlow from "./RequestManager";
import type {
  IRequestConfig,
  PipelineRequestStage,
  PipelineManagerStage,
} from "./models/RequestParams";

export default class RequestChain<
  Out,
  AdapterExecutionResult = Out,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig
> extends RequestFlow<Out, AdapterExecutionResult, AdapterRequestConfig> {
  //  #region Public methods

  public static begin = <
    Out,
    AdapterExecutionResult,
    AdapterRequestConfig extends IRequestConfig = IRequestConfig
  >(
    stage:
      | PipelineRequestStage<AdapterExecutionResult, Out, AdapterRequestConfig>
      | PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig>,
    adapter: RequestAdapter<AdapterExecutionResult, AdapterRequestConfig>
  ): RequestChain<Out, AdapterExecutionResult, AdapterRequestConfig> => {
    const requestChain: RequestChain<
      Out,
      AdapterExecutionResult,
      AdapterRequestConfig
    > = new RequestChain<Out, AdapterExecutionResult, AdapterRequestConfig>();
    requestChain.setRequestAdapter(adapter);
    return requestChain.next(stage);
  };

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
  ): RequestChain<NewOut, AdapterExecutionResult, AdapterRequestConfig> => {
    return this.addRequestEntity(stage);
  };

  public execute = async (): Promise<Out> => {
    try {
      const results: Out[] = await this.executeAllRequests(this.requestList);
      const result: Out = results[results.length - 1];
      if (this.resultHandler && result) {
        this.resultHandler(result);
      }
      return result as Out;
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

  public async executeAll(): Promise<Out[]> {
    try {
      const results: Out[] = await this.executeAllRequests(this.requestList);
      if (this.resultHandler && results.length > 0) {
        this.resultHandler(results);
      }
      return results;
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler(error);
        return Promise.resolve(error);
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
  ): RequestChain<NewOut, AdapterExecutionResult, AdapterRequestConfig> => {
    this.requestList.push(stage);
    return this as unknown as RequestChain<
      NewOut,
      AdapterExecutionResult,
      AdapterRequestConfig
    >;
  };

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
      const previousEntity = requestEntityList[i - 1];
      const previousResult: Out | undefined = previousEntity?.result;
      const requestResult: Out = await this.executeSingle<Out>(
        requestEntity,
        previousResult
      );
      let result: Out = requestResult;
      if (requestEntity.mapper) {
        if (isPipelineRequestStage(requestEntity)) {
          result = await requestEntity.mapper(
            requestResult as unknown as AdapterExecutionResult
          );
        } else if (isPipelineManagerStage(requestEntity)) {
          result = await requestEntity.mapper(requestResult as unknown as Out);
        }
      }
      requestEntityList[i].result = result as Out;
      results.push(result);
    }
    return results;
  };

  private executeSingle = async <Out>(
    requestEntity:
      | PipelineRequestStage<AdapterExecutionResult, Out, AdapterRequestConfig>
      | PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig>,
    previousResult?: Out
  ): Promise<Out> => {
    if (isPipelineRequestStage(requestEntity)) {
      const { config } = requestEntity;
      const requestConfig: AdapterRequestConfig =
        typeof config === "function"
          ? (config(
              previousResult as AdapterExecutionResult
            ) as AdapterRequestConfig)
          : (config as AdapterRequestConfig);
      const rawResult: AdapterExecutionResult =
        await this.adapter.executeRequest(requestConfig);
      return this.adapter.getResult(rawResult);
    } else if (isPipelineManagerStage(requestEntity)) {
      const { request } = requestEntity;
      const rawResult: Out = await request.execute();
      return this.adapter.getResult(rawResult);
    } else {
      throw new Error("Unknown type");
    }
  };

  //  #endregion
}

export function begin<
  Out,
  AdapterExecutionResult,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig
>(
  stage:
    | PipelineRequestStage<AdapterExecutionResult, Out, AdapterRequestConfig>
    | PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig>,
  adapter: RequestAdapter<AdapterExecutionResult, AdapterRequestConfig>
): RequestChain<Out, AdapterExecutionResult, AdapterRequestConfig> {
  const requestChain: RequestChain<
    Out,
    AdapterExecutionResult,
    AdapterRequestConfig
  > = new RequestChain<Out, AdapterExecutionResult, AdapterRequestConfig>();
  requestChain.setRequestAdapter(adapter);
  return requestChain.next(stage);
}

function isPipelineRequestStage<
  Out,
  AdapterExecutionResult,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig
>(
  stage:
    | PipelineRequestStage<AdapterExecutionResult, Out, AdapterRequestConfig>
    | PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig>
): stage is PipelineRequestStage<
  AdapterExecutionResult,
  Out,
  AdapterRequestConfig
> {
  return "config" in stage;
}

function isPipelineManagerStage<
  Out,
  AdapterExecutionResult,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig
>(
  stage:
    | PipelineRequestStage<Out, AdapterRequestConfig>
    | PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig>
): stage is PipelineManagerStage<
  Out,
  AdapterExecutionResult,
  AdapterRequestConfig
> {
  return "request" in stage;
}
