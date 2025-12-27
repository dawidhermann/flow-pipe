// Axios mock utility for Node.js test runner

import type { AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";

type AxiosMockResponse<T = any> = AxiosResponse<T> | { data: T; status: number; statusText: string; headers: Record<string, string>; config: AxiosRequestConfig };
type AxiosMockError = AxiosError | Error;

interface AxiosCall {
  url?: string;
  config?: AxiosRequestConfig;
}

class AxiosMock {
  private responses: AxiosMockResponse[] = [];
  private errors: AxiosMockError[] = [];
  private calls: AxiosCall[] = [];

  public mockResponseOnce<T = any>(response: AxiosMockResponse<T>): AxiosMock {
    this.responses.push(response);
    return this;
  }

  public once<T = any>(response: AxiosMockResponse<T>): AxiosMock {
    return this.mockResponseOnce(response);
  }

  public mockReject(error: AxiosMockError): AxiosMock {
    this.errors.push(error);
    return this;
  }

  public reset(): void {
    this.responses = [];
    this.errors = [];
    this.calls = [];
  }

  public getCalls(): AxiosCall[] {
    return this.calls;
  }

  public toBeCalledWith(
    urlOrConfig?: string | AxiosRequestConfig,
    config?: AxiosRequestConfig
  ): boolean {
    return this.calls.some((call) => {
      // Handle different call patterns: axios(url) or axios(config)
      let callUrl: string | undefined;
      let callConfig: AxiosRequestConfig | undefined;

      if (call.url) {
        callUrl = call.url;
        callConfig = call.config;
      } else if (call.config) {
        callUrl = call.config.url;
        callConfig = call.config;
      }

      // Check URL
      if (typeof urlOrConfig === "string") {
        if (callUrl !== urlOrConfig) {
          return false;
        }
        // Check config if provided
        if (config) {
          return this.matchConfig(callConfig, config);
        }
        return true;
      } else if (urlOrConfig && typeof urlOrConfig === "object") {
        // urlOrConfig is actually a config object
        return this.matchConfig(callConfig, urlOrConfig);
      } else if (config) {
        return this.matchConfig(callConfig, config);
      }

      return true;
    });
  }

  private matchConfig(
    actual?: AxiosRequestConfig,
    expected?: AxiosRequestConfig
  ): boolean {
    if (!actual || !expected) {
      return !actual && !expected;
    }

    // Check URL
    if (expected.url && actual.url !== expected.url) {
      return false;
    }

    // Check method
    if (expected.method && actual.method?.toLowerCase() !== expected.method.toLowerCase()) {
      return false;
    }

    // Check data (deep comparison)
    if (expected.data !== undefined) {
      if (JSON.stringify(actual.data) !== JSON.stringify(expected.data)) {
        return false;
      }
    }

    // Check headers (partial match)
    if (expected.headers) {
      const actualHeaders = actual.headers || {};
      const expectedHeaders = expected.headers || {};
      for (const key in expectedHeaders) {
        if (expectedHeaders[key] !== actualHeaders[key]) {
          return false;
        }
      }
    }

    return true;
  }

  public async request<T = any>(
    config: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    this.calls.push({ config });

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
      
      // Ensure response has all required AxiosResponse properties
      const axiosResponse: AxiosResponse<T> = {
        data: (response as AxiosResponse<T>).data || (response as any).data || ({} as T),
        status: (response as AxiosResponse<T>).status || (response as any).status || 200,
        statusText: (response as AxiosResponse<T>).statusText || (response as any).statusText || "OK",
        headers: (response as AxiosResponse<T>).headers || (response as any).headers || {},
        config: (response as AxiosResponse<T>).config || config,
      };
      
      return Promise.resolve(axiosResponse);
    }

    // Default response if no mock is set
    return Promise.resolve({
      data: {} as T,
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    });
  }

  // Support axios(url, config) pattern
  public async get<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, url, method: "GET" });
  }

  public async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, url, method: "POST", data });
  }

  public async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, url, method: "PUT", data });
  }

  public async delete<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, url, method: "DELETE" });
  }

  public async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, url, method: "PATCH", data });
  }

  public async head<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, url, method: "HEAD" });
  }

  public async options<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, url, method: "OPTIONS" });
  }
}

// Create singleton instance
const axiosMock = new AxiosMock();

// Create mock axios function that supports both axios(config) and axios(url, config)
const mockAxios = Object.assign(
  (urlOrConfig?: string | AxiosRequestConfig, config?: AxiosRequestConfig) => {
    if (typeof urlOrConfig === "string") {
      return axiosMock.request({ ...config, url: urlOrConfig });
    } else if (urlOrConfig) {
      return axiosMock.request(urlOrConfig);
    } else {
      return axiosMock.request(config || {});
    }
  },
  {
    get: axiosMock.get.bind(axiosMock),
    post: axiosMock.post.bind(axiosMock),
    put: axiosMock.put.bind(axiosMock),
    delete: axiosMock.delete.bind(axiosMock),
    patch: axiosMock.patch.bind(axiosMock),
    head: axiosMock.head.bind(axiosMock),
    options: axiosMock.options.bind(axiosMock),
    request: axiosMock.request.bind(axiosMock),
  }
);

// Export utility methods
export const resetAxiosMock = () => axiosMock.reset();
export const getAxiosCalls = () => axiosMock.getCalls();
export const axiosMockToBeCalledWith = (
  urlOrConfig?: string | AxiosRequestConfig,
  config?: AxiosRequestConfig
) => axiosMock.toBeCalledWith(urlOrConfig, config);

// Export the mock instance for chaining
export default axiosMock;
export { mockAxios };

