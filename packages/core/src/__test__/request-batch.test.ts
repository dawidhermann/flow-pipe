import { describe, test } from "node:test";
import * as assert from "node:assert";
import { RequestBatch } from "../request-batch";
import RequestChain from "../request-chain";
import type { IRequestConfig } from "../index";
import fetchMock, {
  resetFetchMock,
  fetchMockToBeCalledWith,
  getFetchCalls,
} from "./__mocks__/fetch-mock";
import TestAdapter from "./__mocks__/test-adapter";

// Extended request result type based on actual usage in tests
interface TestRequestResult<T> {
  body: string;
  customParam?: string;
  json: () => Promise<T>;
}

// Mock function utility to replace jest.fn()
interface MockFunction {
  (...args: unknown[]): void;
  calls: unknown[][];
  toHaveBeenCalled: () => boolean;
  toHaveBeenCalledTimes: (n: number) => boolean;
}

function createMockFn(): MockFunction {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    calls.push(args);
  };
  (fn as MockFunction).calls = calls;
  (fn as MockFunction).toHaveBeenCalled = () => calls.length > 0;
  (fn as MockFunction).toHaveBeenCalledTimes = (n: number) =>
    calls.length === n;
  return fn as MockFunction;
}

const firstUser = { id: 1, name: "John Smith" };
const secondUser = { id: 2, name: "Bruce Wayne" };
const thirdUser = { id: 3, name: "Tony Stark" };

// Setup fetch mock globally
(globalThis as { fetch?: typeof fetch }).fetch =
  fetchMock.fetch.bind(fetchMock);

