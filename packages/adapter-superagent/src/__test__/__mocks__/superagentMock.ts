// Superagent mock utility for Node.js test runner

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Response = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Request = any;

type SuperagentMockResponse =
  | Response
  | {
      body?: any;
      text?: string;
      status?: number;
      statusCode?: number;
      headers?: Record<string, string>;
      type?: string;
      ok?: boolean;
    };

type SuperagentMockError = Error & {
  status?: number;
  response?: Response;
};

interface SuperagentCall {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  data?: any;
}

class SuperagentMock {
  private responses: SuperagentMockResponse[] = [];
  private errors: SuperagentMockError[] = [];
  private calls: SuperagentCall[] = [];

  public mockResponseOnce(response: SuperagentMockResponse): SuperagentMock {
    this.responses.push(response);
    return this;
  }

  public once(response: SuperagentMockResponse): SuperagentMock {
    return this.mockResponseOnce(response);
  }

  public mockReject(error: SuperagentMockError): SuperagentMock {
    this.errors.push(error);
    return this;
  }

  public reset(): void {
    this.responses = [];
    this.errors = [];
    this.calls = [];
  }

  public getCalls(): SuperagentCall[] {
    return this.calls;
  }

  public toBeCalledWith(expected: Partial<SuperagentCall>): boolean {
    return this.calls.some((call) => {
      // Check URL
      if (expected.url && call.url !== expected.url) {
        return false;
      }

      // Check method
      if (
        expected.method &&
        call.method?.toLowerCase() !== expected.method.toLowerCase()
      ) {
        return false;
      }

      // Check data (deep comparison)
      if (expected.data !== undefined) {
        if (JSON.stringify(call.data) !== JSON.stringify(expected.data)) {
          return false;
        }
      }

      // Check headers (partial match)
      if (expected.headers) {
        const actualHeaders = call.headers || {};
        const expectedHeaders = expected.headers || {};
        for (const key in expectedHeaders) {
          if (expectedHeaders[key] !== actualHeaders[key]) {
            return false;
          }
        }
      }

      return true;
    });
  }

  private createMockResponse(response: SuperagentMockResponse): Response {
    const mockResponse = {
      body: (response as Response).body || (response as any).body || {},
      text:
        (response as Response).text ||
        (response as any).text ||
        JSON.stringify((response as any).body || {}),
      status:
        (response as Response).status ||
        (response as any).status ||
        (response as any).statusCode ||
        200,
      statusCode:
        (response as Response).statusCode ||
        (response as any).statusCode ||
        (response as any).status ||
        200,
      headers:
        (response as Response).headers || (response as any).headers || {},
      type:
        (response as Response).type ||
        (response as any).type ||
        "application/json",
      ok:
        (response as Response).ok !== undefined
          ? (response as Response).ok
          : ((response as any).status || (response as any).statusCode || 200) <
            400,
      // Add other Response properties as needed
      get: (name: string) => {
        const headers =
          (response as Response).headers || (response as any).headers || {};
        return headers[name.toLowerCase()] || null;
      },
      toJSON: () => ({
        body: (response as Response).body || (response as any).body,
        status:
          (response as Response).status ||
          (response as any).status ||
          (response as any).statusCode ||
          200,
        headers:
          (response as Response).headers || (response as any).headers || {},
      }),
    } as Response;

    return mockResponse;
  }

  private createMockRequest(method: string, url: string): Request {
    const call: SuperagentCall = {
      url,
      method: method.toLowerCase(),
      headers: {},
      data: undefined,
    };

    let callTracked = false;
    let promise: Promise<Response> | null = null;

    // Create a function that creates the promise lazily when awaited
    const getPromise = () => {
      if (!promise) {
        // Track the call only once when promise is actually created/awaited, capturing final state
        if (!callTracked) {
          this.calls.push({
            url: call.url,
            method: call.method,
            headers: { ...call.headers },
            data: call.data,
          });
          callTracked = true;
        }

        promise = new Promise<Response>((promiseResolve, promiseReject) => {
          // Handle errors
          if (this.errors.length > 0) {
            const error = this.errors.shift();
            if (error) {
              promiseReject(error);
              return;
            }
          }

          // Handle responses
          if (this.responses.length > 0) {
            const response = this.responses.shift();
            if (!response) {
              promiseReject(new Error("No response available"));
              return;
            }

            const mockResponse = this.createMockResponse(response);
            promiseResolve(mockResponse);
            return;
          }

          // Default response if no mock is set
          const defaultResponse = this.createMockResponse({
            body: {},
            status: 200,
            headers: {},
          });
          promiseResolve(defaultResponse);
        });
      }
      return promise;
    };

    const mockRequest = {
      url,
      method: method.toLowerCase(),
      headers: {} as Record<string, string>,
      data: undefined as unknown,

      set: (key: string | Record<string, string>, value?: string) => {
        if (typeof key === "string") {
          if (call.headers && value) {
            call.headers[key] = value;
            mockRequest.headers[key] = value;
          }
        } else {
          if (call.headers) {
            Object.assign(call.headers, key);
          }
          Object.assign(mockRequest.headers, key);
        }
        return mockRequest;
      },

      send: (data: unknown) => {
        call.data = data;
        mockRequest.data = data;
        return mockRequest;
      },

      query: (_params: Record<string, unknown>) => {
        // Handle query params if needed
        return mockRequest;
      },
    };

    // Create a Proxy to intercept then/catch and create promise lazily
    const thenableRequest = new Proxy(mockRequest, {
      get(target, prop) {
        if (prop === "then" || prop === "catch") {
          const promise = getPromise();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (promise as any)[prop].bind(promise);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (target as any)[prop];
      },
    }) as unknown as Request;

    return thenableRequest;
  }

  public get(url: string): Request {
    return this.createMockRequest("get", url);
  }

  public post(url: string): Request {
    return this.createMockRequest("post", url);
  }

  public put(url: string): Request {
    return this.createMockRequest("put", url);
  }

  public patch(url: string): Request {
    return this.createMockRequest("patch", url);
  }

  public delete(url: string): Request {
    return this.createMockRequest("delete", url);
  }

  public head(url: string): Request {
    return this.createMockRequest("head", url);
  }

  public options(url: string): Request {
    return this.createMockRequest("options", url);
  }

  public request(method: string, url: string): Request {
    return this.createMockRequest(method, url);
  }
}

// Create singleton instance
const superagentMock = new SuperagentMock();

// Create mock superagent function that supports superagent.get(), superagent.post(), etc.
const mockSuperagent = Object.assign(
  (method: string, url: string) => {
    return superagentMock.request(method, url);
  },
  {
    get: superagentMock.get.bind(superagentMock),
    post: superagentMock.post.bind(superagentMock),
    put: superagentMock.put.bind(superagentMock),
    delete: superagentMock.delete.bind(superagentMock),
    patch: superagentMock.patch.bind(superagentMock),
    head: superagentMock.head.bind(superagentMock),
    options: superagentMock.options.bind(superagentMock),
    request: superagentMock.request.bind(superagentMock),
  }
);

// Export utility methods
export const resetSuperagentMock = () => superagentMock.reset();
export const getSuperagentCalls = () => superagentMock.getCalls();
export const superagentMockToBeCalledWith = (
  expected: Partial<SuperagentCall>
) => superagentMock.toBeCalledWith(expected);

// Export the mock instance for chaining
export default superagentMock;
export { mockSuperagent };
