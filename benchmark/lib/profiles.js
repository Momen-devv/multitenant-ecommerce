import { positiveInteger } from './config.js';

export function profileOptions(name, latencyMs) {
  const profile = __ENV.PROFILE || 'smoke';
  const vus = positiveInteger('VUS', profile === 'smoke' ? 1 : 100);
  const rate = positiveInteger('RATE', 10);
  const iterations = positiveInteger(
    'ITERATIONS',
    profile === 'smoke' ? 3 : 100,
  );
  let scenario;
  if (profile === 'smoke' || profile === 'volume') {
    scenario = {
      executor: 'shared-iterations',
      vus,
      iterations,
      maxDuration: __ENV.MAX_DURATION || '5m',
    };
  } else if (profile === 'load') {
    scenario = {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration: __ENV.DURATION || '3m',
      preAllocatedVUs: vus,
      maxVUs: vus,
    };
  } else if (profile === 'stress') {
    const duration = __ENV.STAGE_DURATION || '1m';
    const rampDuration = __ENV.RAMP_DURATION || '30s';
    scenario = {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: vus,
      maxVUs: vus,
      stages: [
        { duration: rampDuration, target: rate },
        { duration, target: rate },
        { duration: rampDuration, target: rate * 2 },
        { duration, target: rate * 2 },
        { duration: rampDuration, target: rate * 4 },
        { duration, target: rate * 4 },
        { duration: rampDuration, target: 1 },
        { duration, target: 1 },
      ],
    };
  } else throw new Error('PROFILE must be smoke, volume, load, or stress.');
  return {
    scenarios: { [name]: { ...scenario, gracefulStop: '30s' } },
    thresholds: {
      http_req_failed: ['rate<0.01'],
      checks: ['rate>=0.99'],
      [`http_req_duration{scenario:${name}}`]: [
        `p(95)<${positiveInteger('P95_MS', latencyMs)}`,
      ],
      ...(profile === 'smoke' || profile === 'volume'
        ? { iterations: [`count>=${iterations}`] }
        : { dropped_iterations: ['count==0'] }),
    },
  };
}
