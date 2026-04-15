# Fizz

[![npm latest version](https://img.shields.io/npm/v/@tdreyno/fizz/latest.svg)](https://www.npmjs.com/package/@tdreyno/fizz)

Fizz is a small library for building state machines that can effectively manage complex sequences of events. [Learn more about state machines (and charts).](https://statecharts.github.io)

## Install

```bash
npm install --save @tdreyno/fizz
```

Start with the main docs [Getting Started](../../docs/getting-started.md) page for a minimal setup and runtime demo.

## Let's play pong

This example shows how we would model something like a game of Pong.

```typescript
import {
  state,
  action,
  ActionCreatorType,
  onFrame,
  OnFrame,
  Enter,
} from "@tdreyno/fizz"

export const start = action("Start")
export type Start = ActionCreatorType<typeof start>

export const onPaddleInput = action("OnPaddleInput")
export type OnPaddleInput = ActionCreatorType<typeof onPaddleInput>

type Data = {
  ballPosition: [x: number, y: number]
  ballVector: [x: number, y: number]
  leftPaddle: number
  rightPaddle: number
}

const Welcome = state<Start, Data>({
  Start: () =>
    Playing({
      ballPosition: [0, 0],
      ballVector: [1, 1],
      leftPaddle: 0,
      rightPaddle: 0,
    }),
})

const Playing = state<Enter | OnPaddleInput | OnFrame, Data>({
  Enter: onFrame,

  OnPaddleInput: (data, { whichPaddle, direction }, { update }) => {
    data[whichPaddle] = data[whichPaddle] + direction

    return update(data)
  },

  OnFrame: (data, _, { update }) => {
    // Handle bouncing off things.
    if (doesIntersectPaddle(data) || doesTopOrBottom(data)) {
      data.ballVector = [data.ballVector[0] * -1, data.ballVector[1] * -1]

      return [update(data), onFrame()]
    }

    // Handle scoring
    if (isOffscreen(data)) {
      return Victory(ballPosition < 0 ? "Left" : "Right")
    }

    // Otherwise run physics
    data.ballPosition = [
      data.ballPosition[0] + data.ballVector[0],
      data.ballPosition[1] + data.ballVector[1],
    ]

    return [update(data), onFrame()]
  },
})

const Victory = state<Enter, string>({
  Enter: winner => log(`Winner is ${winner}`),
})
```

`onFrame` is an action that is called via `requestAnimationFrame`. Assume `doesIntersectPaddle`, `doesTopOrBottom` and `isOffscreen` are doing bounding boxes checks.

Our renderer can now check the current state each frame and decide whether to render the Welcome screen, the Victory screen or the game of Pong.
