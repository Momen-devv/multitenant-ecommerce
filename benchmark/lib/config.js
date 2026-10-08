export const baseUrl = (__ENV.BASE_URL || 'http://localhost:3000').replace(
  /\/+$/,
  '',
);
if (!/^https?:\/\/[^/]+$/.test(baseUrl))
  throw new Error('BASE_URL must be an HTTP(S) origin.');
export const origin = __ENV.ORIGIN || baseUrl;
export function positiveInteger(name, fallback) {
  const value = Number(__ENV[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer.`);
  return value;
}
export function json(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}
export function params(name, csrfToken, extraHeaders = {}) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...extraHeaders,
    },
    tags: { name },
    redirects: 0,
    timeout: '30s',
  };
}
