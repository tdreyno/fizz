import { describe, expect, test } from "@jest/globals"

import { action } from "../action.js"
import {
  cancelAsync,
  cancelFrame,
  cancelInterval,
  cancelTimer,
  goBack,
  output,
  restartInterval,
  restartTimer,
  startAsync,
  startFrame,
  startFrameLoop,
  startInterval,
  startTimer,
} from "../effect.js"
import {
  createEffectHandlerRegistry,
  dispatchEffect,
  registerEffectHandlers,
} from "../runtime/effectDispatcher.js"

describe("effect dispatcher", () => {
  test("creates an empty registry when no handlers are provided", () => {
    const registry = createEffectHandlerRegistry<never, never>({})

    expect(registry.size).toBe(0)
    expect([...registry.keys()]).toEqual([])
  })

  test("creates handlers for all supported effect labels", () => {
    const notice = action("Notice").withPayload<string>()
    const loaded = action("Loaded").withPayload<string>()
    const outputs: Array<ReturnType<typeof notice>> = []
    const registry = createEffectHandlerRegistry<
      string,
      ReturnType<typeof notice>
    >({
      emitOutput: action => {
        outputs.push(action)
      },
      handleCancelAsync: data => [`cancelAsync:${data.asyncId}`],
      handleCancelFrame: () => ["cancelFrame"],
      handleCancelInterval: data => [`cancelInterval:${data.intervalId}`],
      handleCancelTimer: data => [`cancelTimer:${data.timeoutId}`],
      handleGoBack: () => ["goBack"],
      handleRestartInterval: data => [
        `restartInterval:${data.intervalId}:${data.delay}`,
      ],
      handleRestartTimer: data => [
        `restartTimer:${data.timeoutId}:${data.delay}`,
      ],
      handleStartAsync: data => [`startAsync:${data.asyncId ?? "none"}`],
      handleStartFrame: data => [data.loop ? "startFrameLoop" : "startFrame"],
      handleStartInterval: data => [
        `startInterval:${data.intervalId}:${data.delay}`,
      ],
      handleStartTimer: data => [`startTimer:${data.timeoutId}:${data.delay}`],
    })

    expect([...registry.keys()]).toEqual([
      "goBack",
      "output",
      "startTimer",
      "startAsync",
      "cancelTimer",
      "cancelAsync",
      "restartTimer",
      "startInterval",
      "cancelInterval",
      "restartInterval",
      "startFrame",
      "cancelFrame",
    ])

    expect(
      dispatchEffect(goBack(), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual(["goBack"])

    expect(
      dispatchEffect(output(notice("sent")), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual([])

    expect(outputs).toEqual([notice("sent")])

    expect(
      dispatchEffect(startTimer("autosave", 10), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual(["startTimer:autosave:10"])

    expect(
      dispatchEffect(
        startAsync(async () => "Ada", "profile").chainToAction(loaded),
        {
          registry,
          runEffect: () => {
            throw new Error("runEffect should not be called")
          },
        },
      ),
    ).toEqual(["startAsync:profile"])

    expect(
      dispatchEffect(cancelTimer("autosave"), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual(["cancelTimer:autosave"])

    expect(
      dispatchEffect(cancelAsync("profile"), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual(["cancelAsync:profile"])

    expect(
      dispatchEffect(restartTimer("autosave", 20), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual(["restartTimer:autosave:20"])

    expect(
      dispatchEffect(startInterval("poll", 25), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual(["startInterval:poll:25"])

    expect(
      dispatchEffect(cancelInterval("poll"), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual(["cancelInterval:poll"])

    expect(
      dispatchEffect(restartInterval("poll", 50), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual(["restartInterval:poll:50"])

    expect(
      dispatchEffect(startFrame(), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual(["startFrame"])

    expect(
      dispatchEffect(startFrameLoop(), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual(["startFrameLoop"])

    expect(
      dispatchEffect(cancelFrame(), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual(["cancelFrame"])
  })

  test("falls back to runEffect when no handler is registered", () => {
    const effects = []
    const item = goBack()

    expect(
      dispatchEffect(item, {
        registry: new Map(),
        runEffect: effect => {
          effects.push(effect)
        },
      }),
    ).toEqual([])

    expect(effects).toEqual([item])
  })

  test("throws when registering duplicate handlers", () => {
    const registry = new Map([["goBack", () => ["first"]]])

    expect(() =>
      registerEffectHandlers(registry, new Map([["goBack", () => ["second"]]])),
    ).toThrow("Effect handler already registered for goBack")
  })

  test("registers non-duplicate handlers", () => {
    const registry = new Map<string, () => string[]>([
      ["goBack", () => ["first"]],
    ])

    registerEffectHandlers(registry, new Map([["cancelFrame", () => ["ok"]]]))

    expect(registry.get("cancelFrame")?.()).toEqual(["ok"])
  })

  test("uses empty fallback when optional handlers become unavailable", () => {
    const handlers = {
      handleCancelFrame: () => ["cancelFrame"],
      handleCancelInterval: () => ["cancelInterval"],
      handleRestartInterval: () => ["restartInterval"],
      handleStartFrame: () => ["startFrame"],
    }
    const registry = createEffectHandlerRegistry<string, never>(handlers)

    handlers.handleCancelInterval = undefined as never
    handlers.handleRestartInterval = undefined as never
    handlers.handleStartFrame = undefined as never
    handlers.handleCancelFrame = undefined as never

    expect(
      dispatchEffect(cancelInterval("poll"), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual([])

    expect(
      dispatchEffect(restartInterval("poll", 20), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual([])

    expect(
      dispatchEffect(startFrame(), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual([])

    expect(
      dispatchEffect(cancelFrame(), {
        registry,
        runEffect: () => {
          throw new Error("runEffect should not be called")
        },
      }),
    ).toEqual([])
  })
})
