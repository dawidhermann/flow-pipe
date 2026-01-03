/**
 * @packageDocumentation
 * @module @flow-conductor/adapter-axios
 *
 * Flow-Conductor Axios Adapter Package
 *
 * Provides an Axios-based request adapter for flow-conductor.
 * Use this adapter when you want to leverage Axios features like interceptors,
 * automatic request/response transformation, and request cancellation.
 */

export {
  AxiosRequestAdapter,
  type AxiosRequestConfigType,
} from "./axios-request-adapter";
