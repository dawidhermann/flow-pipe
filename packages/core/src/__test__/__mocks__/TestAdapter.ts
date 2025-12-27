import { RequestAdapter } from "../../index";
import type { IRequestConfig, UrlValidationOptions } from "../../index";

export type TestResponse = Response & {
  customParam: string;
};

export default class TestAdapter extends RequestAdapter<
  Response,
  IRequestConfig
> {
  constructor(urlValidationOptions?: UrlValidationOptions) {
    super(urlValidationOptions);
  }

  public async createRequest(requestConfig: IRequestConfig): Promise<Response> {
    const { data, url, ...rest } = requestConfig;
    const fetchConfig: any = { ...rest };
    if (data) {
      fetchConfig.data = JSON.stringify(data);
    }
    const result = await fetch(url, { ...fetchConfig, testParam: "test" });
    return result;
  }

  public getResult<T extends Response>(result: Response): T {
    (result as any).customParam = "testParam";
    return result as T;
  }
}
