---
"@tdreyno/fizz": minor
---

# Output Ergonomics

Improve output ergonomics for adapter-oriented command channels.

- Add `outputs` as a machine-definition alias for `outputActions`.
- Reject machine definitions that include both `outputs` and `outputActions`.
- Add `outputCommand(channel, type, payload)` as a direct state-handler helper (no extra `output(...)` wrapper needed).
- Add `defineOutputMap(...)` for typed output map authoring.
- Add runtime helpers `onOutputType(type, handler)` and `connectOutputChannel(channelHandlers)` for concise, typed output subscriptions.
- Add fluent builder parity with `.withOutputs(...)` as an alias to output action registration.
