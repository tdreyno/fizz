# Output Actions

Use this reference when a task involves machine-to-adapter communication through Fizz outputs.

## What Outputs Are For

Use outputs for integration boundaries:

- editor adapters
- host application bridges
- non-machine side coordination that should stay explicit

Do not use outputs as a replacement for internal state transitions.

## Machine-Level Output Maps

`createMachine(...)` accepts:

- `outputActions`
- `outputs` (alias)

Do not define both in one machine definition.

When modeling command channels, prefer `defineOutputMap(...)` to keep channel/type/payload inference centralized.

## Emission APIs

### `output(action)`

Use for standard emitted actions.

### `outputCommand(channel, type, payload)`

Use for adapter command channels. This is direct-use in state handlers.

Do not wrap with `output(...)`.

Map-aware overload:

- `outputCommand(outputsMap, channel, type, payload)`

This variant infers payload shape from the map entry.

### `effectBatch(...).chainToOutput(...)`

Use this when multiple imperative commands must run in order and then emit one success/failure output signal.

- Batch entries should be `commandEffect(...)` calls.
- `channel` is optional; when set, same-channel batches are serialized.
- `onError` defaults to `"failBatch"`.
- Prefer `chainToAction(...)` instead when completion/failure should change machine state directly.

## Runtime Subscription APIs

Use based on intent:

- `onOutput(...)`: observe all outputs
- `onOutputType(type, handler)`: observe one output type
- `respondToOutput(type, handler)`: observe and optionally dispatch follow-up internal actions
- `connectOutputChannel(channelHandlers)`: bind nested channel/type payload handlers for command-style outputs

All return unsubscribe callbacks.

## Channel Connector Guidance

`connectOutputChannel(...)` expects command-style output types in `channel.type` format.

Routing behavior:

- unknown channel/type handlers are ignored
- matching handlers receive payload only

Use this as adapter wiring convenience, not as a replacement for machine transitions.

## Fluent API Parity

Fluent machine builders support:

- `.withOutputActions(...)`
- `.withOutputs(...)` (alias)

Keep one style per machine definition for readability.

## Related Docs

- `docs/output-actions.md`
- `docs/testing.md`
- `docs/fluent-api.md`
