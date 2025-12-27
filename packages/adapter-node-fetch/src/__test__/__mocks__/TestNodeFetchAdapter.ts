import { RequestAdapter } from "@flow-pipe/core";
import type { IRequestConfig } from "@flow-pipe/core";
import type { Response } from "node-fetch";
import { mockNodeFetch } from "./nodeFetchMock";
import type { NodeFetchRequestConfig } from "../../NodeFetchRequestAdapter";

export default class TestNodeFetchAdapter extends RequestAdapter<
  Response,
  NodeFetchRequestConfig
> {
  public async createRequest(
    requestConfig: NodeFetchRequestConfig
  ): Promise<Response> {
    const { data, url, method, headers, ...rest } = requestConfig;
    const fetchConfig: RequestInit = {
      method,
      ...rest,
    };

    // Handle headers - merge with existing headers if any
    const headersObj: Record<string, string> = headers
      ? { ...(headers as Record<string, string>) }
      : {};

    // Handle request body
    if (data !== undefined) {
      if (data === null) {
        fetchConfig.body = JSON.stringify(null);
        // Set Content-Type header if not already set
        if (
          !headersObj["Content-Type"] &&
          !headersObj["content-type"]
        ) {
          headersObj["Content-Type"] = "application/json";
        }
      } else if (typeof data === "string") {
        fetchConfig.body = data;
      } else if (data instanceof Buffer || data instanceof Uint8Array) {
        fetchConfig.body = data;
      } else {
        fetchConfig.body = JSON.stringify(data);
        // Set Content-Type header if not already set
        if (
          !headersObj["Content-Type"] &&
          !headersObj["content-type"]
        ) {
          headersObj["Content-Type"] = "application/json";
        }
      }
    }

    // Set headers if we have any
    if (Object.keys(headersObj).length > 0) {
      fetchConfig.headers = headersObj;
    }

    return mockNodeFetch(url, fetchConfig);
  }
}

