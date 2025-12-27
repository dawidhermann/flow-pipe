import { RequestAdapter } from "@flow-pipe/core";
import type { IRequestConfig } from "@flow-pipe/core";
import type { Response } from "superagent";
import { mockSuperagent } from "./superagentMock";
import type { SuperagentRequestConfig } from "../../SuperagentRequestAdapter";

export default class TestSuperagentAdapter extends RequestAdapter<
  Response,
  SuperagentRequestConfig
> {
  public async createRequest(
    requestConfig: SuperagentRequestConfig
  ): Promise<Response> {
    const { url, method, data, headers } = requestConfig;

    // Create the request based on method
    let request: any;
    const methodLower = method.toLowerCase();

    switch (methodLower) {
      case "get":
        request = mockSuperagent.get(url);
        break;
      case "post":
        request = mockSuperagent.post(url);
        break;
      case "put":
        request = mockSuperagent.put(url);
        break;
      case "patch":
        request = mockSuperagent.patch(url);
        break;
      case "delete":
        request = mockSuperagent.delete(url);
        break;
      case "head":
        request = mockSuperagent.head(url);
        break;
      case "options":
        request = mockSuperagent.options(url);
        break;
      default:
        request = mockSuperagent(methodLower, url);
    }

    // Set headers if provided
    if (headers) {
      request.set(headers as Record<string, string>);
    }

    // Set data/body if provided
    if (data !== undefined) {
      request.send(data);
    }

    return request;
  }
}

