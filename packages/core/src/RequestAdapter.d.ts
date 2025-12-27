import type { IRequestConfig } from "./models/RequestParams";
export default abstract class RequestAdapter<ExecutionResult, RequestConfig extends IRequestConfig = IRequestConfig> {
    abstract createRequest(requestConfig: RequestConfig): Promise<ExecutionResult>;
    getResult<T extends ExecutionResult>(result: ExecutionResult): T;
    executeRequest(requestConfig: RequestConfig): Promise<ExecutionResult>;
}
