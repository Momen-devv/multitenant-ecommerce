# AI

`AiModule` exports `AiService`, implemented by `TypeSafeAiService`. It wraps the TypeSafe SDK's `systemOne` operation as a typed `decide` method.

## Configuration

- `TYPESAFE_API_KEY`: required provider credential.
- `TYPESAFE_DEFAULT_MODEL`: defaults to `jev-latest` in environment validation.

The client provider reads the `typesafe` configuration namespace. The application currently validates these settings at startup even though `AiModule` is imported by its consuming feature rather than `InfrastructureModule`.

## Usage

Import `AiModule` in the consuming module and inject `AiService`. Pass a `SystemOneRequest<Q>` to `decide`; it returns `Promise<SystemOneResult<Q>>` with the question types preserved. `TYPESAFE_CLIENT` is the internal SDK injection token.

The adapter delegates directly to the SDK. Feature code owns request construction, result interpretation, business validation, and handling provider failures.
