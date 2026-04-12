import axios, { AxiosRequestConfig } from "axios";

export interface RetryOptions<T> {
  request: AxiosRequestConfig<T>;
  retries?: number;
  timeoutMs?: number;
  onRetry?: (attempt: number, error: unknown) => Promise<void> | void;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestWithRetry<TResponse = unknown, TBody = unknown>({
  request,
  retries = 3,
  timeoutMs = 12000,
  onRetry
}: RetryOptions<TBody>) {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await axios<TResponse>({
        timeout: timeoutMs,
        validateStatus: () => true,
        ...request
      });
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        throw error;
      }

      attempt += 1;
      if (onRetry) {
        await onRetry(attempt, error);
      }
      await wait(250 * 2 ** attempt);
    }
  }

  throw lastError;
}
