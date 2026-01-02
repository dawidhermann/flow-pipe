import { describe, test } from "node:test";
import * as assert from "node:assert";
import RequestChain, { begin } from "../request-chain";
import { RequestBatch } from "../request-batch";
import type { ResultHandler, IRequestConfig } from "../index";
import type RequestAdapter from "../request-adapter";
import fetchMock, {
  resetFetchMock,
  fetchMockToBeCalledWith,
} from "./__mocks__/fetch-mock";
import TestAdapter from "./__mocks__/test-adapter";

const firstUser = { id: 1, name: "John Smith" };
const secondUser = { id: 2, name: "Bruce Wayne" };
const thirdUser = { id: 3, name: "Tony Stark" };

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

// Setup fetch mock globally
(globalThis as { fetch?: typeof fetch }).fetch =
  fetchMock.fetch.bind(fetchMock);

describe("Request chain test", () => {
  test("Basic GET request", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    ).execute();
    const jsonResult = await result.json();
    assert.deepStrictEqual(jsonResult, firstUser);
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("Multiple GET requests", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));
    const result: TestRequestResult<typeof thirdUser> =
      await RequestChain.begin<
        TestRequestResult<typeof thirdUser>,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users", method: "GET" },
        },
        new TestAdapter()
      )
        .next<TestRequestResult<typeof secondUser>>({
          config: { url: "http://example.com/users", method: "GET" },
        })
        .next<TestRequestResult<typeof thirdUser>>({
          config: { url: "http://example.com/users", method: "GET" },
        })
        .execute();
    assert.strictEqual(result.body, JSON.stringify(thirdUser));
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("GET requests with mapper", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));
    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .next<typeof firstUser>({
        config: { url: "http://example.com/users", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any),
      })
      .next<string>({
        config: { url: "http://example.com/users", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any).name,
      })
      .execute();
    assert.strictEqual(result, thirdUser.name);
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });
});

describe("Handlers test", () => {
  test("Finish handler test", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .withResultHandler((result: unknown): void => {
        assert.strictEqual(
          (result as TestRequestResult<typeof firstUser>).body,
          response
        );
        assert.ok(
          fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
        );
      })
      .execute();
  });

  test("Error handler test", async () => {
    resetFetchMock();
    const requestConfig = { url: "http://example.com/users", method: "GET" };
    fetchMock.mockReject(new Error("fake error message"));
    await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: requestConfig,
      },
      new TestAdapter()
    )
      .withErrorHandler((error: Error): void => {
        assert.strictEqual(error.message, "fake error message");
        // Verify requestConfig is in error.cause
        assert.ok(error.cause);
        assert.deepStrictEqual(error.cause.requestConfig, requestConfig);
      })
      .execute()
      .catch(() => {
        // Catch used only for tests
      });
  });

  test("Finish handler test", async () => {
    resetFetchMock();
    const requestConfig = { url: "http://example.com/users", method: "GET" };
    fetchMock.mockReject(new Error("fake error message"));
    const finishHandler = createMockFn();
    await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: requestConfig,
      },
      new TestAdapter()
    )
      .withErrorHandler((error: Error): void => {
        assert.strictEqual(error.message, "fake error message");
        // Verify requestConfig is in error.cause
        assert.ok(error.cause);
        assert.deepStrictEqual(error.cause.requestConfig, requestConfig);
      })
      .withFinishHandler(finishHandler)
      .execute()
      .catch(() => {
        // Catch used only for tests
      });
    assert.ok(finishHandler.toHaveBeenCalled());
  });

  test("Finish handler test with all handlers", async () => {
    resetFetchMock();
    const requestConfig = { url: "http://example.com/users", method: "GET" };
    fetchMock.mockReject(new Error("fake error message"));
    const resultHandler = createMockFn();
    const errorHandler = createMockFn();
    const finishHandler = createMockFn();
    await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: requestConfig,
      },
      new TestAdapter()
    )
      .withResultHandler(resultHandler)
      .withErrorHandler(errorHandler)
      .withFinishHandler(finishHandler)
      .execute()
      .catch(() => {
        // Catch used only for tests
      });
    assert.ok(!resultHandler.toHaveBeenCalled());
    assert.ok(errorHandler.toHaveBeenCalled());
    assert.ok(finishHandler.toHaveBeenCalled());
    // Verify requestConfig is in error.cause for global error handler
    assert.ok(errorHandler.calls[0][0].cause);
    assert.deepStrictEqual(
      errorHandler.calls[0][0].cause.requestConfig,
      requestConfig
    );
  });
});

