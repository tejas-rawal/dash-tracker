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
// A caller's own signal is combined with the deadline rather than replaced by it, so cancelling still works.
axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const deadline = AbortSignal.timeout(dashApi.timeoutMs);
    config.signal = config.signal ? AbortSignal.any([config.signal as AbortSignal, deadline]) : deadline;
    return config;
});

// AbortSignal.timeout aborts with a TimeoutError, so a deadline abort can be told apart from a caller cancelling.
function isDeadlineAbort(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
        return false;
    }
    const reason: unknown = (error.config?.signal as AbortSignal | undefined)?.reason;
    return reason instanceof DOMException && reason.name === "TimeoutError";
}

function toUpstreamApiError(error: unknown): UpstreamApiError {
    // axios turns any abort of config.signal into a CanceledError, whether the deadline or the caller fired it.
    if (axios.isCancel(error)) {
        return isDeadlineAbort(error)
            ? new UpstreamApiError(`DASH API request timed out after ${dashApi.timeoutMs}ms`)
            : new UpstreamApiError("DASH API request was canceled");
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
