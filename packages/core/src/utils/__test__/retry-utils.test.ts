import { describe, test } from "node:test";
import * as assert from "node:assert";
import {
  getErrorStatus,
  isNetworkError,
  defaultRetryCondition,
  retryOnStatusCodes,
  retryOnNetworkOrStatusCodes,
} from "../retry-utils";

describe("retryUtils", () => {
  describe("getErrorStatus", () => {
    test("should extract status from Axios error format", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: 500 };
      assert.strictEqual(getErrorStatus(error), 500);
    });

    test("should extract status from error.status property", () => {
      const error = new Error("Request failed") as any;
      error.status = 404;
      assert.strictEqual(getErrorStatus(error), 404);
    });

    test("should extract status from error.statusCode property", () => {
      const error = new Error("Request failed") as any;
      error.statusCode = 503;
      assert.strictEqual(getErrorStatus(error), 503);
    });

    test("should return undefined when status is not available", () => {
      const error = new Error("Request failed");
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should prioritize response.status over direct status", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: 500 };
      error.status = 404;
      assert.strictEqual(getErrorStatus(error), 500);
    });

    test("should prioritize response.status over statusCode", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: 429 };
      error.statusCode = 503;
      assert.strictEqual(getErrorStatus(error), 429);
    });

    test("should prioritize status over statusCode when response.status is not available", () => {
      const error = new Error("Request failed") as any;
      error.status = 400;
      error.statusCode = 500;
      assert.strictEqual(getErrorStatus(error), 400);
    });

    test("should handle status code 0", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: 0 };
      assert.strictEqual(getErrorStatus(error), 0);
    });

    test("should handle various HTTP status codes", () => {
      const statusCodes = [200, 201, 301, 400, 401, 403, 404, 429, 500, 502, 503, 504];
      for (const code of statusCodes) {
        const error = new Error("Request failed") as any;
        error.response = { status: code };
        assert.strictEqual(getErrorStatus(error), code, `Should handle status code ${code}`);
      }
    });

    test("should return undefined when response exists but status is missing", () => {
      const error = new Error("Request failed") as any;
      error.response = {};
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should return undefined when response exists but status is null", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: null };
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should return undefined when response exists but status is undefined", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: undefined };
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should ignore non-number status in response.status", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: "500" };
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should ignore non-number status in error.status", () => {
      const error = new Error("Request failed") as any;
      error.status = "404";
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should ignore non-number status in error.statusCode", () => {
      const error = new Error("Request failed") as any;
      error.statusCode = "503";
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should ignore null status in error.status", () => {
      const error = new Error("Request failed") as any;
      error.status = null;
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should ignore undefined status in error.status", () => {
      const error = new Error("Request failed") as any;
      error.status = undefined;
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should ignore null status in error.statusCode", () => {
      const error = new Error("Request failed") as any;
      error.statusCode = null;
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should ignore undefined status in error.statusCode", () => {
      const error = new Error("Request failed") as any;
      error.statusCode = undefined;
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should handle response.status as 0 when other status properties exist", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: 0 };
      error.status = 404;
      error.statusCode = 500;
      assert.strictEqual(getErrorStatus(error), 0);
    });

    test("should handle negative status codes", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: -1 };
      assert.strictEqual(getErrorStatus(error), -1);
    });

    test("should handle very large status codes", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: 999999 };
      assert.strictEqual(getErrorStatus(error), 999999);
    });

    test("should return undefined when response is null", () => {
      const error = new Error("Request failed") as any;
      error.response = null;
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should return undefined when response is undefined", () => {
      const error = new Error("Request failed") as any;
      error.response = undefined;
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should return undefined when response.status is NaN", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: NaN };
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should return undefined when response.status is Infinity", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: Infinity };
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should return undefined when response.status is -Infinity", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: -Infinity };
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should handle float status codes", () => {
      const error = new Error("Request failed") as any;
      error.response = { status: 500.5 };
      // typeof 500.5 === "number" is true, so it will return the float
      assert.strictEqual(getErrorStatus(error), 500.5);
    });

    test("should return undefined when error.status is NaN", () => {
      const error = new Error("Request failed") as any;
      error.status = NaN;
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should return undefined when error.statusCode is NaN", () => {
      const error = new Error("Request failed") as any;
      error.statusCode = NaN;
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should return undefined when response is a string", () => {
      const error = new Error("Request failed") as any;
      error.response = "invalid";
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should return undefined when response is a number", () => {
      const error = new Error("Request failed") as any;
      error.response = 123;
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should return undefined when response is an array", () => {
      const error = new Error("Request failed") as any;
      error.response = [];
      assert.strictEqual(getErrorStatus(error), undefined);
    });

    test("should handle status code 0 in error.status", () => {
      const error = new Error("Request failed") as any;
      error.status = 0;
      assert.strictEqual(getErrorStatus(error), 0);
    });

    test("should handle status code 0 in error.statusCode", () => {
      const error = new Error("Request failed") as any;
      error.statusCode = 0;
      assert.strictEqual(getErrorStatus(error), 0);
    });
  });

  describe("isNetworkError", () => {
    test("should identify TypeError as network error", () => {
      const error = new TypeError("Network request failed");
      assert.ok(isNetworkError(error));
    });

    test("should identify NetworkError as network error", () => {
      const error = new Error("Network error");
      error.name = "NetworkError";
      assert.ok(isNetworkError(error));
    });

    test("should identify TimeoutError as network error", () => {
      const error = new Error("Timeout");
      error.name = "TimeoutError";
      assert.ok(isNetworkError(error));
    });

    test("should identify AbortError as network error", () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      assert.ok(isNetworkError(error));
    });

    test("should identify ECONNREFUSED as network error", () => {
      const error = new Error("Connection refused");
      error.name = "ECONNREFUSED";
      assert.ok(isNetworkError(error));
    });

    test("should identify errors with network keywords in message", () => {
      const error = new Error("Failed to fetch");
      assert.ok(isNetworkError(error));
    });

    test("should identify errors with connection keywords in message", () => {
      const error = new Error("Connection timeout");
      assert.ok(isNetworkError(error));
    });

    test("should not identify regular errors as network errors", () => {
      const error = new Error("Something went wrong");
      assert.ok(!isNetworkError(error));
    });

    test("should not identify HTTP errors as network errors", () => {
      const error = new Error("Bad Request") as any;
      error.status = 400;
      assert.ok(!isNetworkError(error));
    });
  });

  describe("defaultRetryCondition", () => {
    test("should retry on network errors", () => {
      const error = new TypeError("Network request failed");
      assert.ok(defaultRetryCondition(error));
    });

    test("should not retry on non-network errors", () => {
      const error = new Error("Something went wrong");
      assert.ok(!defaultRetryCondition(error));
    });
  });

  describe("retryOnStatusCodes", () => {
    test("should retry on specified status codes", () => {
      const condition = retryOnStatusCodes(500, 502, 503, 504, 429);
      const error = new Error("Server error") as any;
      error.response = { status: 500 };
      assert.ok(condition(error));
    });

    test("should not retry on non-specified status codes", () => {
      const condition = retryOnStatusCodes(500, 502, 503);
      const error = new Error("Not found") as any;
      error.response = { status: 404 };
      assert.ok(!condition(error));
    });

    test("should not retry when status code is not available", () => {
      const condition = retryOnStatusCodes(500, 502, 503);
      const error = new Error("Network error");
      assert.ok(!condition(error));
    });

    test("should work with error.status property", () => {
      const condition = retryOnStatusCodes(429, 500);
      const error = new Error("Rate limited") as any;
      error.status = 429;
      assert.ok(condition(error));
    });

    test("should work with error.statusCode property", () => {
      const condition = retryOnStatusCodes(503);
      const error = new Error("Service unavailable") as any;
      error.statusCode = 503;
      assert.ok(condition(error));
    });
  });

  describe("retryOnNetworkOrStatusCodes", () => {
    test("should retry on network errors", () => {
      const condition = retryOnNetworkOrStatusCodes(500, 502);
      const error = new TypeError("Network request failed");
      assert.ok(condition(error, 1));
    });

    test("should retry on specified status codes", () => {
      const condition = retryOnNetworkOrStatusCodes(500, 502, 503);
      const error = new Error("Server error") as any;
      error.response = { status: 500 };
      assert.ok(condition(error, 1));
    });

    test("should not retry on non-specified status codes", () => {
      const condition = retryOnNetworkOrStatusCodes(500, 502);
      const error = new Error("Not found") as any;
      error.response = { status: 404 };
      assert.ok(!condition(error, 1));
    });

    test("should retry network errors even if status code doesn't match", () => {
      const condition = retryOnNetworkOrStatusCodes(500, 502);
      const error = new TypeError("Connection failed");
      assert.ok(condition(error, 1));
    });
  });
});