describe("Returning all requests", () => {
  test("Execute all", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users", method: "GET" },
      })
      .next<string>({
        config: { url: "http://example.com/users", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any).name,
      })
      .executeAll();
    assert.strictEqual(JSON.parse(result[0].body).name, firstUser.name);
    assert.strictEqual(JSON.parse(result[1].body).name, secondUser.name);
    assert.strictEqual(result[2], thirdUser.name);
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("Execute all with result handler", async () => {
    resetFetchMock();
    const resultHandler: ResultHandler = (result: unknown): void => {
      const results = result as Array<
        TestRequestResult<typeof firstUser> | string
      >;
      assert.strictEqual(
        JSON.parse((results[0] as TestRequestResult<typeof firstUser>).body)
          .name,
        firstUser.name
      );
      assert.strictEqual(
        JSON.parse((results[1] as TestRequestResult<typeof secondUser>).body)
          .name,
        secondUser.name
      );
      assert.strictEqual(results[2] as string, thirdUser.name);
    };
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));
    const requestChain = RequestChain.begin<string, Response, IRequestConfig>(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof firstUser>>({
        config: { url: "http://example.com/users", method: "GET" },
      })
      .next<string>({
        config: { url: "http://example.com/users", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any).name,
      });
    requestChain.withResultHandler(resultHandler);
    await requestChain.executeAll();
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("Execute all with error handler", async () => {
    resetFetchMock();
    const resultHandler = createMockFn();
    const requestConfig = { url: "http://example.com/users", method: "GET" };
    fetchMock
      .once(JSON.stringify(firstUser))
      .mockReject(new Error("fake error message"))
      .once(JSON.stringify(thirdUser));
    const requestChain = RequestChain.begin<string, Response, IRequestConfig>(
      {
        config: requestConfig,
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof firstUser>>({
        config: requestConfig,
      })
      .next<string>({
        config: requestConfig,
        mapper: (result: Response) => JSON.parse(result.body as any).name,
      });
    requestChain
      .withResultHandler(resultHandler)
      .withErrorHandler((error: Error): void => {
        assert.strictEqual(error.message, "fake error message");
        // Verify requestConfig is in error.cause for global error handler
        assert.ok(error.cause);
        assert.deepStrictEqual(error.cause.requestConfig, requestConfig);
      });
    await requestChain.executeAll().catch(() => {
      // Catch used only for tests - error handler should be called
    });
    assert.ok(!resultHandler.toHaveBeenCalled());
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });
});

describe("Nested request manager test", () => {
  test("Basic GET request", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    const secondResponse: string = JSON.stringify(secondUser);
    fetchMock.mockResponseOnce(response).mockResponseOnce(secondResponse);
    const requestChain = RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    );
    const result = await RequestChain.begin<
      TestRequestResult<typeof secondUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof secondUser>>({ request: requestChain })
      .execute();
    assert.strictEqual(result.body, secondResponse);
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("RequestBatch nested in RequestChain", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));

    // Create a nested batch that fetches multiple users in parallel
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
      {
        config: { url: "http://example.com/users/2", method: "GET" },
      },
    ]);

    // Chain that uses the batch, then makes another request
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>[],
      Response,
      IRequestConfig
    >(
      {
        request: nestedBatch,
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof thirdUser>>({
        config: { url: "http://example.com/users/3", method: "GET" },
      })
      .execute();

    // Result should be from the third request (last stage)
    assert.strictEqual(result.body, JSON.stringify(thirdUser));
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

  test("RequestBatch nested in RequestChain with mapper", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(secondUser));

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

    const result = await RequestChain.begin<string, Response, IRequestConfig>(
      {
        request: nestedBatch,
        mapper: (batchResult: (typeof firstUser)[]) => {
          // Extract names from batch results
          return batchResult.map((user) => user.name).join(", ");
        },
      },
      new TestAdapter()
    ).execute();

    assert.strictEqual(result, "John Smith, Bruce Wayne");
  });

  test("RequestBatch nested in RequestChain with previous result", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));

    // First stage gets a user
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

    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/0", method: "GET" },
        mapper: (result: Response) => JSON.parse((result as any).body),
      },
      new TestAdapter()
    )
      .next<(typeof firstUser)[]>({
        request: nestedBatch,
      })
      .next<string>({
        config: { url: "http://example.com/users/3", method: "GET" },
        mapper: (result: Response, prev) => {
          // prev should be the batch result (array)
          assert.ok(Array.isArray(prev));
          return JSON.parse((result as any).body).name;
        },
      })
      .execute();

    assert.strictEqual(result, thirdUser.name);
  });

  test("RequestBatch nested in RequestChain with concurrency limit", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));

    const nestedBatch = new RequestBatch<
      TestRequestResult<typeof firstUser>[],
      Response,
      IRequestConfig
    >();
    nestedBatch.setRequestAdapter(new TestAdapter());
    nestedBatch.withConcurrency(1); // Sequential execution
    nestedBatch.addAll([
      {
        config: { url: "http://example.com/users/1", method: "GET" },
      },
      {
        config: { url: "http://example.com/users/2", method: "GET" },
      },
    ]);

    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>[],
      Response,
      IRequestConfig
    >(
      {
        request: nestedBatch,
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof thirdUser>>({
        config: { url: "http://example.com/users/3", method: "GET" },
      })
      .execute();

    assert.strictEqual(result.body, JSON.stringify(thirdUser));
  });

  test("should return nested RequestBatch result with correct array structure", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));

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

    const result = await RequestChain.begin<
      (typeof firstUser)[],
      Response,
      IRequestConfig
    >(
      {
        request: nestedBatch,
      },
      new TestAdapter()
    )
      .next<typeof thirdUser>({
        config: { url: "http://example.com/users/3", method: "GET" },
        mapper: (result: Response) => JSON.parse((result as any).body),
      })
      .execute();

    // Result should be from the last stage (thirdUser), not the nested batch
    assert.deepStrictEqual(result, thirdUser);
    assert.strictEqual(result.id, 3);
    assert.strictEqual(result.name, "Tony Stark");
  });

  test("should access nested RequestBatch result in mapper", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));

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

    const result = await RequestChain.begin<
      (typeof firstUser)[],
      Response,
      IRequestConfig
    >(
      {
        request: nestedBatch,
        mapper: (batchResult: (typeof firstUser)[]) => {
          // Verify we can access the nested batch result
          assert.ok(Array.isArray(batchResult));
          assert.strictEqual(batchResult.length, 2);
          assert.deepStrictEqual(batchResult[0], firstUser);
          assert.deepStrictEqual(batchResult[1], secondUser);
          // Return the count
          return batchResult.length;
        },
      },
      new TestAdapter()
    )
      .next<string>({
        config: { url: "http://example.com/users/3", method: "GET" },
        mapper: (result: Response, prev) => {
          // prev should be the count from previous stage
          assert.strictEqual(prev, 2);
          return JSON.parse((result as any).body).name;
        },
      })
      .execute();

    assert.strictEqual(result, "Tony Stark");
  });

  test("should handle nested RequestBatch with previous result dependency", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));

    // First stage gets a user
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

    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/0", method: "GET" },
        mapper: (result: Response) => JSON.parse((result as any).body),
      },
      new TestAdapter()
    )
      .next<(typeof firstUser)[]>({
        request: nestedBatch,
      })
      .next<string>({
        config: (prev) => {
          // prev should be the batch result (array)
          assert.ok(
            Array.isArray(prev),
            `Expected prev to be an array, got: ${typeof prev}`
          );
          assert.strictEqual(
            prev.length,
            1,
            `Expected array length 1, got: ${prev.length}`
          );
          // Verify the batch result is an array of user objects
          assert.ok(prev[0], "prev[0] should exist");
          assert.strictEqual(
            typeof prev[0].id,
            "number",
            "prev[0] should have id property"
          );
          assert.strictEqual(
            typeof prev[0].name,
            "string",
            "prev[0] should have name property"
          );
          return {
            url: "http://example.com/users/3",
            method: "GET" as const,
          };
        },
        mapper: (result: Response) => JSON.parse((result as any).body).name,
      })
      .execute();

    assert.strictEqual(result, "Tony Stark");
  });

  test("should handle deeply nested RequestBatch", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));

    // Create a deeply nested batch (batch within batch)
    const innerBatch = new RequestBatch<
      (typeof firstUser)[],
      Response,
      IRequestConfig
    >();
    innerBatch.setRequestAdapter(new TestAdapter());
    innerBatch.addAll([
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        mapper: (result: Response) => JSON.parse((result as any).body),
      },
    ]);

    const outerBatch = new RequestBatch<
      (typeof firstUser)[][],
      Response,
      IRequestConfig
    >();
    outerBatch.setRequestAdapter(new TestAdapter());
    outerBatch.addAll([
      {
        request: innerBatch,
      },
      {
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: (result: Response) => JSON.parse((result as any).body),
      },
    ]);

    const result = await RequestChain.begin<
      (typeof firstUser)[][],
      Response,
      IRequestConfig
    >(
      {
        request: outerBatch,
        mapper: (batchResult: (typeof firstUser)[][]) => {
          // Verify nested batch structure
          assert.ok(Array.isArray(batchResult));
          assert.strictEqual(batchResult.length, 2);
          assert.ok(Array.isArray(batchResult[0]));
          assert.strictEqual(batchResult[0].length, 1);
          assert.deepStrictEqual(batchResult[0][0], firstUser);
          assert.deepStrictEqual(batchResult[1], secondUser);
          return batchResult.length;
        },
      },
      new TestAdapter()
    )
      .next<string>({
        config: { url: "http://example.com/users/3", method: "GET" },
        mapper: (result: Response, prev) => {
          assert.strictEqual(prev, 2);
          return JSON.parse((result as any).body).name;
        },
      })
      .execute();

    assert.strictEqual(result, "Tony Stark");
  });

  test("should handle empty nested RequestBatch in chain", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser));

    const emptyBatch = new RequestBatch<
      TestRequestResult<typeof firstUser>[],
      Response,
      IRequestConfig
    >();
    emptyBatch.setRequestAdapter(new TestAdapter());
    // Don't add any requests - empty batch

    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>[],
      Response,
      IRequestConfig
    >(
      {
        request: emptyBatch,
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof firstUser>>({
        config: { url: "http://example.com/users/1", method: "GET" },
      })
      .execute();

    // Result should be from the last stage (firstUser), not the empty batch
    assert.strictEqual(result.body, JSON.stringify(firstUser));
  });

  test("should preserve nested RequestBatch result type", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(secondUser));

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

    const result = await RequestChain.begin<
      (typeof firstUser)[],
      Response,
      IRequestConfig
    >(
      {
        request: nestedBatch,
      },
      new TestAdapter()
    ).execute();

    // Type should be preserved - result should be typeof firstUser[]
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], firstUser);
    assert.deepStrictEqual(result[1], secondUser);
    assert.strictEqual(result[0].id, 1);
    assert.strictEqual(result[1].id, 2);
  });
});