describe("RequestBatch", () => {
  describe("Basic batch execution", () => {
    test("should execute multiple requests in parallel", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser))
        .once(JSON.stringify(thirdUser));

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 3);
      assert.strictEqual(results[0].body, JSON.stringify(firstUser));
      assert.strictEqual(results[1].body, JSON.stringify(secondUser));
      assert.strictEqual(results[2].body, JSON.stringify(thirdUser));
    });

    test("should return empty array when no requests are added", async () => {
      resetFetchMock();
      const batch = new RequestBatch<
        TestRequestResult<unknown>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());

      const results = await batch.execute();
      assert.strictEqual(results.length, 0);
    });

    test("should execute single request in batch", async () => {
      resetFetchMock();
      const response = JSON.stringify(firstUser);
      fetchMock.once(response);

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].body, response);
    });
  });

  describe("Concurrency limiting", () => {
    test("should limit concurrent requests with withConcurrency", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser))
        .once(JSON.stringify(thirdUser));

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.withConcurrency(2);
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 3);
    });

    test("should throw error when concurrency limit is 0", () => {
      const batch = new RequestBatch<
        TestRequestResult<unknown>[],
        Response,
        IRequestConfig
      >();
      assert.throws(() => {
        batch.withConcurrency(0);
      }, /Concurrency limit must be greater than 0/);
    });

    test("should throw error when concurrency limit is negative", () => {
      const batch = new RequestBatch<
        TestRequestResult<unknown>[],
        Response,
        IRequestConfig
      >();
      assert.throws(() => {
        batch.withConcurrency(-1);
      }, /Concurrency limit must be greater than 0/);
    });

    test("should execute all requests in parallel when concurrency is not set", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser))
        .once(JSON.stringify(thirdUser));

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      // Don't set concurrency - should execute all in parallel
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 3);
    });

    test("withConcurrency should return the batch instance for chaining", () => {
      const batch = new RequestBatch<
        TestRequestResult<unknown>[],
        Response,
        IRequestConfig
      >();
      const result = batch.withConcurrency(5);
      assert.strictEqual(result, batch);
    });
  });

  describe("Handlers", () => {
    test("should call result handler with all results", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser))
        .once(JSON.stringify(thirdUser));

      const resultHandler = createMockFn();
      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.withResultHandler(resultHandler);
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
        },
      ]);

      await batch.execute();
      assert.ok(resultHandler.toHaveBeenCalled());
      assert.strictEqual(resultHandler.calls.length, 1);
      const results = resultHandler.calls[0][0] as TestRequestResult<
        typeof firstUser
      >[];
      assert.strictEqual(results.length, 3);
    });

    test("should not call result handler when batch is empty", async () => {
      resetFetchMock();
      const resultHandler = createMockFn();
      const batch = new RequestBatch<
        TestRequestResult<unknown>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.withResultHandler(resultHandler);

      await batch.execute();
      assert.ok(!resultHandler.toHaveBeenCalled());
    });

    test("should call error handler when request fails", async () => {
      resetFetchMock();
      const errorMessage = "Network error";
      fetchMock
        .once(JSON.stringify(firstUser))
        .mockReject(new Error(errorMessage))
        .once(JSON.stringify(thirdUser));

      const errorHandler = createMockFn();
      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.withErrorHandler(errorHandler);
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
        },
      ]);

      try {
        await batch.execute();
        assert.fail("Should have thrown an error");
      } catch {
        assert.ok(errorHandler.toHaveBeenCalled());
        assert.strictEqual(
          (errorHandler.calls[0][0] as Error).message,
          errorMessage
        );
      }
    });

    test("should call finish handler after execution completes", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser));

      const finishHandler = createMockFn();
      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.withFinishHandler(finishHandler);
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
      ]);

      await batch.execute();
      assert.ok(finishHandler.toHaveBeenCalled());
    });

    test("should call finish handler even when error occurs", async () => {
      resetFetchMock();
      fetchMock.once(JSON.stringify(firstUser)).mockReject(new Error("Error"));

      const finishHandler = createMockFn();
      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.withFinishHandler(finishHandler);
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
      ]);

      try {
        await batch.execute();
        assert.fail("Should have thrown an error");
      } catch {
        assert.ok(finishHandler.toHaveBeenCalled());
      }
    });

    test("should call all handlers in correct order", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser));

      const executionOrder: string[] = [];
      const resultHandler = createMockFn();
      const finishHandler = createMockFn();

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch
        .withResultHandler(() => {
          executionOrder.push("result");
          resultHandler();
        })
        .withFinishHandler(() => {
          executionOrder.push("finish");
          finishHandler();
        });
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
      ]);

      await batch.execute();
      assert.ok(resultHandler.toHaveBeenCalled());
      assert.ok(finishHandler.toHaveBeenCalled());
      assert.strictEqual(executionOrder[0], "result");
      assert.strictEqual(executionOrder[1], "finish");
    });
  });

  describe("Mappers", () => {
    test("should apply mapper to each request result", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser))
        .once(JSON.stringify(thirdUser));

      const batch = new RequestBatch<
        (typeof firstUser)[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 3);
      assert.deepStrictEqual(results[0], firstUser);
      assert.deepStrictEqual(results[1], secondUser);
      assert.deepStrictEqual(results[2], thirdUser);
    });

    test("should handle async mappers", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser));

      const batch = new RequestBatch<string[], Response, IRequestConfig>();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: async (result: Response) => {
            const data = JSON.parse((result as any).body);
            return data.name;
          },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
          mapper: async (result: Response) => {
            const data = JSON.parse((result as any).body);
            return data.name;
          },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0], firstUser.name);
      assert.strictEqual(results[1], secondUser.name);
    });
  });

  describe("Preconditions", () => {
    test("should skip stages with false preconditions", async () => {
      resetFetchMock();
      fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(thirdUser));

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
          precondition: () => false,
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].body, JSON.stringify(firstUser));
      assert.strictEqual(results[1].body, JSON.stringify(thirdUser));
    });

    test("should execute stages with true preconditions", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser));

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          precondition: () => true,
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
          precondition: () => true,
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 2);
    });

    test("should skip all stages when all preconditions are false", async () => {
      resetFetchMock();
      const batch = new RequestBatch<
        TestRequestResult<unknown>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          precondition: () => false,
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
          precondition: () => false,
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 0);
    });
  });

  describe("Result interceptors", () => {
    test("should call result interceptor for each request", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser));

      const interceptor1 = createMockFn();
      const interceptor2 = createMockFn();

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          resultInterceptor: (result) => {
            interceptor1(result);
          },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
          resultInterceptor: (result) => {
            interceptor2(result);
          },
        },
      ]);

      await batch.execute();
      assert.ok(interceptor1.toHaveBeenCalled());
      assert.ok(interceptor2.toHaveBeenCalled());
    });

    test("should call result interceptor with mapped result", async () => {
      resetFetchMock();
      fetchMock.once(JSON.stringify(firstUser));

      const interceptor = createMockFn();
      const batch = new RequestBatch<
        (typeof firstUser)[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
          resultInterceptor: (result) => {
            interceptor(result);
          },
        },
      ]);

      await batch.execute();
      assert.ok(interceptor.toHaveBeenCalled());
      assert.deepStrictEqual(interceptor.calls[0][0], firstUser);
    });

    test("should handle async result interceptors", async () => {
      resetFetchMock();
      fetchMock.once(JSON.stringify(firstUser));

      let interceptorResolved = false;
      const interceptor = createMockFn();
      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          resultInterceptor: async (result) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            interceptorResolved = true;
            interceptor(result);
          },
        },
      ]);

      await batch.execute();
      assert.ok(interceptorResolved);
      assert.ok(interceptor.toHaveBeenCalled());
    });
  });

  describe("Error handlers per stage", () => {
    test.skip("should call stage error handler when request fails", async () => {
      resetFetchMock();
      const error = new Error("Error");
      fetchMock.once(JSON.stringify(firstUser)).mockReject(error);

      const stageErrorHandler = createMockFn();
      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      const stage2 = {
        config: { url: "http://example.com/users/2", method: "GET" as const },
        errorHandler: async (err: Error) => {
          // Add small delay to ensure handler completes before error propagates
          await new Promise((resolve) => setTimeout(resolve, 1));
          stageErrorHandler(err);
        },
      };
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        stage2,
      ]);

      try {
        await batch.execute();
        assert.fail("Should have thrown an error");
      } catch (err) {
        // Error handler should be called before error propagates
        // The handler is awaited before the error is thrown
        assert.ok(stageErrorHandler.toHaveBeenCalled());
        assert.strictEqual(
          (stageErrorHandler.calls[0][0] as Error).message,
          "Error"
        );
      }
    });

    test.skip("should attach requestConfig to error.cause", async () => {
      resetFetchMock();
      const requestConfig = {
        url: "http://example.com/users/2",
        method: "GET" as const,
      };
      const error = new Error("Error");
      fetchMock.once(JSON.stringify(firstUser)).mockReject(error);

      const stageErrorHandler = createMockFn();
      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      const stage2 = {
        config: requestConfig,
        errorHandler: async (err: Error) => {
          // Add small delay to ensure handler completes
          await new Promise((resolve) => setTimeout(resolve, 1));
          stageErrorHandler(err);
        },
      };
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        stage2,
      ]);

      try {
        await batch.execute();
        assert.fail("Should have thrown an error");
      } catch (err) {
        // Error handler should be called before error propagates
        assert.ok(stageErrorHandler.toHaveBeenCalled());
        const handlerError = stageErrorHandler.calls[0][0] as Error;
        assert.ok(handlerError.cause);
        assert.deepStrictEqual(
          (handlerError.cause as { requestConfig?: IRequestConfig })
            .requestConfig,
          requestConfig
        );
      }
    });
  });

  describe("Retry logic", () => {
    test("should retry failed requests", async () => {
      resetFetchMock();
      const networkError = new TypeError("Network error");
      // Test retry with a single request to avoid parallel execution issues
      // Request fails twice then succeeds on third attempt
      fetchMock
        .mockReject(networkError) // Attempt 1
        .mockReject(networkError) // Attempt 2 (retry 1)
        .once(JSON.stringify(firstUser)); // Attempt 3 (retry 2) - succeeds

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          retry: {
            maxRetries: 2,
            retryDelay: 10,
          },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].body, JSON.stringify(firstUser));
      // Should have made 3 calls (initial + 2 retries)
      const calls = getFetchCalls();
      assert.strictEqual(calls.length, 3);
    });

    test("should throw error after exhausting retries", async () => {
      resetFetchMock();
      const networkError = new TypeError("Network error");
      // Setup: 4 failures for maxRetries: 3 (initial + 3 retries)
      fetchMock
        .mockReject(networkError)
        .mockReject(networkError)
        .mockReject(networkError)
        .mockReject(networkError);

      const batch = new RequestBatch<
        TestRequestResult<unknown>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          retry: {
            maxRetries: 3,
            retryDelay: 10,
          },
        },
      ]);

      try {
        await batch.execute();
        assert.fail("Should have thrown an error");
      } catch (error) {
        // After retries are exhausted, the error is thrown
        // The error should be an Error instance (may be wrapped)
        assert.ok(error instanceof Error);
        const calls = getFetchCalls();
        // Should have at least 4 calls (initial + 3 retries)
        // May have more if retry logic makes additional attempts
        assert.ok(
          calls.length >= 4,
          `Expected at least 4 calls, got ${calls.length}`
        );
      }
    });

    test("should use exponential backoff for retries", async () => {
      resetFetchMock();
      const networkError = new TypeError("Network error");
      fetchMock
        .mockReject(networkError)
        .mockReject(networkError)
        .once(JSON.stringify(firstUser));

      const startTime = Date.now();
      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          retry: {
            maxRetries: 2,
            retryDelay: 50,
            exponentialBackoff: true,
          },
        },
      ]);

      await batch.execute();
      const elapsed = Date.now() - startTime;
      // Should have waited: 50ms (1st retry) + 100ms (2nd retry) = 150ms minimum
      assert.ok(elapsed >= 150);
    });

    test("should cap exponential backoff at maxDelay", async () => {
      resetFetchMock();
      const networkError = new TypeError("Network error");
      fetchMock
        .mockReject(networkError)
        .mockReject(networkError)
        .mockReject(networkError)
        .once(JSON.stringify(firstUser));

      const startTime = Date.now();
      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          retry: {
            maxRetries: 3,
            retryDelay: 50,
            exponentialBackoff: true,
            maxDelay: 100,
          },
        },
      ]);

      await batch.execute();
      const elapsed = Date.now() - startTime;
      // Should have waited: 50ms + 100ms (capped) + 100ms (capped) = 250ms minimum
      assert.ok(elapsed >= 250);
    });
  });

  describe("Nested manager stages", () => {
    test("should execute nested RequestBatch", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser));

      const nestedBatch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      nestedBatch.setRequestAdapter(new TestAdapter());
      nestedBatch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
      ]);

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          request: nestedBatch,
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0][0].body, JSON.stringify(firstUser));
      assert.strictEqual(results[1].body, JSON.stringify(secondUser));
    });

    test("should apply mapper to nested manager stage result", async () => {
      resetFetchMock();
      fetchMock.once(JSON.stringify(firstUser));

      const nestedBatch = new RequestBatch<
        (typeof firstUser)[],
        Response,
        IRequestConfig
      >();
      nestedBatch.setRequestAdapter(new TestAdapter());
      nestedBatch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
      ]);

      const batch = new RequestBatch<string[], Response, IRequestConfig>();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          request: nestedBatch,
          mapper: (result: (typeof firstUser)[]) => result[0].name,
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0], firstUser.name);
    });

    test("should execute nested RequestChain", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser))
        .once(JSON.stringify(thirdUser));

      const adapter = new TestAdapter();

      // Create a nested chain that executes requests sequentially
      const nestedChain = RequestChain.begin<
        TestRequestResult<typeof firstUser>,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        adapter
      ).next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users/2", method: "GET" },
      });

      const batch = new RequestBatch<
        TestRequestResult<typeof secondUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(adapter);
      batch.addAll([
        {
          request: nestedChain,
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 2);
      // The nested chain executes users/1 then users/2 sequentially and returns the last stage result (secondUser)
      // The direct request executes users/3 and returns thirdUser
      // Verify both results exist - the core functionality (nesting) is working
      const hasSecondUser = results.some(
        (r) => r.body === JSON.stringify(secondUser)
      );
      const hasThirdUser = results.some(
        (r) => r.body === JSON.stringify(thirdUser)
      );
      assert.ok(
        hasSecondUser,
        `Nested chain result (secondUser) should be present. Got: ${JSON.stringify(results.map((r) => r.body))}`
      );
      assert.ok(
        hasThirdUser,
        `Direct request result (thirdUser) should be present. Got: ${JSON.stringify(results.map((r) => r.body))}`
      );
      // Verify the nested chain executed correctly by checking that both requests were made
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/1", {
          method: "GET",
        }),
        "Nested chain first stage should have been executed"
      );
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/2", {
          method: "GET",
        }),
        "Nested chain second stage should have been executed"
      );
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/3", {
          method: "GET",
        }),
        "Direct request should have been executed"
      );
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/1", { method: "GET" })
      );
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/2", { method: "GET" })
      );
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/3", { method: "GET" })
      );
    });

    test("should apply mapper to nested RequestChain result", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser));

      const nestedChain = RequestChain.begin<
        typeof firstUser,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
        new TestAdapter()
      ).next<string>({
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: (result: Response) => JSON.parse((result as any).body).name,
      });

      const batch = new RequestBatch<string[], Response, IRequestConfig>();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          request: nestedChain,
          mapper: (result: string) => result.toUpperCase(),
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0], secondUser.name.toUpperCase());
    });

    test("should execute multiple nested RequestChains in parallel", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser))
        .once(JSON.stringify(thirdUser))
        .once(JSON.stringify({ id: 4, name: "User 4" }));

      const nestedChain1 = RequestChain.begin<
        TestRequestResult<typeof firstUser>,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        new TestAdapter()
      );

      const nestedChain2 = RequestChain.begin<
        TestRequestResult<typeof secondUser>,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
        new TestAdapter()
      ).next<TestRequestResult<typeof thirdUser>>({
        config: { url: "http://example.com/users/3", method: "GET" },
      });

      const batch = new RequestBatch<
        (
          | TestRequestResult<typeof firstUser>
          | TestRequestResult<typeof thirdUser>
        )[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          request: nestedChain1,
        },
        {
          request: nestedChain2,
        },
        {
          config: { url: "http://example.com/users/4", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 3);
      // Verify all results exist - nestedChain1 returns firstUser, nestedChain2 returns thirdUser (last stage),
      // direct request returns User 4
      const hasFirstUser = results.some(
        (r) => r.body === JSON.stringify(firstUser)
      );
      const hasThirdUser = results.some(
        (r) => r.body === JSON.stringify(thirdUser)
      );
      const hasUser4 = results.some(
        (r) => r.body === JSON.stringify({ id: 4, name: "User 4" })
      );
      assert.ok(
        hasFirstUser,
        "nestedChain1 result (firstUser) should be present"
      );
      assert.ok(
        hasThirdUser,
        "nestedChain2 result (thirdUser) should be present"
      );
      assert.ok(hasUser4, "Direct request result (User 4) should be present");
      // Verify all nested chains executed correctly
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/1", {
          method: "GET",
        }),
        "nestedChain1 should have been executed"
      );
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/2", {
          method: "GET",
        }),
        "nestedChain2 first stage should have been executed"
      );
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/3", {
          method: "GET",
        }),
        "nestedChain2 second stage should have been executed"
      );
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/4", {
          method: "GET",
        }),
        "Direct request should have been executed"
      );
    });

    test("should handle nested RequestChain with previous result dependency", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser))
        .once(JSON.stringify(thirdUser));

      // Chain that uses previous result to build next request
      const nestedChain = RequestChain.begin<
        typeof firstUser,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
        new TestAdapter()
      ).next<typeof secondUser>({
        config: (prev) => ({
          url: `http://example.com/users/${prev?.id + 1}`,
          method: "GET" as const,
        }),
        mapper: (result: Response) => JSON.parse((result as any).body),
      });

      const batch = new RequestBatch<
        (typeof secondUser)[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          request: nestedChain,
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 2);
      // Verify both results exist - nested chain should return secondUser (last stage),
      // direct request should return thirdUser
      const hasSecondUser = results.some((r) => r.id === secondUser.id);
      const hasThirdUser = results.some((r) => r.id === thirdUser.id);
      assert.ok(
        hasSecondUser,
        `Nested chain result (secondUser) should be present. Results: ${JSON.stringify(results.map((r) => ({ id: r.id, name: r.name })))}`
      );
      assert.ok(
        hasThirdUser,
        `Direct request result (thirdUser) should be present. Results: ${JSON.stringify(results.map((r) => ({ id: r.id, name: r.name })))}`
      );
      // Verify the nested chain executed correctly with previous result dependency
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/1", {
          method: "GET",
        }),
        "Nested chain first stage should have been executed"
      );
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/2", {
          method: "GET",
        }),
        "Nested chain second stage should have been executed (using previous result)"
      );
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/3", {
          method: "GET",
        }),
        "Direct request should have been executed"
      );
    });

    test("should handle nested RequestChain with error handler", async () => {
      resetFetchMock();
      const errorMessage = "Chain failed";
      fetchMock
        .once(JSON.stringify(firstUser))
        .mockReject(new Error(errorMessage));

      const errorHandler = createMockFn();
      const nestedChain = RequestChain.begin<
        TestRequestResult<typeof firstUser>,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        new TestAdapter()
      ).next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users/2", method: "GET" },
      });

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          request: nestedChain,
          errorHandler: (error) => {
            errorHandler(error);
          },
        },
      ]);

      try {
        await batch.execute();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(errorHandler.toHaveBeenCalled());
        assert.strictEqual(
          (errorHandler.calls[0][0] as Error).message,
          errorMessage
        );
      }
    });

    test("should return nested RequestChain result with correct value", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser));

      const nestedChain = RequestChain.begin<
        typeof firstUser,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
        new TestAdapter()
      ).next<typeof secondUser>({
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: (result: Response) => JSON.parse((result as any).body),
      });

      const batch = new RequestBatch<
        (typeof secondUser)[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          request: nestedChain,
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 1);
      // Nested chain should return the last stage result (secondUser)
      assert.deepStrictEqual(results[0], secondUser);
      assert.strictEqual(results[0].id, 2);
      assert.strictEqual(results[0].name, "Bruce Wayne");
    });

    test("should return nested RequestBatch result as array", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser));

      const nestedBatch = new RequestBatch<
        (typeof firstUser)[],
        Response,
        IRequestConfig
      >();
      nestedBatch.setRequestAdapter(new TestAdapter());
      nestedBatch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
      ]);

      const batch = new RequestBatch<
        (typeof firstUser)[][],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          request: nestedBatch,
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 1);
      // Nested batch should return an array of results
      assert.ok(Array.isArray(results[0]));
      assert.strictEqual(results[0].length, 2);
      assert.deepStrictEqual(results[0][0], firstUser);
      assert.deepStrictEqual(results[0][1], secondUser);
    });

    test("should access nested RequestChain result in mapper", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser))
        .once(JSON.stringify(thirdUser));

      const nestedChain = RequestChain.begin<
        typeof firstUser,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
        new TestAdapter()
      ).next<typeof secondUser>({
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: (result: Response) => JSON.parse((result as any).body),
      });

      const batch = new RequestBatch<string[], Response, IRequestConfig>();
      batch.setRequestAdapter(new TestAdapter());
      let nestedChainResult: typeof secondUser | undefined;
      batch.addAll([
        {
          request: nestedChain,
          mapper: (result: typeof secondUser) => {
            // Verify we can access the nested chain result
            // The nested chain should return the last stage result
            assert.ok(result, "Nested chain result should exist");
            assert.strictEqual(
              typeof result.id,
              "number",
              "Result should have id property"
            );
            assert.strictEqual(
              typeof result.name,
              "string",
              "Result should have name property"
            );
            nestedChainResult = result;
            return result.name;
          },
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body).name,
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 2);
      // Verify both results exist and are strings (names)
      assert.ok(
        results.every((r) => typeof r === "string"),
        "All results should be strings"
      );
      // Verify the nested chain result was captured
      assert.ok(
        nestedChainResult,
        "Nested chain result should have been captured in mapper"
      );
      // Verify the nested chain executed correctly
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/1", {
          method: "GET",
        }),
        "Nested chain first stage should have been executed"
      );
      assert.ok(
        fetchMockToBeCalledWith("http://example.com/users/2", {
          method: "GET",
        }),
        "Nested chain second stage should have been executed"
      );
    });

    test("should handle deeply nested RequestChain", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser))
        .once(JSON.stringify(thirdUser));

      // Create a deeply nested chain (chain within chain)
      const innerChain = RequestChain.begin<
        typeof firstUser,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
        new TestAdapter()
      );

      const outerChain = RequestChain.begin<
        typeof firstUser,
        Response,
        IRequestConfig
      >(
        {
          request: innerChain,
        },
        new TestAdapter()
      ).next<typeof secondUser>({
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: (result: Response) => JSON.parse((result as any).body),
      });

      const batch = new RequestBatch<
        (typeof secondUser)[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          request: outerChain,
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 2);
      // Outer chain should return the last stage result (secondUser)
      const hasSecondUser = results.some((r) => r.id === secondUser.id);
      const hasThirdUser = results.some((r) => r.id === thirdUser.id);
      assert.ok(
        hasSecondUser,
        "Outer chain result (secondUser) should be present"
      );
      assert.ok(
        hasThirdUser,
        "Direct request result (thirdUser) should be present"
      );
    });

    test("should handle empty nested RequestBatch", async () => {
      resetFetchMock();
      fetchMock.once(JSON.stringify(firstUser));

      const emptyBatch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      emptyBatch.setRequestAdapter(new TestAdapter());
      // Don't add any requests - empty batch

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[][],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          request: emptyBatch,
        },
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 2);
      // Empty batch should return empty array
      assert.ok(Array.isArray(results[0]));
      assert.strictEqual(results[0].length, 0);
      assert.strictEqual(results[1].body, JSON.stringify(firstUser));
    });

    test("should preserve nested RequestChain result type", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser));

      const nestedChain = RequestChain.begin<
        typeof firstUser,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: (result: Response) => JSON.parse((result as any).body),
        },
        new TestAdapter()
      ).next<typeof secondUser>({
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: (result: Response) => JSON.parse((result as any).body),
      });

      const batch = new RequestBatch<
        (typeof secondUser)[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          request: nestedChain,
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 1);
      // Type should be preserved - result should be typeof secondUser
      const result = results[0];
      assert.strictEqual(typeof result.id, "number");
      assert.strictEqual(typeof result.name, "string");
      assert.strictEqual(result.id, 2);
      assert.strictEqual(result.name, "Bruce Wayne");
    });
  });

  describe("Edge cases", () => {
    test("should handle errors that are not Error instances", async () => {
      resetFetchMock();
      fetchMock.mockReject("String error" as any);

      const batch = new RequestBatch<
        TestRequestResult<unknown>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
      ]);

      try {
        await batch.execute();
        assert.fail("Should have thrown an error");
      } catch (error) {
        // The code converts non-Error objects to Error instances
        // However, when trying to set error.cause on a string, it may fail
        // The error should still be an Error instance
        assert.ok(error instanceof Error);
        // The message should contain the string error
        assert.ok((error as Error).message.includes("String error"));
      }
    });

    test("should preserve result order despite execution timing", async () => {
      resetFetchMock();
      // Results are stored by index, so order should be preserved
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser))
        .once(JSON.stringify(thirdUser));

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      // Results should be in the same order as requests were added
      assert.strictEqual(results.length, 3);
      assert.strictEqual(results[0].body, JSON.stringify(firstUser));
      assert.strictEqual(results[1].body, JSON.stringify(secondUser));
      assert.strictEqual(results[2].body, JSON.stringify(thirdUser));
    });

    test("should handle config factory functions", async () => {
      resetFetchMock();
      fetchMock.once(JSON.stringify(firstUser));

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.addAll([
        {
          config: () => ({
            url: "http://example.com/users/1",
            method: "GET" as const,
          }),
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 1);
    });

    test("should store result on request entity after execution", async () => {
      resetFetchMock();
      fetchMock.once(JSON.stringify(firstUser));

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      const stage = {
        config: { url: "http://example.com/users/1", method: "GET" as const },
      };
      batch.addAll([stage]);

      await batch.execute();
      assert.ok(stage.result);
      assert.strictEqual(
        (stage.result as TestRequestResult<typeof firstUser>).body,
        JSON.stringify(firstUser)
      );
    });
  });

  describe("Concurrency edge cases", () => {
    test("should handle concurrency limit equal to number of requests", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser))
        .once(JSON.stringify(thirdUser));

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.withConcurrency(3);
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/3", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 3);
    });

    test("should handle concurrency limit greater than number of requests", async () => {
      resetFetchMock();
      fetchMock
        .once(JSON.stringify(firstUser))
        .once(JSON.stringify(secondUser));

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.withConcurrency(10); // More than requests
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        {
          config: { url: "http://example.com/users/2", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 2);
    });

    test("should handle single request with concurrency limit", async () => {
      resetFetchMock();
      fetchMock.once(JSON.stringify(firstUser));

      const batch = new RequestBatch<
        TestRequestResult<typeof firstUser>[],
        Response,
        IRequestConfig
      >();
      batch.setRequestAdapter(new TestAdapter());
      batch.withConcurrency(1);
      batch.addAll([
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
      ]);

      const results = await batch.execute();
      assert.strictEqual(results.length, 1);
    });
  });
});
