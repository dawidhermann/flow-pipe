import type RequestAdapter from "./RequestAdapter";
import RequestFlow from "./RequestManager";
import type { IRequestConfig, PipelineRequestStage, PipelineManagerStage } from "./models/RequestParams";
export default class RequestChain<Out, AdapterExecutionResult = Out, AdapterRequestConfig extends IRequestConfig = IRequestConfig, Types extends readonly unknown[] = [Out]> extends RequestFlow<Out, AdapterExecutionResult, AdapterRequestConfig> {
    static begin: <Out_1, AdapterExecutionResult_1, AdapterRequestConfig_1 extends IRequestConfig = IRequestConfig>(stage: PipelineRequestStage<AdapterExecutionResult_1, Out_1, AdapterRequestConfig_1> | PipelineManagerStage<Out_1, AdapterExecutionResult_1, AdapterRequestConfig_1>, adapter: RequestAdapter<AdapterExecutionResult_1, AdapterRequestConfig_1>) => RequestChain<Out_1, AdapterExecutionResult_1, AdapterRequestConfig_1, [Out_1]>;
    next: <NewOut>(stage: PipelineRequestStage<AdapterExecutionResult, NewOut, AdapterRequestConfig> | PipelineManagerStage<NewOut, AdapterExecutionResult, AdapterRequestConfig>) => RequestChain<NewOut, AdapterExecutionResult, AdapterRequestConfig, [...Types, NewOut]>;
    execute: () => Promise<Out>;
    executeAll(): Promise<Types>;
    private addRequestEntity;
    private executeAllRequests;
    private executeSingle;
}
export declare function begin<Out, AdapterExecutionResult, AdapterRequestConfig extends IRequestConfig = IRequestConfig>(stage: PipelineRequestStage<AdapterExecutionResult, Out, AdapterRequestConfig> | PipelineManagerStage<Out, AdapterExecutionResult, AdapterRequestConfig>, adapter: RequestAdapter<AdapterExecutionResult, AdapterRequestConfig>): RequestChain<Out, AdapterExecutionResult, AdapterRequestConfig, [Out]>;
