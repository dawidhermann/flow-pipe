import { RequestAdapter } from "@request-orchestrator/core";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { mockAxios } from "./axios-mock";
import type { AxiosRequestConfigType } from "../../axios-request-adapter";

export default class TestAxiosAdapter extends RequestAdapter<
  AxiosResponse,
  AxiosRequestConfigType
> {
  public async createRequest(
    requestConfig: AxiosRequestConfigType
  ): Promise<AxiosResponse> {
    const { url, method, data, ...rest } = requestConfig;

    const axiosConfig: AxiosRequestConfig = {
      url,
      method: method.toLowerCase() as AxiosRequestConfig["method"],
      data,
      ...rest,
    };

    return mockAxios(axiosConfig);
  }
}
