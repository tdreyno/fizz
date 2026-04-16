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

const setGeolocation = (
  getCurrentPosition: Geolocation["getCurrentPosition"],
) => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition,
      },
    },
  })
}

const flushWeatherLoad = async (
  asyncDriver: ReturnType<typeof createControlledAsyncDriver>,
) => {
  await asyncDriver.flush()
  await asyncDriver.flush()
}

describe("browser weather machine", () => {
  afterEach(() => {
    jest.restoreAllMocks()
    Reflect.deleteProperty(globalThis, "navigator")
  })

  test("uses browser coordinates and transitions to Loaded", async () => {
    const asyncDriver = createControlledAsyncDriver()
    const fetchMock = jest.fn(async () =>
      createResponse({
        ok: true,
        weather: {
          city: "Current Location",
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
    )

    globalThis.fetch = fetchMock as unknown as typeof fetch
    setGeolocation(resolve => {
      resolve({
        coords: {
          accuracy: 0,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          latitude: 40.7128,
          longitude: -74.006,
          speed: null,
        },
        timestamp: 0,
      } as GeolocationPosition)
    })

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
    await flushWeatherLoad(asyncDriver)

    const currentState = runtime.currentState()

    expect(isState(currentState, Loaded)).toBe(true)

    if (!isState(currentState, Loaded)) {
      throw new Error("Expected Loaded state")
    }

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/weather?latitude=40.7128&longitude=-74.006",
    )
    expect(currentState.data.weather?.city).toBe("Current Location")
    expect(currentState.data.requestCount).toBe(1)
  })

  test("falls back to Portland request path when geolocation is denied", async () => {
    const asyncDriver = createControlledAsyncDriver()
    const fetchMock = jest.fn(async () =>
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
    )

    globalThis.fetch = fetchMock as unknown as typeof fetch
    setGeolocation((_resolve, reject) => {
      reject?.({
        code: 1,
        message: "permission denied",
      } as GeolocationPositionError)
    })

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
    await flushWeatherLoad(asyncDriver)

    const currentState = runtime.currentState()

    expect(isState(currentState, Loaded)).toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/weather")
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
    await flushWeatherLoad(asyncDriver)

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
