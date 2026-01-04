/**
 * Utility functions for retry logic and error handling.
 */

/**
 * Attempts to extract HTTP status code from an error object.
 * Works with different adapter error formats (Axios, Fetch, etc.).
 *
 * @param error - The error object
 * @returns The HTTP status code if available, undefined otherwise
 */
export function getErrorStatus(error: Error): number | undefined {
  // Helper to check if a number is a valid HTTP status code
  const isValidStatus = (value: number): boolean => {
    return !Number.isNaN(value) && Number.isFinite(value);
  };

  // Axios errors have response.status
  const anyError = error as any;
  if (anyError?.response?.status) {
    const status = anyError.response.status;
    if (isValidStatus(status)) {
      return status;
    }
  }

  // Some adapters might put status directly on error
  if (anyError?.status) {
    const status = anyError.status;
    if (isValidStatus(status)) {
      return status;
    }
  }

  // Check for statusCode (some libraries use this)
  if (anyError?.statusCode) {
    const status = anyError.statusCode;
    if (isValidStatus(status)) {
      return status;
    }
  }

  return undefined;
}

/**
 * Checks if an error is a network error (connection failure, timeout, etc.).
 *
 * @param error - The error object
 * @returns True if the error appears to be a network error
 */
export function isNetworkError(error: Error): boolean {
  // Common network error names
  const networkErrorNames = [
    "TypeError",
    "NetworkError",
    "TimeoutError",
    "AbortError",
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
  ];

  if (networkErrorNames.includes(error.name)) {
    return true;
  }

  // Check error message for network-related keywords
  const networkKeywords = [
    "network",
    "connection",
    "timeout",
    "fetch",
    "failed to fetch",
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
  ];

  const errorMessage = error.message?.toLowerCase() || "";
  return networkKeywords.some((keyword) => errorMessage.includes(keyword));
}

/**
 * Default retry condition that retries on network errors.
 * This is used when no retryCondition is provided in RetryConfig.
 *
 * @param error - The error that occurred
 * @returns True if the error is a network error
 */
export function defaultRetryCondition(error: Error): boolean {
  return isNetworkError(error);
}

/**
 * Helper function to create a retry condition that retries on specific HTTP status codes.
 *
 * @param statusCodes - Array of HTTP status codes to retry on
 * @returns A retry condition function
 *
 * @example
 * ```typescript
 * retry: {
 *   retryCondition: retryOnStatusCodes(500, 502, 503, 504, 429)
 * }
 * ```
 */
export function retryOnStatusCodes(
  ...statusCodes: number[]
): (error: Error) => boolean {
  return (error: Error) => {
    const status = getErrorStatus(error);
    return status !== undefined && statusCodes.includes(status);
  };
}

/**
 * Helper function to create a retry condition that retries on network errors OR specific status codes.
 *
 * @param statusCodes - Array of HTTP status codes to retry on
 * @returns A retry condition function
 *
 * @example
 * ```typescript
 * retry: {
 *   retryCondition: retryOnNetworkOrStatusCodes(500, 502, 503, 504, 429)
 * }
 * ```
 */
export function retryOnNetworkOrStatusCodes(
  ...statusCodes: number[]
): (error: Error, attempt: number) => boolean {
  return (error: Error) => {
    // Always retry network errors
    if (isNetworkError(error)) {
      return true;
    }
    // Retry on specified status codes
    const status = getErrorStatus(error);
    return status !== undefined && statusCodes.includes(status);
  };
}