describe("Custom adapter test", () => {
  test("Basic GET request with custom adapter", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    ).execute();
    assert.strictEqual(result.body, response);
    assert.strictEqual(result.customParam, "testParam");
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", {
        method: "GET",
        testParam: "test",
      } as RequestInit)
    );
  });
});

describe("Exported begin function test", () => {
  test("Basic GET request", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    const result = (await begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    ).execute()) as TestRequestResult<typeof firstUser>;
    assert.strictEqual(result.body, response);
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("Multiple GET requests", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));
    const result = (await begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof firstUser>>({
        config: { url: "http://example.com/users", method: "GET" },
      })
      .next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users", method: "GET" },
      })
      .execute()) as TestRequestResult<typeof thirdUser>;
    assert.strictEqual(result.body, JSON.stringify(thirdUser));
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("GET requests with mapper", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));
    const result = await begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof firstUser>>({
        config: { url: "http://example.com/users", method: "GET" },
      })
      .next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any).name,
      })
      .execute();
    assert.strictEqual(result, thirdUser.name);
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("Result handler test", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    await begin<TestRequestResult<typeof firstUser>, Response, IRequestConfig>(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .withResultHandler((result: unknown): void => {
        assert.strictEqual(
          (result as TestRequestResult<typeof firstUser>).body,
          response
        );
        assert.ok(
          fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
        );
      })
      .execute();
  });

  test("Error handler test", async () => {
    resetFetchMock();
    const requestConfig = { url: "http://example.com/users", method: "GET" };
    fetchMock.mockReject(new Error("fake error message"));
    await begin<TestRequestResult<typeof firstUser>, Response, IRequestConfig>(
      {
        config: requestConfig,
      },
      new TestAdapter()
    )
      .withErrorHandler((error: Error): void => {
        assert.strictEqual(error.message, "fake error message");
        // Verify requestConfig is in error.cause
        assert.ok(error.cause);
        assert.deepStrictEqual(error.cause.requestConfig, requestConfig);
      })
      .execute()
      .catch(() => {
        // Catch used only for tests
      });
  });

  test("Finish handler test", async () => {
    resetFetchMock();
    const requestConfig = { url: "http://example.com/users", method: "GET" };
    fetchMock.mockReject(new Error("fake error message"));
    const finishHandler = createMockFn();
    await begin<TestRequestResult<typeof firstUser>, Response, IRequestConfig>(
      {
        config: requestConfig,
      },
      new TestAdapter()
    )
      .withErrorHandler((error: Error): void => {
        assert.strictEqual(error.message, "fake error message");
        // Verify requestConfig is in error.cause
        assert.ok(error.cause);
        assert.deepStrictEqual(error.cause.requestConfig, requestConfig);
      })
      .withFinishHandler(finishHandler)
      .execute()
      .catch(() => {
        // Catch used only for tests
      });
    assert.ok(finishHandler.toHaveBeenCalled());
  });

  test("All handlers test", async () => {
    resetFetchMock();
    const requestConfig = { url: "http://example.com/users", method: "GET" };
    fetchMock.mockReject(new Error("fake error message"));
    const resultHandler = createMockFn();
    const errorHandler = createMockFn();
    const finishHandler = createMockFn();
    await begin<TestRequestResult<typeof firstUser>, Response, IRequestConfig>(
      {
        config: requestConfig,
      },
      new TestAdapter()
    )
      .withResultHandler(resultHandler)
      .withErrorHandler(errorHandler)
      .withFinishHandler(finishHandler)
      .execute()
      .catch(() => {
        // Catch used only for tests
      });
    assert.ok(!resultHandler.toHaveBeenCalled());
    assert.ok(errorHandler.toHaveBeenCalled());
    assert.ok(finishHandler.toHaveBeenCalled());
    // Verify requestConfig is in error.cause for global error handler
    assert.ok(errorHandler.calls[0][0].cause);
    assert.deepStrictEqual(
      errorHandler.calls[0][0].cause.requestConfig,
      requestConfig
    );
  });

  test("Execute all", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));
    const result = (await begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof firstUser>>({
        config: { url: "http://example.com/users", method: "GET" },
      })
      .next<string>({
        config: { url: "http://example.com/users", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any).name,
      })
      .executeAll()) as Array<TestRequestResult<typeof firstUser> | string>;
    assert.strictEqual(
      JSON.parse((result[0] as TestRequestResult<typeof firstUser>).body).name,
      firstUser.name
    );
    assert.strictEqual(
      JSON.parse((result[1] as TestRequestResult<typeof secondUser>).body).name,
      secondUser.name
    );
    assert.strictEqual(result[2] as string, thirdUser.name);
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("Execute all with result handler", async () => {
    resetFetchMock();
    const resultHandler: ResultHandler = (result: unknown): void => {
      const results = result as Array<
        TestRequestResult<typeof firstUser> | string
      >;
      assert.strictEqual(
        JSON.parse((results[0] as TestRequestResult<typeof firstUser>).body)
          .name,
        firstUser.name
      );
      assert.strictEqual(
        JSON.parse((results[1] as TestRequestResult<typeof secondUser>).body)
          .name,
        secondUser.name
      );
      assert.strictEqual(results[2] as string, thirdUser.name);
    };
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));
    const requestChain = begin<string, Response, IRequestConfig>(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof firstUser>>({
        config: { url: "http://example.com/users", method: "GET" },
      })
      .next<string>({
        config: { url: "http://example.com/users", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any).name,
      });
    requestChain.withResultHandler(resultHandler);
    await requestChain.executeAll();
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("Execute all with error handler", async () => {
    resetFetchMock();
    const resultHandler = createMockFn();
    const requestConfig = { url: "http://example.com/users", method: "GET" };
    fetchMock
      .once(JSON.stringify(firstUser))
      .mockReject(new Error("fake error message"))
      .once(JSON.stringify(thirdUser));
    const requestChain = begin<string, Response, IRequestConfig>(
      {
        config: requestConfig,
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof firstUser>>({
        config: requestConfig,
      })
      .next<string>({
        config: requestConfig,
        mapper: (result: Response) => JSON.parse(result.body as any).name,
      });
    requestChain
      .withResultHandler(resultHandler)
      .withErrorHandler((error: Error): void => {
        assert.strictEqual(error.message, "fake error message");
        // Verify requestConfig is in error.cause for global error handler
        assert.ok(error.cause);
        assert.deepStrictEqual(error.cause.requestConfig, requestConfig);
      });
    await requestChain.executeAll().catch(() => {
      // Catch used only for tests - error handler should be called
    });
    assert.ok(!resultHandler.toHaveBeenCalled());
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("Nested request manager", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    const secondResponse: string = JSON.stringify(secondUser);
    fetchMock.mockResponseOnce(response).mockResponseOnce(secondResponse);
    const requestChain = begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    );
    const result = await begin<
      TestRequestResult<typeof secondUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof secondUser>>({ request: requestChain })
      .execute();
    assert.strictEqual(result.body, secondResponse);
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("Basic GET request with custom adapter", async () => {
    resetFetchMock();
    const adapter: RequestAdapter<Response, IRequestConfig> = new TestAdapter();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    const result = await begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .setRequestAdapter(adapter)
      .execute();
    assert.strictEqual(result.body, response);
    assert.strictEqual(result.customParam, "testParam");
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", {
        method: "GET",
        testParam: "test",
      } as RequestInit)
    );
  });
});

