/**
 * @packageDocumentation
 * @module @flow-conductor/adapter-fetch
 *
 * Flow-Conductor Fetch Adapter Package
 *
 * Provides a Fetch API-based request adapter for flow-conductor.
 * This adapter uses the native Fetch API, making it ideal for environments
 * where you want to avoid additional dependencies.
 */

export {
  FetchRequestAdapter,
  type FetchRequestConfig,
} from "./fetch-request-adapter";
