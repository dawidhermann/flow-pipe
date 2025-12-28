import { describe, test } from "node:test";
import * as assert from "node:assert";
import RequestChain, { begin } from "../RequestChain";
import type { ResultHandler, IRequestConfig } from "../index";
import type RequestAdapter from "../RequestAdapter";
import fetchMock, {
  resetFetchMock,
  fetchMockToBeCalledWith,
} from "./__mocks__/fetchMock";
import TestAdapter from "./__mocks__/TestAdapter";

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
    fetchMock.mockReject(new Error("fake error message"));
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
      .withErrorHandler((error: Error): void => {
        assert.strictEqual(error.message, "fake error message");
      })
      .execute()
      .catch(() => {
        // Catch used only for tests
      });
  });

  test("Finish handler test", async () => {
    resetFetchMock();
    fetchMock.mockReject(new Error("fake error message"));
    const finishHandler = createMockFn();
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
      .withErrorHandler((error: Error): void => {
        assert.strictEqual(error.message, "fake error message");
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
        config: { url: "http://example.com/users", method: "GET" },
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
    fetchMock
      .once(JSON.stringify(firstUser))
      .mockReject(new Error("fake error message"))
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
    requestChain
      .withResultHandler(resultHandler)
      .withErrorHandler((error: Error): void => {
        assert.strictEqual(error.message, "fake error message");
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
    fetchMock.mockReject(new Error("fake error message"));
    await begin<TestRequestResult<typeof firstUser>, Response, IRequestConfig>(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .withErrorHandler((error: Error): void => {
        assert.strictEqual(error.message, "fake error message");
      })
      .execute()
      .catch(() => {
        // Catch used only for tests
      });
  });

  test("Finish handler test", async () => {
    resetFetchMock();
    fetchMock.mockReject(new Error("fake error message"));
    const finishHandler = createMockFn();
    await begin<TestRequestResult<typeof firstUser>, Response, IRequestConfig>(
      {
        config: { url: "http://example.com/users", method: "GET" },
      },
      new TestAdapter()
    )
      .withErrorHandler((error: Error): void => {
        assert.strictEqual(error.message, "fake error message");
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
    fetchMock.mockReject(new Error("fake error message"));
    const resultHandler = createMockFn();
    const errorHandler = createMockFn();
    const finishHandler = createMockFn();
    await begin<TestRequestResult<typeof firstUser>, Response, IRequestConfig>(
      {
        config: { url: "http://example.com/users", method: "GET" },
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
    fetchMock
      .once(JSON.stringify(firstUser))
      .mockReject(new Error("fake error message"))
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
    requestChain
      .withResultHandler(resultHandler)
      .withErrorHandler((error: Error): void => {
        assert.strictEqual(error.message, "fake error message");
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
