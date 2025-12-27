import { describe, test, beforeEach } from "node:test";
import * as assert from "node:assert";
import { RequestChain } from "@flow-pipe/core";
import type { Response } from "node-fetch";
import type { NodeFetchRequestConfig } from "../NodeFetchRequestAdapter";
import TestNodeFetchAdapter from "./__mocks__/TestNodeFetchAdapter";
import nodeFetchMock, {
  resetNodeFetchMock,
  nodeFetchMockToBeCalledWith,
  getNodeFetchCalls,
} from "./__mocks__/nodeFetchMock";

const firstUser = { id: 1, name: "John Smith" };
const secondUser = { id: 2, name: "Bruce Wayne" };
const thirdUser = { id: 3, name: "Tony Stark" };

describe("NodeFetchRequestAdapter", () => {
  beforeEach(() => {
    resetNodeFetchMock();
  });

  describe("Basic requests", () => {
    test("Basic GET request", async () => {
      nodeFetchMock.mockResponseOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify(firstUser),
        json: async () => firstUser,
      });

      const adapter = new TestNodeFetchAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        NodeFetchRequestConfig
      >(
        {
          config: { url: "http://example.com/users", method: "GET" },
        },
        adapter
      ).execute();

      const data = await result.json();
      assert.deepStrictEqual(data, firstUser);
      assert.strictEqual(result.status, 200);
      assert.ok(
        nodeFetchMockToBeCalledWith("http://example.com/users", {
          method: "GET",
        })
      );
    });

    test("POST request with data", async () => {
      const newUser = { name: "Jane Doe", email: "jane@example.com" };
      const createdUser = { id: 4, ...newUser };

      nodeFetchMock.mockResponseOnce({
        ok: true,
        status: 201,
        statusText: "Created",
        headers: {},
        body: JSON.stringify(createdUser),
        json: async () => createdUser,
      });

      const adapter = new TestNodeFetchAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        NodeFetchRequestConfig
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

      const data = await result.json();
      assert.deepStrictEqual(data, createdUser);
      assert.strictEqual(result.status, 201);
      assert.ok(
        nodeFetchMockToBeCalledWith("http://example.com/users", {
          method: "POST",
          body: JSON.stringify(newUser),
        })
      );
    });

    test("PUT request with data", async () => {
      const updatedUser = { id: 1, name: "John Updated" };

      nodeFetchMock.mockResponseOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify(updatedUser),
        json: async () => updatedUser,
      });

      const adapter = new TestNodeFetchAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        NodeFetchRequestConfig
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

      const data = await result.json();
      assert.deepStrictEqual(data, updatedUser);
      assert.ok(
        nodeFetchMockToBeCalledWith("http://example.com/users/1", {
          method: "PUT",
          body: JSON.stringify(updatedUser),
        })
      );
    });

    test("PATCH request with data", async () => {
      const partialUpdate = { name: "John Patched" };

      nodeFetchMock.mockResponseOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify({ id: 1, ...partialUpdate }),
        json: async () => ({ id: 1, ...partialUpdate }),
      });

      const adapter = new TestNodeFetchAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        NodeFetchRequestConfig
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

      const data = await result.json();
      assert.strictEqual(data.name, partialUpdate.name);
      assert.ok(
        nodeFetchMockToBeCalledWith("http://example.com/users/1", {
          method: "PATCH",
          body: JSON.stringify(partialUpdate),
        })
      );
    });

    test("DELETE request", async () => {
      nodeFetchMock.mockResponseOnce({
        ok: true,
        status: 204,
        statusText: "No Content",
        headers: {},
        body: null,
        json: async () => ({}),
      });

      const adapter = new TestNodeFetchAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        NodeFetchRequestConfig
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
        nodeFetchMockToBeCalledWith("http://example.com/users/1", {
          method: "DELETE",
        })
      );
    });
  });

  describe("Request with headers", () => {
    test("GET request with custom headers", async () => {
      nodeFetchMock.mockResponseOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify(firstUser),
        json: async () => firstUser,
      });

      const adapter = new TestNodeFetchAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        NodeFetchRequestConfig
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

      const data = await result.json();
      assert.deepStrictEqual(data, firstUser);
      assert.ok(
        nodeFetchMockToBeCalledWith("http://example.com/users", {
          method: "GET",
          headers: {
            Authorization: "Bearer token123",
            "X-Custom-Header": "value",
          },
        })
      );
    });

    test("POST request with Content-Type header", async () => {
      const newUser = { name: "Jane Doe" };

      nodeFetchMock.mockResponseOnce({
        ok: true,
        status: 201,
        statusText: "Created",
        headers: {},
        body: JSON.stringify({ id: 4, ...newUser }),
        json: async () => ({ id: 4, ...newUser }),
      });

      const adapter = new TestNodeFetchAdapter();
      await RequestChain.begin<
        Response,
        Response,
        NodeFetchRequestConfig
      >(
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

      const calls = getNodeFetchCalls();
      assert.strictEqual(calls.length, 1);
      assert.ok(calls[0].options?.headers);
      const headers = calls[0].options?.headers as Record<string, string>;
      assert.strictEqual(headers["Content-Type"], "application/json");
    });
  });

  describe("Chained requests", () => {
    test("Multiple GET requests", async () => {
      nodeFetchMock
        .mockResponseOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: {},
          body: JSON.stringify(firstUser),
          json: async () => firstUser,
        })
        .mockResponseOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: {},
          body: JSON.stringify(secondUser),
          json: async () => secondUser,
        })
        .mockResponseOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: {},
          body: JSON.stringify(thirdUser),
          json: async () => thirdUser,
        });

      const adapter = new TestNodeFetchAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        NodeFetchRequestConfig
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

      const data = await result.json();
      assert.deepStrictEqual(data, thirdUser);
      const calls = getNodeFetchCalls();
      assert.strictEqual(calls.length, 3);
    });

    test("Chained requests with data from previous response", async () => {
      nodeFetchMock
        .mockResponseOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: {},
          body: JSON.stringify(firstUser),
          json: async () => firstUser,
        })
        .mockResponseOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: {},
          body: JSON.stringify([{ id: 1, title: "Post 1" }]),
          json: async () => [{ id: 1, title: "Post 1" }],
        });

      const adapter = new TestNodeFetchAdapter();
      const result = await RequestChain.begin<
        typeof firstUser,
        Response,
        NodeFetchRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: async (response: Response) => {
            return (await response.json()) as typeof firstUser;
          },
        },
        adapter
      )
        .next({
          config: (previousResult: typeof firstUser) => {
            return {
              url: `http://example.com/users/${previousResult.id}/posts`,
              method: "GET",
            };
          },
        })
        .execute();

      const data = await result.json();
      assert.ok(Array.isArray(data));
      assert.strictEqual(data.length, 1);
    });
  });

  describe("Request with mapper", () => {
    test("GET request with mapper to transform response", async () => {
      nodeFetchMock.mockResponseOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify(firstUser),
        json: async () => firstUser,
      });

      const adapter = new TestNodeFetchAdapter();
      const result = await RequestChain.begin<
        string,
        Response,
        NodeFetchRequestConfig
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: async (response: Response) => {
            const user = (await response.json()) as typeof firstUser;
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
      nodeFetchMock.mockReject(networkError);

      const adapter = new TestNodeFetchAdapter();
      let errorThrown = false;

      try {
        await RequestChain.begin<
          Response,
          Response,
          NodeFetchRequestConfig
        >(
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
      nodeFetchMock.mockResponseOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: {},
        body: JSON.stringify({ error: "Not Found" }),
        json: async () => ({ error: "Not Found" }),
      });

      const adapter = new TestNodeFetchAdapter();
      const result = await RequestChain.begin<
        Response,
        Response,
        NodeFetchRequestConfig
      >(
        {
          config: { url: "http://example.com/users/999", method: "GET" },
        },
        adapter
      ).execute();

      assert.strictEqual(result.status, 404);
      assert.strictEqual(result.ok, false);
      const data = await result.json();
      assert.strictEqual(data.error, "Not Found");
    });
  });

  describe("Data handling", () => {
    test("Handles object data", async () => {
      const data = { name: "John", age: 30 };

      nodeFetchMock.mockResponseOnce({
        ok: true,
        status: 201,
        statusText: "Created",
        headers: {},
        body: JSON.stringify({ id: 1, ...data }),
        json: async () => ({ id: 1, ...data }),
      });

      const adapter = new TestNodeFetchAdapter();
      await RequestChain.begin<
        Response,
        Response,
        NodeFetchRequestConfig
      >(
        {
          config: {
            url: "http://example.com/users",
            method: "POST",
            data,
          },
        },
        adapter
      ).execute();

      const calls = getNodeFetchCalls();
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].options?.body, JSON.stringify(data));
    });

    test("Handles string data", async () => {
      const data = "raw string data";

      nodeFetchMock.mockResponseOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: "response",
        text: async () => "response",
      });

      const adapter = new TestNodeFetchAdapter();
      await RequestChain.begin<
        Response,
        Response,
        NodeFetchRequestConfig
      >(
        {
          config: {
            url: "http://example.com/data",
            method: "POST",
            data,
          },
        },
        adapter
      ).execute();

      const calls = getNodeFetchCalls();
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].options?.body, data);
    });

    test("Handles null data", async () => {
      nodeFetchMock.mockResponseOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: null,
        json: async () => ({}),
      });

      const adapter = new TestNodeFetchAdapter();
      await RequestChain.begin<
        Response,
        Response,
        NodeFetchRequestConfig
      >(
        {
          config: {
            url: "http://example.com/users",
            method: "GET",
            data: null,
          },
        },
        adapter
      ).execute();

      const calls = getNodeFetchCalls();
      assert.strictEqual(calls.length, 1);
      // null data should be stringified
      assert.strictEqual(calls[0].options?.body, JSON.stringify(null));
    });
  });

  describe("Method handling", () => {
    test("Handles all HTTP methods", async () => {
      const methods: Array<
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
      > = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

      for (const method of methods) {
        resetNodeFetchMock();
        nodeFetchMock.mockResponseOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: {},
          body: null,
          json: async () => ({}),
        });

        const adapter = new TestNodeFetchAdapter();
        await RequestChain.begin<
          Response,
          Response,
          NodeFetchRequestConfig
        >(
          {
            config: {
              url: "http://example.com/test",
              method,
            },
          },
          adapter
        ).execute();

        assert.ok(
          nodeFetchMockToBeCalledWith("http://example.com/test", {
            method,
          })
        );
      }
    });
  });
});

