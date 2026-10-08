import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';

import { baseUrl, origin } from '../lib/config.js';
import { profileOptions } from '../lib/profiles.js';
const password = __ENV.SIGNUP_PASSWORD || 'Benchmark-Only-Password-2026!';
const signupSuccess = new Rate('signup_success');
const created = new Counter('accounts_created');
const throttled = new Counter('signup_throttled');

export const options = profileOptions('signup', 2000);
options.thresholds.signup_success = ['rate>=0.99'];
options.thresholds['http_req_duration{name:POST /api/v1/auth/sign-up}'] =
  options.thresholds['http_req_duration{scenario:signup}'];

export function setup() {
  // setup runs once: all VUs share a run prefix, with distinct iteration IDs.
  const runId = `bench-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  console.log(`Signup run: ${runId}; profile=${__ENV.PROFILE || 'smoke'}`);
  return { runId };
}

export default function ({ runId }) {
  const email = `${runId}-${exec.scenario.iterationInTest}@example.com`;
  // Start each attempt as a fresh anonymous client and preserve the CSRF cookie.
  http.cookieJar().clear(baseUrl);
  const csrfResponse = http.get(`${baseUrl}/api/csrf-token`, {
    tags: { name: 'GET /api/csrf-token' },
    redirects: 0,
    timeout: '30s',
  });
  let csrfToken;
  try {
    csrfToken = csrfResponse.json('csrfToken');
  } catch {
    csrfToken = null;
  }
  if (
    !check(csrfResponse, {
      'CSRF token is available': (res) =>
        res.status === 200 &&
        typeof csrfToken === 'string' &&
        csrfToken.length > 0,
    })
  ) {
    signupSuccess.add(false);
    created.add(0);
    throttled.add(csrfResponse.status === 429 ? 1 : 0);
    return;
  }
  const response = http.post(
    `${baseUrl}/api/v1/auth/sign-up`,
    JSON.stringify({ name: 'Benchmark User', email, password }),
    {
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        'X-CSRF-Token': csrfToken,
      },
      tags: { name: 'POST /api/v1/auth/sign-up' },
      redirects: 0,
      timeout: '30s',
    },
  );
  let body;
  try {
    body = response.json();
  } catch {
    body = null;
  }
  const success = check(response, {
    'signup returns 200 or 201': (res) => [200, 201].includes(res.status),
    'signup returns the created user': () =>
      typeof body?.user?.id === 'string' && body.user.email === email,
  });
  signupSuccess.add(success);
  created.add(success ? 1 : 0);
  throttled.add(response.status === 429 ? 1 : 0);
}
