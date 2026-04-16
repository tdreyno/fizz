import type { ActionCreatorType, BoundStateFn, Enter } from "@tdreyno/fizz"
import { action, createMachine, requestJSONAsync, state } from "@tdreyno/fizz"
import { useMachine } from "@tdreyno/fizz-react"

import type { WeatherApiSuccessResponse, WeatherReport } from "./weather.js"
import {
  assertWeatherApiSuccessResponse,
  formatErrorMessage,
} from "./weather.js"

const refresh = action("Refresh")
const weatherLoaded =
  action("WeatherLoaded").withPayload<WeatherApiSuccessResponse>()
const weatherLoadFailed = action("WeatherLoadFailed").withPayload<{
  message: string
}>()

type LoadingActions =
  | Enter
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

const requestWeather = () =>
  requestJSONAsync("/api/weather")
    .validate(assertWeatherApiSuccessResponse)
    .chainToAction(weatherLoaded, reason =>
      weatherLoadFailed({
        message: formatErrorMessage(reason),
      }),
    )

const Loading = state<LoadingActions, BrowserWeatherData>(
  {
    Enter: () => requestWeather(),

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
}

export const BrowserWeatherMachine = createMachine(
  {
    actions: BrowserWeatherActions,
    states: BrowserWeatherStates,
  },
  "BrowserWeatherMachine",
)

export const useBrowserWeatherMachine = (): BrowserWeatherMachineValue =>
  useMachine(
    BrowserWeatherMachine,
    BrowserWeatherMachine.states.Loading(initialBrowserWeatherData()),
  ) as BrowserWeatherMachineValue

export { Failed, Loaded, Loading, refresh, weatherLoaded, weatherLoadFailed }
