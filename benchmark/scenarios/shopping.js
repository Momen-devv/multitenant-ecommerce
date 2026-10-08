import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { Counter, Rate } from 'k6/metrics';
import { baseUrl, json, params, positiveInteger } from '../lib/config.js';
import { profileOptions } from '../lib/profiles.js';
import { csrf, login } from '../lib/auth.js';

const users = new SharedArray(
  'shoppers',
  () => JSON.parse(open('../data/fixtures.json')).users,
);
const stores = new SharedArray(
  'shopping stores',
  () => JSON.parse(open('../data/fixtures.json')).stores,
);
const password = __ENV.SEED_PASSWORD || 'Benchmark-Only-Password-2026!';
const success = new Rate('shopping_success');
const placed = new Counter('orders_created');
export const options = profileOptions('shopping', 2000);
options.noCookiesReset = true;
options.thresholds.shopping_success = ['rate>=0.99'];
for (const name of ['PUT cart item', 'POST checkout quote', 'POST checkout']) {
  options.thresholds[`http_req_duration{name:${name}}`] =
    options.thresholds['http_req_duration{scenario:shopping}'];
}
let signedIn = false;
export function setup() {
  const required = positiveInteger(
    'VUS',
    (__ENV.PROFILE || 'smoke') === 'smoke' ? 1 : 100,
  );
  if (users.length < required)
    throw new Error(
      `Seed at least ${required} users (SEED_USERS). Each VU needs a separate shopper.`,
    );
  return {
    runId: `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`,
  };
}
export default function ({ runId }) {
  let ok = false;
  try {
    const user = users[exec.vu.idInTest - 1];
    let token;
    if (!signedIn) {
      token = login(user, password);
      signedIn = Boolean(token);
    } else token = csrf();
    if (!token) return;
    const store = stores[exec.scenario.iterationInTest % stores.length];
    const product =
      store.products[exec.scenario.iterationInTest % store.products.length];
    const browse = http.get(
      `${baseUrl}/api/v1/stores/${store.slug}/products/${product.slug}`,
      params('GET shopping product'),
    );
    if (
      !check(browse, {
        'shopping product found': (r) =>
          r.status === 200 && json(r)?.data?.id === product.id,
      })
    )
      return;
    const cartUrl = `${baseUrl}/api/v1/stores/${store.id}/cart`;
    const cart = http.get(cartUrl, params('GET cart'));
    const current = json(cart)?.data;
    if (
      !check(cart, {
        'cart readable': (r) =>
          r.status === 200 && Number.isSafeInteger(current?.version),
      })
    )
      return;
    const put = http.put(
      `${cartUrl}/items/${product.variantId}`,
      JSON.stringify({ quantity: 1, version: current.version }),
      params('PUT cart item', token),
    );
    const updated = json(put)?.data;
    if (
      !check(put, {
        'cart item saved': (r) =>
          r.status === 200 &&
          updated?.items?.some(
            (item) =>
              item.variantId === product.variantId && item.quantity === 1,
          ),
      })
    )
      return;
    const quote = http.post(
      `${cartUrl}/quote`,
      JSON.stringify({
        addressId: user.addressId,
        paymentMethod: 'cash_on_delivery',
        version: updated.version,
      }),
      params('POST checkout quote', token),
    );
    const quoteData = json(quote)?.data;
    if (
      !check(quote, {
        'checkout quote created': (r) =>
          r.status === 200 && typeof quoteData?.id === 'string',
      })
    )
      return;
    const hex =
      `${runId}${exec.scenario.iterationInTest.toString(16).padStart(12, '0')}`
        .padEnd(32, '0')
        .slice(-32);
    const key = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    const order = http.post(
      `${cartUrl}/checkout`,
      JSON.stringify({ quoteId: quoteData.id }),
      params('POST checkout', token, { 'Idempotency-Key': key }),
    );
    const result = json(order)?.data;
    ok = check(order, {
      'COD order placed': (r) =>
        [200, 201].includes(r.status) &&
        typeof result?.orderId === 'string' &&
        result?.order?.status === 'placed' &&
        result?.order?.paymentMethod === 'cash_on_delivery',
    });
  } finally {
    success.add(ok);
    placed.add(ok ? 1 : 0);
  }
}
