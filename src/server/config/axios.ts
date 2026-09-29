import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { UpstreamApiError } from "../api/errors";
import { environment } from "./environment";

const { dashApi } = environment;

// Create a custom instance of axios
export const axiosInstance = axios.create({ baseURL: dashApi.baseUrl });
axiosInstance.defaults.headers.common.Authorization = dashApi.apiKey;

// The signal is created per request: one set on the instance defaults would expire once and then
// cancel every later call. It is a total deadline covering connect, headers and body, unlike axios's
// timeout option, which only fires on socket inactivity and so never stops a slow trickle of bytes.
axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    config.signal = AbortSignal.timeout(dashApi.timeoutMs);
    return config;
});

function toUpstreamApiError(error: unknown): UpstreamApiError {
    // The request interceptor replaces config.signal on every call, so the per-request deadline is the
    // only abort source for DASH requests, and axios turns that abort into a CanceledError.
    if (axios.isCancel(error)) {
        return new UpstreamApiError(`DASH API request timed out after ${dashApi.timeoutMs}ms`);
    }
    // Only the message may leave: axios errors carry config.headers.Authorization, which is
    // DASH_API_KEY, so the error object is never passed on, attached or spread (T-11-01).
    const message = error instanceof Error ? error.message : "Unknown error";
    return new UpstreamApiError(`DASH API request failed: ${message}`);
}

axiosInstance.interceptors.response.use(
    (response: AxiosResponse): AxiosResponse => response,
    (error: unknown): Promise<never> => Promise.reject(toUpstreamApiError(error)),
);
