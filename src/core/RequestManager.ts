import type RequestAdapter from "./RequestAdapter";
import type {
  PipelineManagerStage,
  PipelineRequestStage,
} from "./models/RequestParams";
import type { ErrorHandler, ResultHandler } from "./models/Handlers";
import type { IRequestConfig } from "./models/RequestParams";

export default abstract class RequestFlow<
  Out,
  AdapterExecutionResult = Out,
  RequestConfig extends IRequestConfig = IRequestConfig
> {
  protected requestList: (
    | PipelineRequestStage<any, any, any>
    | PipelineManagerStage<any, any, any>
  )[] = [];
  protected errorHandler?: ErrorHandler;
  protected resultHandler?: ResultHandler<Out | Out[]>;
  protected finishHandler?: VoidFunction;
  protected adapter: RequestAdapter<AdapterExecutionResult, RequestConfig>;

  public abstract execute(): Promise<Out>;

  public setRequestAdapter(
    adapter: RequestAdapter<AdapterExecutionResult, RequestConfig>
  ): RequestFlow<Out, AdapterExecutionResult, RequestConfig> {
    this.adapter = adapter;
    return this;
  }

  public addAll(
    requestList: Array<
      | PipelineRequestStage<AdapterExecutionResult, Out, RequestConfig>
      | PipelineManagerStage<Out, AdapterExecutionResult, RequestConfig>
    > = []
  ): RequestFlow<Out, AdapterExecutionResult, RequestConfig> {
    this.requestList = this.requestList.concat(requestList);
    return this;
  }

  public withErrorHandler(
    errorHandler: ErrorHandler
  ): RequestFlow<Out, AdapterExecutionResult, RequestConfig> {
    this.errorHandler = errorHandler;
    return this;
  }

  public withResultHandler(
    resultHandler: ResultHandler<Out | Out[]>
  ): RequestFlow<Out, AdapterExecutionResult, RequestConfig> {
    this.resultHandler = resultHandler;
    return this;
  }

  public withFinishHandler(
    finishHandler: VoidFunction
  ): RequestFlow<Out, AdapterExecutionResult, RequestConfig> {
    this.finishHandler = finishHandler;
    return this;
  }
}