describe("Precondition test", () => {
  test("Stage with precondition returning true should execute", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    let executed = false;
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
        precondition: () => {
          executed = true;
          return true;
        },
      },
      new TestAdapter()
    ).execute();
    assert.ok(executed);
    assert.strictEqual(result.body, response);
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("Stage with precondition returning false should be skipped", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    let preconditionCalled = false;
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
        precondition: () => {
          preconditionCalled = true;
          return false;
        },
      },
      new TestAdapter()
    ).execute();
    assert.ok(preconditionCalled);
    // When first stage is skipped, result should be undefined
    assert.strictEqual(result, undefined);
    // Fetch should not be called when precondition is false
    assert.ok(
      !fetchMockToBeCalledWith("http://example.com/users", { method: "GET" })
    );
  });

  test("Middle stage with precondition returning false should be skipped", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(thirdUser));
    let secondStageExecuted = false;
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users/2", method: "GET" },
        precondition: () => {
          secondStageExecuted = true;
          return false;
        },
      })
      .next<TestRequestResult<typeof thirdUser>>({
        config: { url: "http://example.com/users/3", method: "GET" },
      })
      .execute();
    assert.ok(secondStageExecuted);
    // Result should be from third stage (second was skipped)
    assert.strictEqual(result.body, JSON.stringify(thirdUser));
    // Only first and third requests should be made
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users/1", { method: "GET" })
    );
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users/3", { method: "GET" })
    );
    // Second request should not be made
    assert.ok(
      !fetchMockToBeCalledWith("http://example.com/users/2", { method: "GET" })
    );
  });

  test("Multiple stages with preconditions", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(thirdUser));
    const preconditionCalls: string[] = [];
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        precondition: () => {
          preconditionCalls.push("stage1");
          return true;
        },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users/2", method: "GET" },
        precondition: () => {
          preconditionCalls.push("stage2");
          return false; // Skip this stage
        },
      })
      .next<TestRequestResult<typeof thirdUser>>({
        config: { url: "http://example.com/users/3", method: "GET" },
        precondition: () => {
          preconditionCalls.push("stage3");
          return true;
        },
      })
      .execute();
    assert.deepStrictEqual(preconditionCalls, ["stage1", "stage2", "stage3"]);
    assert.strictEqual(result.body, JSON.stringify(thirdUser));
    // Only stages 1 and 3 should execute
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users/1", { method: "GET" })
    );
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users/3", { method: "GET" })
    );
    assert.ok(
      !fetchMockToBeCalledWith("http://example.com/users/2", { method: "GET" })
    );
  });

  test("Precondition with mapper - skipped stage should use previous result", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(thirdUser));
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
      },
      new TestAdapter()
    )
      .next<string>({
        config: { url: "http://example.com/users/2", method: "GET" },
        precondition: () => false, // Skip this stage
        mapper: (result: Response) => JSON.parse(result.body as any).name,
      })
      .next<TestRequestResult<typeof thirdUser>>({
        config: { url: "http://example.com/users/3", method: "GET" },
      })
      .execute();
    // Result should be from third stage
    assert.strictEqual(result.body, JSON.stringify(thirdUser));
    // Only first and third requests should be made
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users/1", { method: "GET" })
    );
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users/3", { method: "GET" })
    );
  });

  test("Precondition accessing previous result through closure", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(thirdUser));
    const shouldExecuteSecond = false;
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users/2", method: "GET" },
        precondition: () => {
          // Precondition can access external state
          return shouldExecuteSecond;
        },
      })
      .next<TestRequestResult<typeof thirdUser>>({
        config: { url: "http://example.com/users/3", method: "GET" },
      })
      .execute();
    // Second stage should be skipped because shouldExecuteSecond is false
    assert.strictEqual(result.body, JSON.stringify(thirdUser));
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users/1", { method: "GET" })
    );
    assert.ok(
      fetchMockToBeCalledWith("http://example.com/users/3", { method: "GET" })
    );
    assert.ok(
      !fetchMockToBeCalledWith("http://example.com/users/2", { method: "GET" })
    );
  });

  test("ExecuteAll with precondition - skipped stages should not appear in results", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(thirdUser));
    const results = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users/2", method: "GET" },
        precondition: () => false, // Skip this stage
      })
      .next<TestRequestResult<typeof thirdUser>>({
        config: { url: "http://example.com/users/3", method: "GET" },
      })
      .executeAll();
    // Should only have results from stages 1 and 3
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].body, JSON.stringify(firstUser));
    assert.strictEqual(results[1].body, JSON.stringify(thirdUser));
  });
});

