import { RequestAdapter } from "@flow-pipe/core";
import type { IRequestConfig } from "@flow-pipe/core";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

export type AxiosRequestConfigType = IRequestConfig & Partial<AxiosRequestConfig>;

export default class AxiosRequestAdapter extends RequestAdapter<
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

    return axios(axiosConfig);
  }
}

