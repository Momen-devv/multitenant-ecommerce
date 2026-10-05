# Running with PM2

PM2 runs compiled JavaScript directly. `start:prod` remains available for running
one standalone process without PM2.

```sh
npm ci
npm run build
npm run pm2:start
npm run pm2:status
npm run pm2:logs
```

Configure the required application secrets in the server environment or `.env`
before starting. PM2 sets `NODE_ENV=production` and each process's role.

`ecosystem.config.cjs` starts four API processes sharing port 3000 and one scheduler
process without an HTTP listener. The API role disables Nest cron jobs, intervals,
and timeouts. The scheduler runs those tasks. Without a role, normal development
and `start:prod` retain the existing combined API and scheduler behavior.

The scheduler currently reuses `AppModule`; BullMQ consumers remain active in all
processes, with Redis coordinating job claims. This is not a full separation of
API and queue modules. Production application log filenames include the process
ID so processes do not rotate the same file.

After deploying updated code:

```sh
npm run build
npm run pm2:reload
```

This reloads the API cluster and restarts the single scheduler. Startup readiness
is reported after Nest initializes; the shutdown timeout is 30 seconds. Long-lived
notification streams reconnect during reloads. Tune timeouts and the 512 MB memory
restart threshold for the actual workload.

Adjust API `instances` in the ecosystem file to match your server. Each process
has its own PostgreSQL pool of up to 10 connections: the default five processes
can use up to 50 connections, with extra capacity needed during API reloads.
Keep the scheduler at one instance on one server; multiple servers need distributed
coordination for scheduled work. Run database migrations once per deployment.

To stop only this application's processes:

```sh
npm run pm2:stop
```

On a Linux production server, persist the desired process list and configure
startup using the same account that runs the app:

```sh
npx pm2 save
npx pm2 startup
```

Follow the command printed by `startup`, then run `npx pm2 save` again. Startup
integration depends on the host operating system; these steps target Linux.

Reference: https://pm2.keymetrics.io/docs/usage/application-declaration/
