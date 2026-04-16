import { afterEach, describe, expect, jest, test } from "@jest/globals"
import {
  createControlledAsyncDriver,
  createControlledTimerDriver,
  enter,
  isState,
} from "@tdreyno/fizz"

import {
  createServerWeatherRuntime,
  Failed,
  LoadingWeather,
  respondReady,
  WaitingToReturn,
} from "../serverWeatherMachine.js"

const createResponse = (json: unknown, status = 200): Response =>
  ({
    json: async () => json,
    ok: status >= 200 && status < 300,
    status,
  }) as unknown as Response

describe("server weather machine", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test("uses provided coordinates and waits two seconds before responding", async () => {
    const fetchMock = jest.fn(async () =>
      createResponse({
        daily: {
          precipitation_probability_max: [45],
          temperature_2m_max: [17],
          temperature_2m_min: [8],
          time: ["2026-04-16"],
          weather_code: [3],
        },
        daily_units: {
          precipitation_probability_max: "%",
          temperature_2m_max: "C",
          temperature_2m_min: "C",
        },
        timezone: "America/Los_Angeles",
      }),
    )

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const runtime = createServerWeatherRuntime("req-1", {
      asyncDriver,
      coordinates: {
        latitude: 37.7749,
        longitude: -122.4194,
      },
      timerDriver,
    })

    const outputPromise = new Promise<ReturnType<typeof respondReady>>(
      resolve => {
        runtime.onOutput(outputAction => {
          if (respondReady.is(outputAction)) {
            resolve(outputAction)
          }
        })
      },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    expect(isState(runtime.currentState(), WaitingToReturn)).toBe(true)

    await timerDriver.advanceBy(1999)
    expect(isState(runtime.currentState(), WaitingToReturn)).toBe(true)

    await timerDriver.advanceBy(1)

    const outputAction = await outputPromise

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.open-meteo.com/v1/forecast?daily=weather_code%2Ctemperature_2m_max%2Ctemperature_2m_min%2Cprecipitation_probability_max&forecast_days=1&latitude=37.7749&longitude=-122.4194&timezone=auto",
    )
    expect(outputAction.payload.statusCode).toBe(200)
    expect(outputAction.payload.body).toMatchObject({
      ok: true,
      weather: {
        city: "Current Location",
      },
    })

    runtime.disconnect()
  })

  test("emits a failed response when the upstream api fails", async () => {
    globalThis.fetch = jest.fn(async () =>
      createResponse({}, 500),
    ) as unknown as typeof fetch

    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const runtime = createServerWeatherRuntime("req-4", {
      asyncDriver,
      timerDriver,
    })

    const outputPromise = new Promise<ReturnType<typeof respondReady>>(
      resolve => {
        runtime.onOutput(outputAction => {
          if (respondReady.is(outputAction)) {
            resolve(outputAction)
          }
        })
      },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    expect(isState(runtime.currentState(), Failed)).toBe(true)

    const outputAction = await outputPromise

    expect(outputAction.payload.statusCode).toBe(502)
    expect(outputAction.payload.body).toEqual({
      error: "Request failed with 500",
      ok: false,
    })

    runtime.disconnect()
  })

  test("emits a failed response when upstream json is malformed", async () => {
    globalThis.fetch = jest.fn(async () =>
      createResponse({
        daily: {},
      }),
    ) as unknown as typeof fetch

    const asyncDriver = createControlledAsyncDriver()
    const runtime = createServerWeatherRuntime("req-3", { asyncDriver })

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    expect(isState(currentState, Failed)).toBe(true)

    if (!isState(currentState, Failed)) {
      throw new Error("Expected Failed state")
    }

    expect(currentState.data.errorMessage).toBe(
      "Weather API response shape is invalid",
    )

    runtime.disconnect()
  })

  test("stays in loading until the async response resolves", async () => {
    const fetchMock = jest.fn(async () =>
      createResponse({
        daily: {
          precipitation_probability_max: [0],
          temperature_2m_max: [18],
          temperature_2m_min: [7],
          time: ["2026-04-16"],
          weather_code: [1],
        },
        daily_units: {
          precipitation_probability_max: "%",
          temperature_2m_max: "C",
          temperature_2m_min: "C",
        },
        timezone: "America/Los_Angeles",
      }),
    )

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const asyncDriver = createControlledAsyncDriver()
    const runtime = createServerWeatherRuntime("req-4", { asyncDriver })

    await runtime.run(enter())

    expect(isState(runtime.currentState(), LoadingWeather)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.open-meteo.com/v1/forecast?daily=weather_code%2Ctemperature_2m_max%2Ctemperature_2m_min%2Cprecipitation_probability_max&forecast_days=1&latitude=45.5231&longitude=-122.6765&timezone=auto",
    )

    await asyncDriver.flush()

    expect(isState(runtime.currentState(), WaitingToReturn)).toBe(true)

    runtime.disconnect()
  })

  test("uses custom logger output instead of terminal logging under test", async () => {
    globalThis.fetch = jest.fn(async () =>
      createResponse({}, 500),
    ) as unknown as typeof fetch

    const asyncDriver = createControlledAsyncDriver()
    const customLogger = jest.fn()
    const consoleLog = jest
      .spyOn(console, "log")
      .mockImplementation(() => undefined)

    const runtime = createServerWeatherRuntime("req-logger", {
      asyncDriver,
      customLogger,
    })

    await runtime.run(enter())
    await asyncDriver.flush()

    expect(customLogger).toHaveBeenCalledWith(
      ["request:req-logger:fetching"],
      "log",
    )
    expect(customLogger).toHaveBeenCalledWith(
      ["request:req-logger:failed", "Request failed with 500"],
      "log",
    )
    expect(consoleLog).not.toHaveBeenCalled()

    runtime.disconnect()
  })
})