describe("Result interceptor test", () => {
  test("Basic result interceptor execution", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    const interceptor = createMockFn();
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
        resultInterceptor: (result) => {
          interceptor(result);
        },
      },
      new TestAdapter()
    ).execute();
    assert.ok(interceptor.toHaveBeenCalled());
    assert.strictEqual(interceptor.calls.length, 1);
    assert.strictEqual(interceptor.calls[0][0], result);
    assert.strictEqual(result.body, response);
  });

  test("Result interceptor with mapper - receives mapped result", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    const interceptor = createMockFn();
    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any),
        resultInterceptor: (result) => {
          interceptor(result);
        },
      },
      new TestAdapter()
    ).execute();
    assert.ok(interceptor.toHaveBeenCalled());
    assert.strictEqual(interceptor.calls.length, 1);
    // Interceptor should receive the mapped result, not the raw response
    assert.deepStrictEqual(interceptor.calls[0][0], firstUser);
    assert.deepStrictEqual(result, firstUser);
  });

  test("Result interceptor in multiple stages", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));
    const interceptor1 = createMockFn();
    const interceptor2 = createMockFn();
    const interceptor3 = createMockFn();
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        resultInterceptor: (result) => {
          interceptor1(result);
        },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users/2", method: "GET" },
        resultInterceptor: (result) => {
          interceptor2(result);
        },
      })
      .next<TestRequestResult<typeof thirdUser>>({
        config: { url: "http://example.com/users/3", method: "GET" },
        resultInterceptor: (result) => {
          interceptor3(result);
        },
      })
      .execute();
    assert.ok(interceptor1.toHaveBeenCalled());
    assert.ok(interceptor2.toHaveBeenCalled());
    assert.ok(interceptor3.toHaveBeenCalled());
    assert.strictEqual(interceptor1.calls.length, 1);
    assert.strictEqual(interceptor2.calls.length, 1);
    assert.strictEqual(interceptor3.calls.length, 1);
    assert.strictEqual(result.body, JSON.stringify(thirdUser));
  });

  test("Async result interceptor execution", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    let interceptorResolved = false;
    const interceptor = createMockFn();
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
        resultInterceptor: async (result) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          interceptorResolved = true;
          interceptor(result);
        },
      },
      new TestAdapter()
    ).execute();
    assert.ok(interceptorResolved);
    assert.ok(interceptor.toHaveBeenCalled());
    assert.strictEqual(result.body, response);
  });

  test("Result interceptor execution order - after mapper", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    const executionOrder: string[] = [];
    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
        mapper: (result: Response) => {
          executionOrder.push("mapper");
          return JSON.parse(result.body as any);
        },
        resultInterceptor: (result) => {
          executionOrder.push("interceptor");
          assert.deepStrictEqual(result, firstUser);
        },
      },
      new TestAdapter()
    ).execute();
    assert.deepStrictEqual(executionOrder, ["mapper", "interceptor"]);
    assert.deepStrictEqual(result, firstUser);
  });

  test("Result interceptor in executeAll()", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));
    const interceptor1 = createMockFn();
    const interceptor2 = createMockFn();
    const interceptor3 = createMockFn();
    const results = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        resultInterceptor: (result) => {
          interceptor1(result);
        },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users/2", method: "GET" },
        resultInterceptor: (result) => {
          interceptor2(result);
        },
      })
      .next<TestRequestResult<typeof thirdUser>>({
        config: { url: "http://example.com/users/3", method: "GET" },
        resultInterceptor: (result) => {
          interceptor3(result);
        },
      })
      .executeAll();
    assert.ok(interceptor1.toHaveBeenCalled());
    assert.ok(interceptor2.toHaveBeenCalled());
    assert.ok(interceptor3.toHaveBeenCalled());
    assert.strictEqual(interceptor1.calls.length, 1);
    assert.strictEqual(interceptor2.calls.length, 1);
    assert.strictEqual(interceptor3.calls.length, 1);
    assert.strictEqual(results.length, 3);
    assert.strictEqual(interceptor1.calls[0][0], results[0]);
    assert.strictEqual(interceptor2.calls[0][0], results[1]);
    assert.strictEqual(interceptor3.calls[0][0], results[2]);
  });

  test("Result interceptor with skipped stage - should not be called", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(thirdUser));
    const interceptor1 = createMockFn();
    const interceptor2 = createMockFn();
    const interceptor3 = createMockFn();
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        resultInterceptor: (result) => {
          interceptor1(result);
        },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users/2", method: "GET" },
        precondition: () => false, // Skip this stage
        resultInterceptor: (result) => {
          interceptor2(result);
        },
      })
      .next<TestRequestResult<typeof thirdUser>>({
        config: { url: "http://example.com/users/3", method: "GET" },
        resultInterceptor: (result) => {
          interceptor3(result);
        },
      })
      .execute();
    assert.ok(interceptor1.toHaveBeenCalled());
    assert.ok(!interceptor2.toHaveBeenCalled()); // Should not be called for skipped stage
    assert.ok(interceptor3.toHaveBeenCalled());
    assert.strictEqual(result.body, JSON.stringify(thirdUser));
  });

  test("Result interceptor with mapper and precondition", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    const interceptor = createMockFn();
    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
        precondition: () => true,
        mapper: (result: Response) => JSON.parse(result.body as any),
        resultInterceptor: (result) => {
          interceptor(result);
          assert.deepStrictEqual(result, firstUser);
        },
      },
      new TestAdapter()
    ).execute();
    assert.ok(interceptor.toHaveBeenCalled());
    assert.deepStrictEqual(result, firstUser);
  });

  test("Result interceptor can access result properties", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    let interceptedBody: string | undefined;
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
        resultInterceptor: (result) => {
          interceptedBody = result.body;
        },
      },
      new TestAdapter()
    ).execute();
    assert.strictEqual(interceptedBody, response);
    assert.strictEqual(interceptedBody, result.body);
  });
});

