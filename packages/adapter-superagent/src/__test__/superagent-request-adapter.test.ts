import { describe, test, beforeEach } from "node:test";
import * as assert from "node:assert";
import { RequestChain } from "@request-orchestrator/core";
import type { Response } from "superagent";
import type { SuperagentRequestConfig } from "../superagent-request-adapter";
import TestSuperagentAdapter from "./__mocks__/test-superagent-adapter";
import superagentMock, {
  resetSuperagentMock,
  superagentMockToBeCalledWith,
  getSuperagentCalls,
} from "./__mocks__/superagent-mock";

const firstUser = { id: 1, name: "John Smith" };
const secondUser = { id: 2, name: "Bruce Wayne" };
const thirdUser = { id: 3, name: "Tony Stark" };

describe("SuperagentRequestAdapter", () => {
  beforeEach(() => {
    resetSuperagentMock();
  });

  describe("Basic requests", () => {
    test("Basic GET request", async () => {
      superagentMock.mockResponseOnce({
        body: firstUser,
        status: 200,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        SuperagentRequestConfig
      >(
        {
          config: { url: "http://example.com/users", method: "GET" },
        },
        adapter
      ).execute();

      assert.deepStrictEqual(result.body, firstUser);
      assert.strictEqual(result.status, 200);
      assert.ok(
        superagentMockToBeCalledWith({
          url: "http://example.com/users",
          method: "get",
        })
      );
    });

    test("POST request with data", async () => {
      const newUser = { name: "Jane Doe", email: "jane@example.com" };
      const createdUser = { id: 4, ...newUser };

      superagentMock.mockResponseOnce({
        body: createdUser,
        status: 201,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        SuperagentRequestConfig
      >(
        {
          config: {
            url: "http://example.com/users",
            method: "POST",
            data: newUser,
          },
        },
        adapter
      ).execute();

      assert.deepStrictEqual(result.body, createdUser);
      assert.strictEqual(result.status, 201);
      assert.ok(
        superagentMockToBeCalledWith({
          url: "http://example.com/users",
          method: "post",
          data: newUser,
        })
      );
    });

    test("PUT request with data", async () => {
      const updatedUser = { id: 1, name: "John Updated" };

      superagentMock.mockResponseOnce({
        body: updatedUser,
        status: 200,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        SuperagentRequestConfig
      >(
        {
          config: {
            url: "http://example.com/users/1",
            method: "PUT",
            data: updatedUser,
          },
        },
        adapter
      ).execute();

      assert.deepStrictEqual(result.body, updatedUser);
      assert.ok(
        superagentMockToBeCalledWith({
          url: "http://example.com/users/1",
          method: "put",
          data: updatedUser,
        })
      );
    });

    test("PATCH request with data", async () => {
      const partialUpdate = { name: "John Patched" };

      superagentMock.mockResponseOnce({
        body: { id: 1, ...partialUpdate },
        status: 200,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        SuperagentRequestConfig
      >(
        {
          config: {
            url: "http://example.com/users/1",
            method: "PATCH",
            data: partialUpdate,
          },
        },
        adapter
      ).execute();

      assert.deepStrictEqual(result.body.name, partialUpdate.name);
      assert.ok(
        superagentMockToBeCalledWith({
          url: "http://example.com/users/1",
          method: "patch",
          data: partialUpdate,
        })
      );
    });

    test("DELETE request", async () => {
      superagentMock.mockResponseOnce({
        body: {},
        status: 204,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        SuperagentRequestConfig
      >(
        {
          config: {
            url: "http://example.com/users/1",
            method: "DELETE",
          },
        },
        adapter
      ).execute();

      assert.strictEqual(result.status, 204);
      assert.ok(
        superagentMockToBeCalledWith({
          url: "http://example.com/users/1",
          method: "delete",
        })
      );
    });
  });

  describe("Request with headers", () => {
    test("GET request with custom headers", async () => {
      superagentMock.mockResponseOnce({
        body: firstUser,
        status: 200,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        SuperagentRequestConfig
      >(
        {
          config: {
            url: "http://example.com/users",
            method: "GET",
            headers: {
              Authorization: "Bearer token123",
              "X-Custom-Header": "value",
            },
          },
        },
        adapter
      ).execute();

      assert.deepStrictEqual(result.body, firstUser);
      const calls = getSuperagentCalls();
      assert.strictEqual(calls.length, 1);
      assert.ok(calls[0].headers);
      assert.strictEqual(calls[0].headers!["Authorization"], "Bearer token123");
      assert.strictEqual(calls[0].headers!["X-Custom-Header"], "value");
    });

    test("POST request with Content-Type header", async () => {
      const newUser = { name: "Jane Doe" };

      superagentMock.mockResponseOnce({
        body: { id: 4, ...newUser },
        status: 201,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      await RequestChain.begin<Response, Response, SuperagentRequestConfig>(
        {
          config: {
            url: "http://example.com/users",
            method: "POST",
            data: newUser,
            headers: {
              "Content-Type": "application/json",
            },
          },
        },
        adapter
      ).execute();

      const calls = getSuperagentCalls();
      assert.strictEqual(calls.length, 1);
      assert.ok(calls[0].headers);
      assert.strictEqual(calls[0].headers!["Content-Type"], "application/json");
    });
  });

  describe("Chained requests", () => {
    test("Multiple GET requests", async () => {
      superagentMock
        .mockResponseOnce({
          body: firstUser,
          status: 200,
          headers: {},
        })
        .mockResponseOnce({
          body: secondUser,
          status: 200,
          headers: {},
        })
        .mockResponseOnce({
          body: thirdUser,
          status: 200,
          headers: {},
        });

      const adapter = new TestSuperagentAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        SuperagentRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        adapter
      )
        .next<Response>({
          config: { url: "http://example.com/users/2", method: "GET" },
        })
        .next<Response>({
          config: { url: "http://example.com/users/3", method: "GET" },
        })
        .execute();

      assert.deepStrictEqual(result.body, thirdUser);
      const calls = getSuperagentCalls();
      assert.strictEqual(calls.length, 3);
    });

    test("Chained requests with data from previous response", async () => {
      superagentMock
        .mockResponseOnce({
          body: firstUser,
          status: 200,
          headers: {},
        })
        .mockResponseOnce({
          body: [{ id: 1, title: "Post 1" }],
          status: 200,
          headers: {},
        });

      const adapter = new TestSuperagentAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        SuperagentRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        adapter
      )
        .next({
          config: (previousResult: Response) => {
            const user = previousResult.body as typeof firstUser;
            return {
              url: `http://example.com/users/${user.id}/posts`,
              method: "GET",
            };
          },
        })
        .execute();

      assert.ok(Array.isArray(result.body));
      assert.strictEqual(result.body.length, 1);
    });
  });

  describe("Request with mapper", () => {
    test("GET request with mapper to transform response", async () => {
      superagentMock.mockResponseOnce({
        body: firstUser,
        status: 200,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      const result = await RequestChain.begin<
        string,
        Response,
        SuperagentRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: (response: Response) => {
            const user = response.body as typeof firstUser;
            return user.name;
          },
        },
        adapter
      ).execute();

      assert.strictEqual(result, firstUser.name);
    });
  });

  describe("Error handling", () => {
    test("Handles network errors", async () => {
      const networkError = new Error("Network Error");
      superagentMock.mockReject(networkError);

      const adapter = new TestSuperagentAdapter();
      let errorThrown = false;

      try {
        await RequestChain.begin<Response, Response, SuperagentRequestConfig>(
          {
            config: { url: "http://example.com/users", method: "GET" },
          },
          adapter
        ).execute();
      } catch (error) {
        errorThrown = true;
        assert.strictEqual((error as Error).message, "Network Error");
      }

      assert.ok(errorThrown);
    });

    test("Handles HTTP error responses", async () => {
      const superagentError = {
        name: "Error",
        message: "Not Found",
        status: 404,
        response: {
          body: { error: "Not Found" },
          status: 404,
          headers: {},
        },
      } as any;

      superagentMock.mockReject(superagentError);

      const adapter = new TestSuperagentAdapter();
      let errorThrown = false;

      try {
        await RequestChain.begin<Response, Response, SuperagentRequestConfig>(
          {
            config: { url: "http://example.com/users/999", method: "GET" },
          },
          adapter
        ).execute();
      } catch (error) {
        errorThrown = true;
        assert.ok(
          (error as { status?: number }).status === 404 ||
            error instanceof Error
        );
      }

      assert.ok(errorThrown);
    });
  });

  describe("Method conversion", () => {
    test("Converts uppercase methods to lowercase", async () => {
      superagentMock.mockResponseOnce({
        body: firstUser,
        status: 200,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      await RequestChain.begin<Response, Response, SuperagentRequestConfig>(
        {
          config: {
            url: "http://example.com/users",
            method: "GET", // Uppercase
          },
        },
        adapter
      ).execute();

      // Verify method was converted to lowercase
      assert.ok(
        superagentMockToBeCalledWith({
          url: "http://example.com/users",
          method: "get", // Lowercase
        })
      );
    });

    test("Handles all HTTP methods", async () => {
      const methods: Array<
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
      > = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

      for (const method of methods) {
        resetSuperagentMock();
        superagentMock.mockResponseOnce({
          body: {},
          status: 200,
          headers: {},
        });

        const adapter = new TestSuperagentAdapter();
        await RequestChain.begin<Response, Response, SuperagentRequestConfig>(
          {
            config: {
              url: "http://example.com/test",
              method,
            },
          },
          adapter
        ).execute();

        assert.ok(
          superagentMockToBeCalledWith({
            url: "http://example.com/test",
            method: method.toLowerCase(),
          })
        );
      }
    });
  });

  describe("Data handling", () => {
    test("Handles object data", async () => {
      const data = { name: "John", age: 30 };

      superagentMock.mockResponseOnce({
        body: { id: 1, ...data },
        status: 201,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      await RequestChain.begin<Response, Response, SuperagentRequestConfig>(
        {
          config: {
            url: "http://example.com/users",
            method: "POST",
            data,
          },
        },
        adapter
      ).execute();

      const calls = getSuperagentCalls();
      assert.deepStrictEqual(calls[0].data, data);
    });

    test("Handles string data", async () => {
      const data = "raw string data";

      superagentMock.mockResponseOnce({
        body: "response",
        status: 200,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      await RequestChain.begin<Response, Response, SuperagentRequestConfig>(
        {
          config: {
            url: "http://example.com/data",
            method: "POST",
            data,
          },
        },
        adapter
      ).execute();

      const calls = getSuperagentCalls();
      assert.strictEqual(calls[0].data, data);
    });

    test("Handles null data", async () => {
      superagentMock.mockResponseOnce({
        body: {},
        status: 200,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      await RequestChain.begin<Response, Response, SuperagentRequestConfig>(
        {
          config: {
            url: "http://example.com/users",
            method: "GET",
            data: null,
          },
        },
        adapter
      ).execute();

      const calls = getSuperagentCalls();
      assert.strictEqual(calls[0].data, null);
    });

    test("Handles undefined data (no data sent)", async () => {
      superagentMock.mockResponseOnce({
        body: {},
        status: 200,
        headers: {},
      });

      const adapter = new TestSuperagentAdapter();
      await RequestChain.begin<Response, Response, SuperagentRequestConfig>(
        {
          config: {
            url: "http://example.com/users",
            method: "GET",
          },
        },
        adapter
      ).execute();

      const calls = getSuperagentCalls();
      assert.strictEqual(calls[0].data, undefined);
    });
  });
});
