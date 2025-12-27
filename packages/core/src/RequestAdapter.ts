import type { IRequestConfig } from "./models/RequestParams";
import { validateUrl, type UrlValidationOptions } from "./utils/urlValidator";

export default abstract class RequestAdapter<
  ExecutionResult,
  RequestConfig extends IRequestConfig = IRequestConfig,
> {
  protected urlValidationOptions: UrlValidationOptions;

  constructor(urlValidationOptions: UrlValidationOptions = {}) {
    this.urlValidationOptions = urlValidationOptions;
  }

  public abstract createRequest(
    requestConfig: RequestConfig
  ): Promise<ExecutionResult>;

  public getResult<T extends ExecutionResult>(result: ExecutionResult): T {
    return result as T;
  }

  public executeRequest(
    requestConfig: RequestConfig
  ): Promise<ExecutionResult> {
    // Validate URL to prevent SSRF attacks
    validateUrl(requestConfig.url, this.urlValidationOptions);
    return this.createRequest(requestConfig);
  }
}
