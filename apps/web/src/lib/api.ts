const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchApi<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || `HTTP ${response.status}`;
    let code: string | undefined;
    try {
      const body = JSON.parse(text) as { detail?: string; title?: string; code?: string };
      message = body.detail || body.title || message;
      code = body.code;
    } catch {
      // Response wasn't JSON; fall back to the raw text.
    }
    throw new ApiError(response.status, message, code);
  }

  return response.json();
}
