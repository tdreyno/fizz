---
"@tdreyno/fizz": minor
---

`startFrame()` previously started a continuous animation-frame loop that kept firing until explicitly cancelled. It now fires **once** and stops automatically. This aligns the naming with its literal meaning.

### Migration

If you want a continuous loop (the old behavior), replace `startFrame()` with the new `startFrameLoop()`:

```ts
// Before — continuous loop
Enter: (_, __, { startFrame }) => startFrame()

// After — still continuous loop
Enter: (_, __, { startFrameLoop }) => startFrameLoop()

// After — new one-shot usage (fires OnFrame exactly once)
Enter: (_, __, { startFrame }) => startFrame()
```

`cancelFrame()` and the `OnFrame` action type are unchanged and work with both.

## New: `startFrameLoop()` for continuous animation

Use `startFrameLoop()` whenever you need a frame callback to re-fire automatically on every animation frame until explicitly cancelled:

```ts
const Animating = state<Enter | OnFrame, { frameCount: number }>({
  Enter: (_, __, { startFrameLoop }) => startFrameLoop(),

  OnFrame: (data, _, { update, cancelFrame }) => {
    const next = { frameCount: data.frameCount + 1 }
    return next.frameCount >= 60 ? [update(next), cancelFrame()] : update(next)
  },
})
```

## New: `dom.mutate(fn)` for imperative DOM writes

Use `dom.mutate(fn)` from `@tdreyno/fizz/browser` to perform imperative DOM writes as an explicit effect. The callback is called synchronously when the effect is processed, and like all browser effects it is scoped to the current state and cleaned up on transitions:

```ts
import { dom } from "@tdreyno/fizz/browser"

const Scrolling = state<Enter>({
  Enter: () => dom.mutate(() => {
    document.documentElement.scrollTop = 0
  }),
})
```
