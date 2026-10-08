import http from 'k6/http';
import { check } from 'k6';
import { baseUrl, json, params } from './config.js';

export function csrf() {
  const response = http.get(`${baseUrl}/api/csrf-token`, params('GET CSRF'));
  const token = json(response)?.csrfToken;
  return check(response, {
    'CSRF available': (r) =>
      r.status === 200 && typeof token === 'string' && token.length > 0,
  })
    ? token
    : null;
}
export function login(user, password) {
  const token = csrf();
  if (!token) return null;
  const response = http.post(
    `${baseUrl}/api/v1/auth/sign-in`,
    JSON.stringify({ email: user.email, password }),
    params('POST login', token),
  );
  if (
    !check(response, {
      'login succeeded': (r) =>
        r.status === 200 && json(r)?.user?.id === user.id,
    })
  )
    return null;
  // CSRF is bound to the session identifier: refresh after login.
  return csrf();
}