describe("Error handler test", () => {
  test("Basic error handler execution", async () => {
    resetFetchMock();
    const errorMessage = "Request failed";
    const requestConfig = { url: "http://example.com/users", method: "GET" };
    fetchMock.mockReject(new Error(errorMessage));
    const errorHandler = createMockFn();
    let errorThrown = false;

    try {
      await RequestChain.begin<
        TestRequestResult<typeof firstUser>,
        Response,
        IRequestConfig
      >(
        {
          config: requestConfig,
          errorHandler: (error) => {
            errorHandler(error);
          },
        },
        new TestAdapter()
      ).execute();
    } catch (error) {
      errorThrown = true;
      assert.strictEqual((error as Error).message, errorMessage);
    }

    assert.ok(errorHandler.toHaveBeenCalled());
    assert.strictEqual(errorHandler.calls.length, 1);
    assert.strictEqual(errorHandler.calls[0][0].message, errorMessage);
    // Verify requestConfig is in error.cause
    assert.ok(errorHandler.calls[0][0].cause);
    assert.deepStrictEqual(
      errorHandler.calls[0][0].cause.requestConfig,
      requestConfig
    );
    assert.ok(errorThrown); // Error should still be thrown after handler
  });

  test("Error handler receives correct error", async () => {
    resetFetchMock();
    const customError = new TypeError("Network error");
    const requestConfig = { url: "http://example.com/users", method: "GET" };
    fetchMock.mockReject(customError);
    let receivedError: Error | undefined;

    try {
      await RequestChain.begin<
        TestRequestResult<typeof firstUser>,
        Response,
        IRequestConfig
      >(
        {
          config: requestConfig,
          errorHandler: (error) => {
            receivedError = error;
          },
        },
        new TestAdapter()
      ).execute();
    } catch {
      // Expected to throw
    }

    assert.ok(receivedError);
    assert.strictEqual(receivedError, customError);
    assert.strictEqual(receivedError.name, "TypeError");
    assert.strictEqual(receivedError.message, "Network error");
    // Verify requestConfig is in error.cause
    assert.ok(receivedError.cause);
    assert.deepStrictEqual(receivedError.cause.requestConfig, requestConfig);
  });

  test("Async error handler execution", async () => {
    resetFetchMock();
    const errorMessage = "Request failed";
    fetchMock.mockReject(new Error(errorMessage));
    let handlerResolved = false;
    const errorHandler = createMockFn();

    try {
      await RequestChain.begin<
        TestRequestResult<typeof firstUser>,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users", method: "GET" },
          errorHandler: async (error) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            handlerResolved = true;
            errorHandler(error);
          },
        },
        new TestAdapter()
      ).execute();
    } catch {
      // Expected to throw
    }

    assert.ok(handlerResolved);
    assert.ok(errorHandler.toHaveBeenCalled());
  });

  test("Error handler with nested manager stage", async () => {
    resetFetchMock();
    const errorMessage = "Nested chain failed";
    fetchMock.mockReject(new Error(errorMessage));
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
    );

    try {
      await RequestChain.begin<
        TestRequestResult<typeof firstUser>,
        Response,
        IRequestConfig
      >(
        {
          request: nestedChain,
          errorHandler: (error) => {
            errorHandler(error);
          },
        },
        new TestAdapter()
      ).execute();
    } catch {
      // Expected to throw
    }

    assert.ok(errorHandler.toHaveBeenCalled());
    assert.strictEqual(errorHandler.calls[0][0].message, errorMessage);
    // For manager stages, requestConfig should be undefined
    assert.ok(errorHandler.calls[0][0].cause);
    assert.strictEqual(errorHandler.calls[0][0].cause.requestConfig, undefined);
  });

  test("Error handler with retry - called on final failure", async () => {
    resetFetchMock();
    const errorMessage = "Network error";
    const requestConfig = { url: "http://example.com/users", method: "GET" };
    fetchMock
      .mockReject(new TypeError(errorMessage))
      .mockReject(new TypeError(errorMessage))
      .mockReject(new TypeError(errorMessage));
    const errorHandler = createMockFn();

    try {
      await RequestChain.begin<
        TestRequestResult<typeof firstUser>,
        Response,
        IRequestConfig
      >(
        {
          config: requestConfig,
          retry: {
            maxRetries: 2,
            retryDelay: 10,
          },
          errorHandler: (error) => {
            errorHandler(error);
          },
        },
        new TestAdapter()
      ).execute();
    } catch {
      // Expected to throw after retries exhausted
    }

    // Error handler should be called once after all retries are exhausted
    assert.ok(errorHandler.toHaveBeenCalled());
    assert.strictEqual(errorHandler.calls.length, 1);
    // Verify requestConfig is in error.cause
    assert.ok(errorHandler.calls[0][0].cause);
    assert.deepStrictEqual(
      errorHandler.calls[0][0].cause.requestConfig,
      requestConfig
    );
  });

  test("Error handler with mapper - error occurs before mapper", async () => {
    resetFetchMock();
    const errorMessage = "Request failed";
    fetchMock.mockReject(new Error(errorMessage));
    const errorHandler = createMockFn();
    let mapperCalled = false;

    try {
      await RequestChain.begin<typeof firstUser, Response, IRequestConfig>(
        {
          config: { url: "http://example.com/users", method: "GET" },
          mapper: () => {
            mapperCalled = true;
            return firstUser;
          },
          errorHandler: (error) => {
            errorHandler(error);
          },
        },
        new TestAdapter()
      ).execute();
    } catch {
      // Expected to throw
    }

    assert.ok(errorHandler.toHaveBeenCalled());
    assert.ok(!mapperCalled); // Mapper should not be called when error occurs
  });

  test("Error handler with precondition - error occurs after precondition passes", async () => {
    resetFetchMock();
    const errorMessage = "Request failed";
    fetchMock.mockReject(new Error(errorMessage));
    let preconditionCalled = false;
    const errorHandler = createMockFn();

    try {
      await RequestChain.begin<
        TestRequestResult<typeof firstUser>,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users", method: "GET" },
          precondition: () => {
            preconditionCalled = true;
            return true;
          },
          errorHandler: (error) => {
            errorHandler(error);
          },
        },
        new TestAdapter()
      ).execute();
    } catch {
      // Expected to throw
    }

    assert.ok(preconditionCalled); // Precondition should be checked first
    assert.ok(errorHandler.toHaveBeenCalled()); // Error handler should be called
  });

  test("Error handler not called when stage succeeds", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    const errorHandler = createMockFn();

    await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
        errorHandler: () => {
          errorHandler();
        },
      },
      new TestAdapter()
    ).execute();

    assert.ok(!errorHandler.toHaveBeenCalled()); // Should not be called on success
  });

  test("Error handler execution order - called before error propagation", async () => {
    resetFetchMock();
    const errorMessage = "Request failed";
    const requestConfig = { url: "http://example.com/users", method: "GET" };
    fetchMock.mockReject(new Error(errorMessage));
    const executionOrder: string[] = [];
    const errorHandler = createMockFn();
    let globalErrorHandlerReceivedError: Error | undefined;

    try {
      await RequestChain.begin<
        TestRequestResult<typeof firstUser>,
        Response,
        IRequestConfig
      >(
        {
          config: requestConfig,
          errorHandler: (error) => {
            executionOrder.push("errorHandler");
            errorHandler(error);
          },
        },
        new TestAdapter()
      )
        .withErrorHandler((error) => {
          executionOrder.push("chainErrorHandler");
          globalErrorHandlerReceivedError = error;
        })
        .execute();
    } catch {
      executionOrder.push("catch");
    }

    // Stage error handler should be called before chain error handler
    assert.ok(executionOrder.includes("errorHandler"));
    assert.ok(
      executionOrder.indexOf("errorHandler") <
        executionOrder.indexOf("chainErrorHandler")
    );
    // Verify both handlers receive requestConfig in error.cause
    assert.ok(errorHandler.calls[0][0].cause);
    assert.deepStrictEqual(
      errorHandler.calls[0][0].cause.requestConfig,
      requestConfig
    );
    assert.ok(globalErrorHandlerReceivedError);
    assert.ok(globalErrorHandlerReceivedError.cause);
    assert.deepStrictEqual(
      globalErrorHandlerReceivedError.cause.requestConfig,
      requestConfig
    );
  });

  test("Error handler with result interceptor - error occurs before interceptor", async () => {
    resetFetchMock();
    const errorMessage = "Request failed";
    fetchMock.mockReject(new Error(errorMessage));
    const errorHandler = createMockFn();
    let interceptorCalled = false;

    try {
      await RequestChain.begin<
        TestRequestResult<typeof firstUser>,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users", method: "GET" },
          resultInterceptor: () => {
            interceptorCalled = true;
          },
          errorHandler: (error) => {
            errorHandler(error);
          },
        },
        new TestAdapter()
      ).execute();
    } catch {
      // Expected to throw
    }

    assert.ok(errorHandler.toHaveBeenCalled());
    assert.ok(!interceptorCalled); // Interceptor should not be called when error occurs
  });

  test("Error handler can access error properties", async () => {
    resetFetchMock();
    const customError = new Error("Custom error");
    (customError as any).code = "ERR_CUSTOM";
    fetchMock.mockReject(customError);
    let errorCode: string | undefined;

    try {
      await RequestChain.begin<
        TestRequestResult<typeof firstUser>,
        Response,
        IRequestConfig
      >(
        {
          config: { url: "http://example.com/users", method: "GET" },
          errorHandler: (error) => {
            errorCode = (error as any).code;
          },
        },
        new TestAdapter()
      ).execute();
    } catch {
      // Expected to throw
    }

    assert.strictEqual(errorCode, "ERR_CUSTOM");
  });

  test("Error handler with skipped stage - should not be called", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(thirdUser));
    const errorHandler1 = createMockFn();
    const errorHandler2 = createMockFn();
    const errorHandler3 = createMockFn();

    await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        errorHandler: () => {
          errorHandler1();
        },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof secondUser>>({
        config: { url: "http://example.com/users/2", method: "GET" },
        precondition: () => false, // Skip this stage
        errorHandler: () => {
          errorHandler2();
        },
      })
      .next<TestRequestResult<typeof thirdUser>>({
        config: { url: "http://example.com/users/3", method: "GET" },
        errorHandler: () => {
          errorHandler3();
        },
      })
      .execute();

    // No errors occurred, so no error handlers should be called
    assert.ok(!errorHandler1.toHaveBeenCalled());
    assert.ok(!errorHandler2.toHaveBeenCalled());
    assert.ok(!errorHandler3.toHaveBeenCalled());
  });
});

