/**
 * @packageDocumentation
 * @module @request-orchestrator/core
 *
 * Request-Orchestrator Core Package
 *
 * A flexible request pipeline library for building sequential HTTP request chains
 * with support for conditional execution, result mapping, and error handling.
 */

// Main exports
export { default as RequestAdapter } from "./request-adapter";
export { default as RequestManager } from "./request-manager";
export { default as RequestChain, begin } from "./request-chain";
export { default } from "./request-chain";

// Types
export type {
  IRequestConfig,
  IRequestConfigFactory,
  PipelineRequestStage,
  PipelineManagerStage,
  BasePipelineStage,
  RetryConfig,
  ChunkProcessingConfig,
} from "./models/request-params";

export type { ErrorHandler, ResultHandler, ChunkHandler } from "./models/handlers";

// Security utilities
export { validateUrl, SSRFError } from "./utils/url-validator";
export type { UrlValidationOptions } from "./utils/url-validator";

// Retry utilities
export {
  getErrorStatus,
  isNetworkError,
  defaultRetryCondition,
  retryOnStatusCodes,
  retryOnNetworkOrStatusCodes,
} from "./utils/retry-utils";

// Chunk processing utilities
export {
  processStream,
  processTextStreamLineByLine,
  processResponseStream,
  isReadableStream,
  hasReadableStream,
} from "./utils/chunk-processor";
