import type RequestFlow from "../RequestManager";

type HttpMethods =
  | "GET"
  | "POST"
  | "PATCH"
  | "PUT"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "CONNECT"
  | "TRACE";

export interface IRequestConfig {
  url: string;
  method: HttpMethods;
  data?: any;
  [key: string]: any;
}

export type IRequestConfigFactory<
  Result,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig
> = (previousResult?: Result) => AdapterRequestConfig;

export interface BasePipelineStage<Result, Out = Result> {
  precondition?: () => boolean;
  result?: Out;
  mapper?: (result: Result) => Promise<Out>;
}

export interface PipelineRequestStage<
  Result,
  Out = Result,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig
> extends BasePipelineStage<Result, Out> {
  config: AdapterRequestConfig | IRequestConfigFactory<Result, AdapterRequestConfig>;
}

export interface PipelineManagerStage<
  Out,
  AdapterExecutionResult,
  AdapterRequestConfig extends IRequestConfig = IRequestConfig
> extends BasePipelineStage<Out> {
  request: RequestFlow<Out, AdapterExecutionResult, AdapterRequestConfig>;
}