describe("Coverage improvement tests", () => {
  test("Retry with exponential backoff and maxDelay cap branch", async () => {
    resetFetchMock();
    const startTime = Date.now();
    fetchMock
      .mockReject(new TypeError("Network error"))
      .mockReject(new TypeError("Network error"))
      .mockReject(new TypeError("Network error"))
      .once(JSON.stringify(firstUser));
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
        retry: {
          maxRetries: 5,
          retryDelay: 100,
          exponentialBackoff: true,
          maxDelay: 200, // This will cap the delay at 200ms
        },
      },
      new TestAdapter()
    ).execute();
    const elapsed = Date.now() - startTime;
    // Should have waited with capped delays
    assert.ok(elapsed >= 500);
    assert.strictEqual(result.body, JSON.stringify(firstUser));
  });

  test("Retry with fixed delay branch (no exponential backoff)", async () => {
    resetFetchMock();
    const startTime = Date.now();
    fetchMock
      .mockReject(new TypeError("Network error"))
      .once(JSON.stringify(firstUser));
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users", method: "GET" },
        retry: {
          maxRetries: 3,
          retryDelay: 50,
          exponentialBackoff: false, // Explicitly false to hit fixed delay branch
        },
      },
      new TestAdapter()
    ).execute();
    const elapsed = Date.now() - startTime;
    assert.ok(elapsed >= 50);
    assert.strictEqual(result.body, JSON.stringify(firstUser));
  });

  test("PipelineManagerStage with mapper branch", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    const nestedChain = RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
      },
      new TestAdapter()
    );
    const result = await RequestChain.begin<string, Response, IRequestConfig>(
      {
        request: nestedChain,
        mapper: (result: TestRequestResult<typeof firstUser>) => {
          const data = JSON.parse(result.body);
          return data.name;
        },
      },
      new TestAdapter()
    ).execute();
    assert.strictEqual(result, firstUser.name);
  });

  test("isPipelineManagerStage type guard coverage", async () => {
    resetFetchMock();
    const response: string = JSON.stringify(firstUser);
    fetchMock.mockResponseOnce(response);
    const nestedChain = RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
      },
      new TestAdapter()
    );
    // This will exercise the isPipelineManagerStage type guard
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/2", method: "GET" },
      },
      new TestAdapter()
    )
      .next<TestRequestResult<typeof firstUser>>({
        request: nestedChain,
      })
      .execute();
    assert.ok(result);
  });
});

