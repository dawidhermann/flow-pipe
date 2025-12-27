// node-fetch mock utility for Node.js test runner

import type { Response } from "node-fetch";

type NodeFetchMockResponse = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: HeadersInit;
  body?: string | Buffer | null;
  json?: () => Promise<any>;
  text?: () => Promise<string>;
  blob?: () => Promise<Blob>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

interface NodeFetchCall {
  url: string;
  options?: RequestInit;
}

class NodeFetchMock {
  private responses: NodeFetchMockResponse[] = [];
  private errors: Error[] = [];
  private calls: NodeFetchCall[] = [];

  public mockResponseOnce(response: NodeFetchMockResponse): NodeFetchMock {
    this.responses.push(response);
    return this;
  }

  public once(response: NodeFetchMockResponse): NodeFetchMock {
    return this.mockResponseOnce(response);
  }

  public mockReject(error: Error): NodeFetchMock {
    this.errors.push(error);
    return this;
  }

  public reset(): void {
    this.responses = [];
    this.errors = [];
    this.calls = [];
  }

  public getCalls(): NodeFetchCall[] {
    return this.calls;
  }

  public toBeCalledWith(
    url?: string,
    options?: RequestInit
  ): boolean {
    return this.calls.some((call) => {
      if (url && call.url !== url) {
        return false;
      }

      if (options) {
        // Check method
        if (options.method && call.options?.method?.toUpperCase() !== options.method.toUpperCase()) {
          return false;
        }

        // Check data/body (deep comparison)
        if (options.body !== undefined) {
          const callBody = call.options?.body;
          if (typeof options.body === "string" && typeof callBody === "string") {
            if (options.body !== callBody) {
              return false;
            }
          } else {
            // For objects, compare JSON strings
            const callBodyStr = typeof callBody === "string" ? callBody : JSON.stringify(callBody);
            const optionsBodyStr = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
            if (callBodyStr !== optionsBodyStr) {
              return false;
            }
          }
        }

        // Check headers (partial match)
        if (options.headers) {
          const callHeaders = call.options?.headers as Record<string, string> | undefined;
          const expectedHeaders = options.headers as Record<string, string>;
          if (!callHeaders) {
            return false;
          }
          for (const key in expectedHeaders) {
            const normalizedKey = key.toLowerCase();
            const callValue = Object.keys(callHeaders).find(
              (k) => k.toLowerCase() === normalizedKey
            );
            if (!callValue || callHeaders[callValue] !== expectedHeaders[key]) {
              return false;
            }
          }
        }
      }

      return true;
    });
  }

  public async fetch(url: string, options?: RequestInit): Promise<Response> {
    this.calls.push({ url, options });

    if (this.errors.length > 0) {
      const error = this.errors.shift();
      if (error) {
        throw error;
      }
    }

    if (this.responses.length > 0) {
      const response = this.responses.shift();
      if (!response) {
        throw new Error("No response available");
      }

      // Create a mock Response object
      const mockResponse = {
        ok: response.ok ?? (response.status ? response.status >= 200 && response.status < 300 : true),
        status: response.status ?? 200,
        statusText: response.statusText ?? "OK",
        headers: response.headers ?? new Headers(),
        body: response.body ?? null,
        json: response.json ?? (async () => {
          if (response.body && typeof response.body === "string") {
            try {
              return JSON.parse(response.body);
            } catch {
              throw new Error("Invalid JSON");
            }
          }
          return {};
        }),
        text: response.text ?? (async () => {
          if (response.body && typeof response.body === "string") {
            return response.body;
          }
          return "";
        }),
        blob: response.blob ?? (async () => new Blob()),
        arrayBuffer: response.arrayBuffer ?? (async () => new ArrayBuffer(0)),
      } as Response;

      return Promise.resolve(mockResponse);
    }

    // Default response if no mock is set
    const defaultResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      body: null,
      json: async () => ({}),
      text: async () => "",
      blob: async () => new Blob(),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response;

    return Promise.resolve(defaultResponse);
  }
}

// Create singleton instance
const nodeFetchMock = new NodeFetchMock();

// Export utility methods
export const resetNodeFetchMock = () => nodeFetchMock.reset();
export const getNodeFetchCalls = () => nodeFetchMock.getCalls();
export const nodeFetchMockToBeCalledWith = (
  url?: string,
  options?: RequestInit
) => nodeFetchMock.toBeCalledWith(url, options);

// Export the mock instance for chaining
export default nodeFetchMock;
export const mockNodeFetch = nodeFetchMock.fetch.bind(nodeFetchMock);

