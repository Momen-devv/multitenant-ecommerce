# Logger

`LoggerModule` globally exports `LoggerService`, a Winston implementation of Nest's logger interface. Bootstrap installs it as the application logger.

## Usage

Inject `LoggerService` and provide the calling service name as context:

```ts
this.logger.log('Operation completed', MyService.name, { operationId });
this.logger.warn('Operation delayed', MyService.name, { operationId });
this.logger.error('Operation failed', error, MyService.name);
```

Request correlation IDs are read from the shared request context and added to records. Pass structured metadata to `log` or `warn`; pass an error or trace to `error`.

## Output

The minimum level is `info`. Development uses colored console output. Production uses JSON console output and rotating files under:

- `logs/application/`: application records, retained for 14 days.
- `logs/exceptions/`: uncaught exceptions, retained for 30 days.
- `logs/rejections/`: unhandled rejections, retained for 30 days.

Files include the process ID, rotate hourly or at 20 MB, and archive with compression. Ensure the production process can write to `logs/`. Rotation settings are defined in [logger.config.ts](logger.config.ts).
