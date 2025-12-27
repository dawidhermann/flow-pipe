import { RequestAdapter } from "@flow-pipe/core";
import type { IRequestConfig } from "@flow-pipe/core";
import superagent, { type Response, type Request } from "superagent";

export type SuperagentRequestConfig = IRequestConfig & {};

export default class SuperagentRequestAdapter extends RequestAdapter<
  Response,
  SuperagentRequestConfig
> {
  public async createRequest(
    requestConfig: SuperagentRequestConfig
  ): Promise<Response> {
    const { url, method, data, headers, ...rest } = requestConfig;

    // Create the request based on method
    let request: Request;
    const methodLower = method.toLowerCase();

    switch (methodLower) {
      case "get":
        request = superagent.get(url);
        break;
      case "post":
        request = superagent.post(url);
        break;
      case "put":
        request = superagent.put(url);
        break;
      case "patch":
        request = superagent.patch(url);
        break;
      case "delete":
        request = superagent.delete(url);
        break;
      case "head":
        request = superagent.head(url);
        break;
      case "options":
        request = superagent.options(url);
        break;
      default:
        request = superagent(methodLower, url);
    }

    // Set headers if provided
    if (headers) {
      request.set(headers as Record<string, string>);
    }

    // Set data/body if provided
    if (data !== undefined) {
      request.send(data);
    }

    // Apply any additional superagent-specific options from rest
    // Note: superagent doesn't have a direct way to pass all options,
    // but common ones can be handled individually if needed

    return request;
  }
}

