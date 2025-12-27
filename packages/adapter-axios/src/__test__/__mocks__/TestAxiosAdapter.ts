import { RequestAdapter } from "@flow-pipe/core";
import type { IRequestConfig } from "@flow-pipe/core";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { mockAxios } from "./axiosMock";
import type { AxiosRequestConfigType } from "../../AxiosRequestAdapter";

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

