import { RequestAdapter } from "@flow-pipe/core";
import type { IRequestConfig, UrlValidationOptions } from "@flow-pipe/core";
import superagent, { type Response, type Request } from "superagent";

export type SuperagentRequestConfig = IRequestConfig & {};

export default class SuperagentRequestAdapter extends RequestAdapter<
  Response,
  SuperagentRequestConfig
> {
  constructor(urlValidationOptions?: UrlValidationOptions) {
    super(urlValidationOptions);
  }

  public async createRequest(
    requestConfig: SuperagentRequestConfig
  ): Promise<Response> {
    const { url, method, data, headers } = requestConfig;

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

    return request;
  }
}