describe("Mapper with prev parameter", () => {
  test("Mapper receives undefined prev for first stage", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser));
    let prevReceived: unknown = null;
    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        mapper: (result: Response, prev) => {
          prevReceived = prev;
          return JSON.parse(result.body as any);
        },
      },
      new TestAdapter()
    ).execute();
    assert.strictEqual(prevReceived, undefined);
    assert.deepStrictEqual(result, firstUser);
  });

  test("Mapper receives previous result in second stage", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(secondUser));
    let prevReceived: unknown = null;
    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any),
      },
      new TestAdapter()
    )
      .next<typeof secondUser>({
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: (result: Response, prev) => {
          prevReceived = prev;
          return JSON.parse(result.body as any);
        },
      })
      .execute();
    assert.deepStrictEqual(prevReceived, firstUser);
    assert.deepStrictEqual(result, secondUser);
  });

  test("Mapper can use prev parameter to transform result", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(secondUser));
    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any),
      },
      new TestAdapter()
    )
      .next<{ combined: string }>({
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: (result: Response, prev) => {
          const current = JSON.parse(result.body as any);
          return {
            combined: `${prev?.name} and ${current.name}`,
          };
        },
      })
      .execute();
    assert.strictEqual(result.combined, "John Smith and Bruce Wayne");
  });

  test("Mapper receives correct prev through multiple stages", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));
    const prevValues: unknown[] = [];
    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any),
      },
      new TestAdapter()
    )
      .next<typeof secondUser>({
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: (result: Response, prev) => {
          prevValues.push(prev);
          return JSON.parse(result.body as any);
        },
      })
      .next<typeof thirdUser>({
        config: { url: "http://example.com/users/3", method: "GET" },
        mapper: (result: Response, prev) => {
          prevValues.push(prev);
          return JSON.parse(result.body as any);
        },
      })
      .execute();
    assert.strictEqual(prevValues.length, 2);
    assert.deepStrictEqual(prevValues[0], firstUser);
    assert.deepStrictEqual(prevValues[1], secondUser);
    assert.deepStrictEqual(result, thirdUser);
  });

  test("Async mapper can use prev parameter", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(secondUser));
    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        mapper: async (result: Response) => {
          const data = await JSON.parse(result.body as any);
          return data;
        },
      },
      new TestAdapter()
    )
      .next<string>({
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: async (result: Response, prev) => {
          const current = await JSON.parse(result.body as any);
          return `${prev?.name} -> ${current.name}`;
        },
      })
      .execute();
    assert.strictEqual(result, "John Smith -> Bruce Wayne");
  });

  test("Mapper with prev works with different output types", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(secondUser));
    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any),
      },
      new TestAdapter()
    )
      .next<number>({
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: (result: Response, prev) => {
          // prev should be firstUser type
          return prev?.id || 0;
        },
      })
      .execute();
    assert.strictEqual(result, 1);
  });

  test("Mapper prev is undefined when previous stage is skipped", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(thirdUser));
    let prevReceived: unknown = null;
    const result = await RequestChain.begin<
      TestRequestResult<typeof firstUser>,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        precondition: () => false, // Skip first stage
      },
      new TestAdapter()
    )
      .next<typeof thirdUser>({
        config: { url: "http://example.com/users/3", method: "GET" },
        mapper: (result: Response, prev) => {
          prevReceived = prev;
          return JSON.parse(result.body as any);
        },
      })
      .execute();
    assert.strictEqual(prevReceived, undefined);
    assert.deepStrictEqual(result, thirdUser);
  });

  test("Mapper prev receives previous mapped result, not raw result", async () => {
    resetFetchMock();
    fetchMock.once(JSON.stringify(firstUser)).once(JSON.stringify(secondUser));
    const result = await RequestChain.begin<string, Response, IRequestConfig>(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        mapper: (result: Response) => {
          const data = JSON.parse(result.body as any);
          return data.name; // Return only name string
        },
      },
      new TestAdapter()
    )
      .next<typeof secondUser>({
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: (result: Response, prev) => {
          // prev should be the mapped result (string), not the raw Response
          assert.strictEqual(typeof prev, "string");
          assert.strictEqual(prev, "John Smith");
          return JSON.parse(result.body as any);
        },
      })
      .execute();
    assert.deepStrictEqual(result, secondUser);
  });

  test("Mapper prev works with PipelineManagerStage", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser)) // Mock for first stage
      .once(JSON.stringify(firstUser)); // Mock for nested chain
    const nestedChain = RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any),
      },
      new TestAdapter()
    );
    let prevReceived: unknown = null;
    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/0", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any),
      },
      new TestAdapter()
    )
      .next<string>({
        request: nestedChain,
        mapper: (result, prev) => {
          // result is typeof firstUser (from nested chain)
          // prev is typeof firstUser (from previous stage)
          prevReceived = prev;
          return result.name;
        },
      })
      .execute();
    assert.deepStrictEqual(prevReceived, firstUser);
    assert.strictEqual(result, "John Smith");
  });

  test("Mapper prev accumulates through multiple transformations", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify(secondUser))
      .once(JSON.stringify(thirdUser));
    const result = await RequestChain.begin<
      typeof firstUser,
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        mapper: (result: Response) => JSON.parse(result.body as any),
      },
      new TestAdapter()
    )
      .next<string>({
        config: { url: "http://example.com/users/2", method: "GET" },
        mapper: (result: Response, prev) => {
          return prev?.name || "";
        },
      })
      .next<string>({
        config: { url: "http://example.com/users/3", method: "GET" },
        mapper: (result: Response, prev) => {
          // prev should be the string from previous mapper
          return `Previous was: ${prev}`;
        },
      })
      .execute();
    assert.strictEqual(result, "Previous was: John Smith");
  });

  test("Accumulator pattern - passing context through stages", async () => {
    resetFetchMock();
    fetchMock
      .once(JSON.stringify(firstUser))
      .once(JSON.stringify([{ id: 1, total: 100 }]))
      .once(JSON.stringify({ success: true }));
    const result = await RequestChain.begin<
      { user: typeof firstUser },
      Response,
      IRequestConfig
    >(
      {
        config: { url: "http://example.com/users/1", method: "GET" },
        mapper: async (result: Response) => {
          const user = JSON.parse(result.body as any);
          return { user };
        },
      },
      new TestAdapter()
    )
      .next<{
        user: typeof firstUser;
        orders: Array<{ id: number; total: number }>;
      }>({
        config: (prev) => {
          // prev should be { user: typeof firstUser }
          assert.ok(prev?.user);
          assert.strictEqual(prev?.user.id, 1);
          return {
            url: `http://example.com/users/${prev?.user.id}/orders`,
            method: "GET",
          };
        },
        mapper: async (result: Response, prev) => {
          // prev should be { user: typeof firstUser }
          assert.ok(prev?.user);
          const orders = JSON.parse(result.body as any);
          return {
            ...prev, // Keep user data
            orders,
          };
        },
      })
      .next<{
        user: typeof firstUser;
        orders: Array<{ id: number; total: number }>;
      }>({
        config: (prev) => {
          // prev should be { user: typeof firstUser, orders: Array }
          assert.ok(prev?.user);
          assert.ok(prev?.orders);
          assert.strictEqual(prev?.orders.length, 1);
          return { url: "http://example.com/final-step", method: "POST" };
        },
        mapper: async (result: Response, prev) => {
          // Return the accumulated result (prev) instead of the raw response
          return prev!;
        },
      })
      .execute();
    assert.ok(result.user);
    assert.ok(result.orders);
    assert.strictEqual(result.user.id, 1);
    assert.strictEqual(result.orders.length, 1);
  });
});
