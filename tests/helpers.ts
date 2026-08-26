/**
 * Builds the full args object expected by React Router v7 loaders/actions.
 * Includes `url` and `pattern` which are required by ActionFunctionArgs / LoaderFunctionArgs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeArgs(
  method: string,
  path: string,
  body?: object,
  headers?: Record<string, string>,
  params?: Record<string, string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const fullUrl = `http://localhost${path}`;
  const request = new Request(fullUrl, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return {
    request,
    params: params ?? {},
    context: {},
    url: new URL(fullUrl),
    pattern: { id: "test", path },
  };
}

/**
 * @deprecated Use makeArgs instead
 */
export function makeRequest(
  method: string,
  url: string,
  body?: object,
  headers?: Record<string, string>
): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ctx = {} as any;
