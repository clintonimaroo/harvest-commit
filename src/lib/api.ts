export class ApiRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const token = sessionStorage.getItem("harvest-access-token");
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({
    error: "Start the Harvest Commit server to use messaging.",
  }));
  if (!response.ok)
    throw new ApiRequestError(
      response.status,
      result.error || "The request could not be completed.",
    );
  return result as T;
}
