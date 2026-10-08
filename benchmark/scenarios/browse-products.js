import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { Counter, Rate } from 'k6/metrics';
import { baseUrl, json, params } from '../lib/config.js';
import { profileOptions } from '../lib/profiles.js';

const stores = new SharedArray(
  'stores',
  () => JSON.parse(open('../data/fixtures.json')).stores,
);
if (!stores.length) throw new Error('Run npm run benchmark:seed first.');
const success = new Rate('browse_success');
const completed = new Counter('browses_completed');
export const options = profileOptions('browse', 500);
options.thresholds.browse_success = ['rate>=0.99'];
options.thresholds['http_req_duration{name:GET product list}'] =
  options.thresholds['http_req_duration{scenario:browse}'];
options.thresholds['http_req_duration{name:GET product detail}'] =
  options.thresholds['http_req_duration{scenario:browse}'];
export default function () {
  const index = exec.scenario.iterationInTest;
  const store = stores[index % stores.length];
  const product = store.products[index % store.products.length];
  const list = http.get(
    `${baseUrl}/api/v1/stores/${store.slug}/products?limit=20`,
    params('GET product list'),
  );
  const listOk = check(list, {
    'product list populated': (r) =>
      r.status === 200 && json(r)?.data?.items?.length > 0,
  });
  const detail = http.get(
    `${baseUrl}/api/v1/stores/${store.slug}/products/${product.slug}`,
    params('GET product detail'),
  );
  const detailOk = check(detail, {
    'expected product returned': (r) =>
      r.status === 200 && json(r)?.data?.id === product.id,
  });
  success.add(listOk && detailOk);
  completed.add(listOk && detailOk ? 1 : 0);
}
