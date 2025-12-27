import { describe, test, beforeEach } from "node:test";
import * as assert from "node:assert";
import { RequestChain } from "@flow-pipe/core";
import type { AxiosResponse } from "axios";
import type { AxiosRequestConfigType } from "../AxiosRequestAdapter";
import TestAxiosAdapter from "./__mocks__/TestAxiosAdapter";
import axiosMock, {
  resetAxiosMock,
  axiosMockToBeCalledWith,
  getAxiosCalls,
} from "./__mocks__/axiosMock";

const firstUser = { id: 1, name: "John Smith" };
const secondUser = { id: 2, name: "Bruce Wayne" };
const thirdUser = { id: 3, name: "Tony Stark" };

describe("AxiosRequestAdapter", () => {
  beforeEach(() => {
    resetAxiosMock();
  });

  describe("Basic requests", () => {
    test("Basic GET request", async () => {
      axiosMock.mockResponseOnce({
        data: firstUser,
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      const result = await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
      >(
        {
          config: { url: "http://example.com/users", method: "GET" },
        },
        adapter
      ).execute();

      assert.deepStrictEqual(result.data, firstUser);
      assert.strictEqual(result.status, 200);
      assert.ok(
        axiosMockToBeCalledWith({
          url: "http://example.com/users",
          method: "get",
        })
      );
    });

    test("POST request with data", async () => {
      const newUser = { name: "Jane Doe", email: "jane@example.com" };
      const createdUser = { id: 4, ...newUser };

      axiosMock.mockResponseOnce({
        data: createdUser,
        status: 201,
        statusText: "Created",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      const result = await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
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

      assert.deepStrictEqual(result.data, createdUser);
      assert.strictEqual(result.status, 201);
      assert.ok(
        axiosMockToBeCalledWith({
          url: "http://example.com/users",
          method: "post",
          data: newUser,
        })
      );
    });

    test("PUT request with data", async () => {
      const updatedUser = { id: 1, name: "John Updated" };

      axiosMock.mockResponseOnce({
        data: updatedUser,
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      const result = await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
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

      assert.deepStrictEqual(result.data, updatedUser);
      assert.ok(
        axiosMockToBeCalledWith({
          url: "http://example.com/users/1",
          method: "put",
          data: updatedUser,
        })
      );
    });

    test("PATCH request with data", async () => {
      const partialUpdate = { name: "John Patched" };

      axiosMock.mockResponseOnce({
        data: { id: 1, ...partialUpdate },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      const result = await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
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

      assert.deepStrictEqual(result.data.name, partialUpdate.name);
      assert.ok(
        axiosMockToBeCalledWith({
          url: "http://example.com/users/1",
          method: "patch",
          data: partialUpdate,
        })
      );
    });

    test("DELETE request", async () => {
      axiosMock.mockResponseOnce({
        data: {},
        status: 204,
        statusText: "No Content",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      const result = await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
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
        axiosMockToBeCalledWith({
          url: "http://example.com/users/1",
          method: "delete",
        })
      );
    });
  });

  describe("Request with headers", () => {
    test("GET request with custom headers", async () => {
      axiosMock.mockResponseOnce({
        data: firstUser,
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      const result = await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
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

      assert.deepStrictEqual(result.data, firstUser);
      assert.ok(
        axiosMockToBeCalledWith({
          url: "http://example.com/users",
          method: "get",
          headers: {
            Authorization: "Bearer token123",
            "X-Custom-Header": "value",
          },
        })
      );
    });

    test("POST request with Content-Type header", async () => {
      const newUser = { name: "Jane Doe" };

      axiosMock.mockResponseOnce({
        data: { id: 4, ...newUser },
        status: 201,
        statusText: "Created",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
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

      const calls = getAxiosCalls();
      assert.strictEqual(calls.length, 1);
      assert.ok(calls[0].config?.headers);
      assert.strictEqual(
        (calls[0].config?.headers as any)["Content-Type"],
        "application/json"
      );
    });
  });

  describe("Request with query parameters", () => {
    test("GET request with params", async () => {
      axiosMock.mockResponseOnce({
        data: [firstUser, secondUser],
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      const result = await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
      >(
        {
          config: {
            url: "http://example.com/users",
            method: "GET",
            params: {
              page: 1,
              limit: 10,
            },
          },
        },
        adapter
      ).execute();

      assert.ok(Array.isArray(result.data));
      assert.ok(
        axiosMockToBeCalledWith({
          url: "http://example.com/users",
          method: "get",
          params: {
            page: 1,
            limit: 10,
          },
        })
      );
    });
  });

  describe("Chained requests", () => {
    test("Multiple GET requests", async () => {
      axiosMock
        .mockResponseOnce({
          data: firstUser,
          status: 200,
          statusText: "OK",
          headers: {},
          config: {} as any,
        })
        .mockResponseOnce({
          data: secondUser,
          status: 200,
          statusText: "OK",
          headers: {},
          config: {} as any,
        })
        .mockResponseOnce({
          data: thirdUser,
          status: 200,
          statusText: "OK",
          headers: {},
          config: {} as any,
        });

      const adapter = new TestAxiosAdapter();
      const result = await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        adapter
      )
        .next<AxiosResponse>({
          config: { url: "http://example.com/users/2", method: "GET" },
        })
        .next<AxiosResponse>({
          config: { url: "http://example.com/users/3", method: "GET" },
        })
        .execute();

      assert.deepStrictEqual(result.data, thirdUser);
      const calls = getAxiosCalls();
      assert.strictEqual(calls.length, 3);
    });

    test("Chained requests with data from previous response", async () => {
      axiosMock
        .mockResponseOnce({
          data: firstUser,
          status: 200,
          statusText: "OK",
          headers: {},
          config: {} as any,
        })
        .mockResponseOnce({
          data: [{ id: 1, title: "Post 1" }],
          status: 200,
          statusText: "OK",
          headers: {},
          config: {} as any,
        });

      const adapter = new TestAxiosAdapter();
      const result = await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
        },
        adapter
      )
        .next({
          config: (previousResult: AxiosResponse) => {
            const user = previousResult.data as typeof firstUser;
            return {
              url: `http://example.com/users/${user.id}/posts`,
              method: "GET",
            };
          },
        })
        .execute();

      assert.ok(Array.isArray(result.data));
      assert.strictEqual(result.data.length, 1);
    });
  });

  describe("Request with mapper", () => {
    test("GET request with mapper to transform response", async () => {
      axiosMock.mockResponseOnce({
        data: firstUser,
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      const result = await RequestChain.begin<
        string,
        AxiosResponse,
        AxiosRequestConfigType
      >(
        {
          config: { url: "http://example.com/users/1", method: "GET" },
          mapper: (response: AxiosResponse) => {
            const user = response.data as typeof firstUser;
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
      axiosMock.mockReject(networkError);

      const adapter = new TestAxiosAdapter();
      let errorThrown = false;

      try {
        await RequestChain.begin<
          AxiosResponse,
          AxiosResponse,
          AxiosRequestConfigType
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
      const axiosError = {
        name: "AxiosError",
        message: "Request failed with status code 404",
        response: {
          data: { error: "Not Found" },
          status: 404,
          statusText: "Not Found",
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        isAxiosError: true,
        toJSON: () => ({}),
      } as any;

      axiosMock.mockReject(axiosError);

      const adapter = new TestAxiosAdapter();
      let errorThrown = false;

      try {
        await RequestChain.begin<
          AxiosResponse,
          AxiosResponse,
          AxiosRequestConfigType
        >(
          {
            config: { url: "http://example.com/users/999", method: "GET" },
          },
          adapter
        ).execute();
      } catch (error) {
        errorThrown = true;
        assert.ok(
          (error as { isAxiosError?: boolean }).isAxiosError ||
            error instanceof Error
        );
      }

      assert.ok(errorThrown);
    });
  });

  describe("Custom Axios configuration", () => {
    test("Request with timeout", async () => {
      axiosMock.mockResponseOnce({
        data: firstUser,
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
      >(
        {
          config: {
            url: "http://example.com/users",
            method: "GET",
            timeout: 5000,
          },
        },
        adapter
      ).execute();

      const calls = getAxiosCalls();
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].config?.timeout, 5000);
    });

    test("Request with auth", async () => {
      axiosMock.mockResponseOnce({
        data: firstUser,
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
      >(
        {
          config: {
            url: "http://example.com/users",
            method: "GET",
            auth: {
              username: "user",
              password: "pass",
            },
          },
        },
        adapter
      ).execute();

      const calls = getAxiosCalls();
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0].config?.auth, {
        username: "user",
        password: "pass",
      });
    });

    test("Request with validateStatus", async () => {
      axiosMock.mockResponseOnce({
        data: firstUser,
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
      >(
        {
          config: {
            url: "http://example.com/users",
            method: "GET",
            validateStatus: (status: number) => status < 500,
          },
        },
        adapter
      ).execute();

      const calls = getAxiosCalls();
      assert.strictEqual(calls.length, 1);
      assert.ok(typeof calls[0].config?.validateStatus === "function");
    });
  });

  describe("Method conversion", () => {
    test("Converts uppercase methods to lowercase", async () => {
      axiosMock.mockResponseOnce({
        data: firstUser,
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
      >(
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
        axiosMockToBeCalledWith({
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
        resetAxiosMock();
        axiosMock.mockResponseOnce({
          data: {},
          status: 200,
          statusText: "OK",
          headers: {},
          config: {} as any,
        });

        const adapter = new TestAxiosAdapter();
        await RequestChain.begin<
          AxiosResponse,
          AxiosResponse,
          AxiosRequestConfigType
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
          axiosMockToBeCalledWith({
            url: "http://example.com/test",
            method: method.toLowerCase() as AxiosRequestConfigType["method"],
          })
        );
      }
    });
  });

  describe("Data handling", () => {
    test("Handles object data", async () => {
      const data = { name: "John", age: 30 };

      axiosMock.mockResponseOnce({
        data: { id: 1, ...data },
        status: 201,
        statusText: "Created",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
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

      const calls = getAxiosCalls();
      assert.deepStrictEqual(calls[0].config?.data, data);
    });

    test("Handles string data", async () => {
      const data = "raw string data";

      axiosMock.mockResponseOnce({
        data: "response",
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
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

      const calls = getAxiosCalls();
      assert.strictEqual(calls[0].config?.data, data);
    });

    test("Handles null data", async () => {
      axiosMock.mockResponseOnce({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      });

      const adapter = new TestAxiosAdapter();
      await RequestChain.begin<
        AxiosResponse,
        AxiosResponse,
        AxiosRequestConfigType
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

      const calls = getAxiosCalls();
      assert.strictEqual(calls[0].config?.data, null);
    });
  });
});
