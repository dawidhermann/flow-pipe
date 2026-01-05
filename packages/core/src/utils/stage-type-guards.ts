import type {
  IRequestConfig,
  PipelineRequestStage,
  PipelineManagerStage,
} from "../models/request-params";

/**
 * Type guard to check if a stage is a PipelineRequestStage.
 * Supports both simple and extended signatures (with PrevOut parameter).
 *
 * @template Out - The output type
 * @template AdapterExecutionResult - The adapter execution result type
 * @template RequestConfig - The request configuration type
 * @template PrevOut - The previous output type (optional)
 * @param stage - The stage to check
 * @returns True if the stage is a PipelineRequestStage
 */
export function isPipelineRequestStage<
  Out,
  AdapterExecutionResult,
  RequestConfig extends IRequestConfig = IRequestConfig,
  PrevOut = Out,
>(
  stage:
    | PipelineRequestStage<
        AdapterExecutionResult,
        Out,
        RequestConfig,
        PrevOut
      >
    | PipelineManagerStage<
        Out,
        AdapterExecutionResult,
        RequestConfig,
        PrevOut
      >
): stage is PipelineRequestStage<
  AdapterExecutionResult,
  Out,
  RequestConfig,
  PrevOut
> {
  return "config" in stage && !("request" in stage);
}

/**
 * Type guard to check if a stage is a PipelineManagerStage.
 * Supports both simple and extended signatures (with PrevOut parameter).
 *
 * @template Out - The output type
 * @template AdapterExecutionResult - The adapter execution result type
 * @template RequestConfig - The request configuration type
 * @template PrevOut - The previous output type (optional)
 * @param stage - The stage to check
 * @returns True if the stage is a PipelineManagerStage
 */
export function isPipelineManagerStage<
  Out,
  AdapterExecutionResult,
  RequestConfig extends IRequestConfig = IRequestConfig,
  PrevOut = Out,
>(
  stage:
    | PipelineRequestStage<
        AdapterExecutionResult,
        Out,
        RequestConfig,
        PrevOut
      >
    | PipelineManagerStage<
        Out,
        AdapterExecutionResult,
        RequestConfig,
        PrevOut
      >
): stage is PipelineManagerStage<
  Out,
  AdapterExecutionResult,
  RequestConfig,
  PrevOut
> {
  return "request" in stage && !("config" in stage);
}

