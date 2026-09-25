import 'dotenv/config';
import autocannon from 'autocannon';

const args = process.argv.slice(2);

const baseUrl = process.env.BASE_URL;
const endpoint = args[0];
const connections = Number(args[1]) || 1000;

if (!baseUrl) {
  throw new Error('BASE_URL must be set before running the benchmark.');
}

if (!endpoint) {
  throw new Error('Endpoint must be provided as a command-line argument.');
}

async function runAutocannon(): Promise<void> {
  const url = `${process.env.BASE_URL}/api/${endpoint}`;

  console.log(
    `Running autocannon benchmark on ${url} with ${connections} connections...`,
  );

  const result = await autocannon({
    url,
    connections,
    duration: 10,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  console.log(
    autocannon.printResult(result, {
      renderLatencyTable: true,
    }),
  );
  console.log(result);
}

runAutocannon().catch((error) => {
  console.error(error);
  process.exit(1);
});
