import type RequestAdapter from "./RequestAdapter";
import type { PipelineManagerStage, PipelineRequestStage } from "./models/RequestParams";
import type { ErrorHandler, ResultHandler } from "./models/Handlers";
import type { IRequestConfig } from "./models/RequestParams";
export default abstract class RequestFlow<Out, AdapterExecutionResult = Out, RequestConfig extends IRequestConfig = IRequestConfig> {
    protected requestList: (PipelineRequestStage<any, any, any> | PipelineManagerStage<any, any, any>)[];
    protected errorHandler?: ErrorHandler;
    protected resultHandler?: ResultHandler<Out | Out[]>;
    protected finishHandler?: VoidFunction;
    protected adapter: RequestAdapter<AdapterExecutionResult, RequestConfig>;
    abstract execute(): Promise<Out>;
    setRequestAdapter(adapter: RequestAdapter<AdapterExecutionResult, RequestConfig>): RequestFlow<Out, AdapterExecutionResult, RequestConfig>;
    addAll(requestList?: Array<PipelineRequestStage<AdapterExecutionResult, Out, RequestConfig> | PipelineManagerStage<Out, AdapterExecutionResult, RequestConfig>>): RequestFlow<Out, AdapterExecutionResult, RequestConfig>;
    withErrorHandler(errorHandler: ErrorHandler): RequestFlow<Out, AdapterExecutionResult, RequestConfig>;
    withResultHandler(resultHandler: ResultHandler<Out | Out[]>): RequestFlow<Out, AdapterExecutionResult, RequestConfig>;
    withFinishHandler(finishHandler: VoidFunction): RequestFlow<Out, AdapterExecutionResult, RequestConfig>;
}
