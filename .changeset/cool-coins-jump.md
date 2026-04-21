---
"@tdreyno/fizz": minor
---

Add `customJSONAsync(...)` for app client-layer JSON flows.

This introduces a JSON builder for client callbacks that already return parsed payloads, with support for `validate(...)`, `chainToAction(...)`, and optional `asyncId` cancellation, plus docs and examples for Apollo and OpenAPI usage.
