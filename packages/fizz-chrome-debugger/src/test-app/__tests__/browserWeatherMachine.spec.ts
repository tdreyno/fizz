import { afterEach, describe, expect, jest, test } from "@jest/globals"
import {
  createControlledAsyncDriver,
  createInitialContext,
  enter,
  isState,
  Runtime,
} from "@tdreyno/fizz"

import {
  BrowserWeatherMachine,
  Failed,
  Loaded,
  Loading,
  refresh,
} from "../browserWeatherMachine.js"

const createResponse = (json: unknown, status = 200): Response =>
  ({
    json: async () => json,
    ok: status >= 200 && status < 300,
    status,
  }) as unknown as Response

describe("browser weather machine", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test("loads weather from the local api and transitions to Loaded", async () => {
    const asyncDriver = createControlledAsyncDriver()

    globalThis.fetch = jest.fn(async () =>
      createResponse({
        ok: true,
        weather: {
          city: "Portland, Oregon",
          date: "2026-04-16",
          forecast: "Partly cloudy",
          precipitationProbabilityMax: 20,
          temperatureMax: 18,
          temperatureMin: 9,
          timezone: "America/Los_Angeles",
          units: {
            precipitationProbabilityMax: "%",
            temperatureMax: "C",
            temperatureMin: "C",
          },
          weatherCode: 2,
        },
      }),
    ) as unknown as typeof fetch

    const runtime = new Runtime(
      createInitialContext([
        BrowserWeatherMachine.states.Loading({
          errorMessage: null,
          requestCount: 0,
          weather: null,
        }),
      ]),
      BrowserWeatherMachine.actions ?? {},
      {},
      { asyncDriver },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    expect(isState(currentState, Loaded)).toBe(true)

    if (!isState(currentState, Loaded)) {
      throw new Error("Expected Loaded state")
    }

    expect(currentState.data.weather?.city).toBe("Portland, Oregon")
    expect(currentState.data.requestCount).toBe(1)
  })

  test("transitions to Failed when the local api request errors", async () => {
    const asyncDriver = createControlledAsyncDriver()

    globalThis.fetch = jest.fn(async () =>
      createResponse({}, 500),
    ) as unknown as typeof fetch

    const runtime = new Runtime(
      createInitialContext([
        BrowserWeatherMachine.states.Loading({
          errorMessage: null,
          requestCount: 0,
          weather: null,
        }),
      ]),
      BrowserWeatherMachine.actions ?? {},
      {},
      { asyncDriver },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    expect(isState(currentState, Failed)).toBe(true)

    if (!isState(currentState, Failed)) {
      throw new Error("Expected Failed state")
    }

    expect(currentState.data.errorMessage).toContain("Request failed with 500")
    expect(currentState.data.requestCount).toBe(0)
  })

  test("returns to Loading when refresh is triggered from Loaded", async () => {
    const runtime = new Runtime(
      createInitialContext([
        BrowserWeatherMachine.states.Loaded({
          errorMessage: null,
          requestCount: 1,
          weather: {
            city: "Portland, Oregon",
            date: "2026-04-16",
            forecast: "Clear sky",
            precipitationProbabilityMax: 0,
            temperatureMax: 20,
            temperatureMin: 8,
            timezone: "America/Los_Angeles",
            units: {
              precipitationProbabilityMax: "%",
              temperatureMax: "C",
              temperatureMin: "C",
            },
            weatherCode: 0,
          },
        }),
      ]),
      BrowserWeatherMachine.actions ?? {},
      {},
      {},
    )

    await runtime.run(refresh())

    expect(isState(runtime.currentState(), Loading)).toBe(true)
  })
})
