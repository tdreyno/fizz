import type { ActionCreatorType, BoundStateFn, Enter } from "@tdreyno/fizz"
import {
  action,
  createMachine,
  requestJSONAsync,
  startAsync,
  state,
} from "@tdreyno/fizz"
import { useMachine } from "@tdreyno/fizz-react"

import { registerFizzDebuggerMachineGraph } from "../index.js"
import type { WeatherApiSuccessResponse, WeatherReport } from "./weather.js"
import {
  assertWeatherApiSuccessResponse,
  formatErrorMessage,
} from "./weather.js"

const refresh = action("Refresh")
const weatherRequestReady = action("WeatherRequestReady").withPayload<{
  requestPath: string
}>()
const weatherLoaded =
  action("WeatherLoaded").withPayload<WeatherApiSuccessResponse>()
const weatherLoadFailed = action("WeatherLoadFailed").withPayload<{
  message: string
}>()

type LoadingActions =
  | Enter
  | ActionCreatorType<typeof weatherRequestReady>
  | ActionCreatorType<typeof weatherLoaded>
  | ActionCreatorType<typeof weatherLoadFailed>
type ReadyActions = ActionCreatorType<typeof refresh>

type LoadingState = BoundStateFn<"Loading", LoadingActions, BrowserWeatherData>
type LoadedState = BoundStateFn<"Loaded", ReadyActions, BrowserWeatherData>
type FailedState = BoundStateFn<"Failed", ReadyActions, BrowserWeatherData>

export type BrowserWeatherData = {
  errorMessage: string | null
  requestCount: number
  weather: WeatherReport | null
}

const initialBrowserWeatherData = (): BrowserWeatherData => ({
  errorMessage: null,
  requestCount: 0,
  weather: null,
})

type BrowserCoordinates = {
  latitude: number
  longitude: number
}

const defaultWeatherPath = "/api/weather"

const getCurrentCoordinates = (): Promise<BrowserCoordinates | null> =>
  new Promise(resolve => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      () => {
        resolve(null)
      },
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 5000,
      },
    )
  })

const buildWeatherRequestPath = (coordinates: BrowserCoordinates | null) => {
  if (coordinates === null) {
    return defaultWeatherPath
  }

  const params = new URLSearchParams({
    latitude: coordinates.latitude.toString(),
    longitude: coordinates.longitude.toString(),
  })

  return `${defaultWeatherPath}?${params.toString()}`
}

const resolveWeatherRequestPath = async (): Promise<string> =>
  buildWeatherRequestPath(await getCurrentCoordinates())

const requestWeather = (requestPath: string) =>
  requestJSONAsync(requestPath)
    .validate(assertWeatherApiSuccessResponse)
    .chainToAction(weatherLoaded, reason =>
      weatherLoadFailed({
        message: formatErrorMessage(reason),
      }),
    )

const Loading = state<LoadingActions, BrowserWeatherData>(
  {
    Enter: () =>
      startAsync(resolveWeatherRequestPath, {
        reject: () => undefined,
        resolve: requestPath => weatherRequestReady({ requestPath }),
      }),

    WeatherRequestReady: (_, payload) => requestWeather(payload.requestPath),

    WeatherLoaded: (data, payload) =>
      Loaded({
        ...data,
        errorMessage: null,
        requestCount: data.requestCount + 1,
        weather: payload.weather,
      }),

    WeatherLoadFailed: (data, payload) =>
      Failed({
        ...data,
        errorMessage: payload.message,
      }),
  },
  { name: "Loading" },
) as LoadingState

const Loaded = state<ReadyActions, BrowserWeatherData>(
  {
    Refresh: data =>
      Loading({
        ...data,
        errorMessage: null,
      }),
  },
  { name: "Loaded" },
) as LoadedState

const Failed = state<ReadyActions, BrowserWeatherData>(
  {
    Refresh: data =>
      Loading({
        ...data,
        errorMessage: null,
      }),
  },
  { name: "Failed" },
) as FailedState

const BrowserWeatherActions = {
  refresh,
  weatherRequestReady,
  weatherLoaded,
  weatherLoadFailed,
}

const BrowserWeatherStates = {
  Failed,
  Loaded,
  Loading,
}

export type BrowserWeatherRuntimeState = ReturnType<
  (typeof BrowserWeatherStates)[keyof typeof BrowserWeatherStates]
>

export type BrowserWeatherMachineValue = {
  actions: {
    refresh: () => {
      asPromise: () => Promise<void>
    }
  }
  currentState: BrowserWeatherRuntimeState
  states: typeof BrowserWeatherStates
}

export const BrowserWeatherMachine = createMachine(
  {
    actions: BrowserWeatherActions,
    states: BrowserWeatherStates,
  },
  "BrowserWeatherMachine",
)

registerFizzDebuggerMachineGraph({
  graph: {
    entryState: "Loading",
    name: "BrowserWeatherMachine",
    nodes: [
      { id: "Loading", x: 0, y: 0 },
      { id: "Loaded", x: 260, y: 0 },
      { id: "Failed", x: 520, y: 0 },
    ],
    transitions: [
      {
        action: "WeatherLoaded",
        from: "Loading",
        to: "Loaded",
      },
      {
        action: "WeatherLoadFailed",
        from: "Loading",
        to: "Failed",
      },
      {
        action: "Refresh",
        from: "Loaded",
        to: "Loading",
      },
      {
        action: "Refresh",
        from: "Failed",
        to: "Loading",
      },
    ],
  },
  label: "BrowserWeatherMachine",
})

export const useBrowserWeatherMachine = (): BrowserWeatherMachineValue =>
  useMachine(
    BrowserWeatherMachine,
    BrowserWeatherMachine.states.Loading(initialBrowserWeatherData()),
  ) as BrowserWeatherMachineValue

export {
  Failed,
  Loaded,
  Loading,
  refresh,
  weatherLoaded,
  weatherLoadFailed,
  weatherRequestReady,
}
