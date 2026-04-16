import type { CreateRuntimeOptions, Enter, RuntimeMonitor } from "@tdreyno/fizz"
import {
  action,
  createInitialContext,
  createMachine,
  createRuntimeConsoleMonitor,
  log,
  output,
  requestJSONAsync,
  Runtime,
  state,
} from "@tdreyno/fizz"

import type {
  WeatherApiErrorResponse,
  WeatherApiSuccessResponse,
  WeatherReport,
} from "./weather.js"
import {
  assertOpenMeteoForecastResponse,
  formatErrorMessage,
  normalizeWeatherReport,
  portlandWeatherUrl,
} from "./weather.js"

const weatherLoaded = action("WeatherLoaded").withPayload<WeatherReport>()
const weatherLoadFailed = action("WeatherLoadFailed").withPayload<{
  message: string
}>()
export const respondReady = action("RespondReady").withPayload<{
  body: WeatherApiErrorResponse | WeatherApiSuccessResponse
  statusCode: number
}>()

const ServerWeatherActions = {
  weatherLoaded,
  weatherLoadFailed,
}

const ServerWeatherOutputActions = {
  respondReady,
}

type LoadingWeatherActions =
  | Enter
  | ReturnType<typeof weatherLoaded>
  | ReturnType<typeof weatherLoadFailed>
type WaitingToReturnActions = Enter
type FailedActions = Enter
type CompletedActions = Enter
type TimeoutId = "response-delay"

type LoadingWeatherData = {
  requestId: string
}

type WaitingToReturnData = {
  requestId: string
  weather: WeatherReport
}

type FailedData = {
  errorMessage: string
  requestId: string
}

type CompletedData = {
  requestId: string
  statusCode: number
}

const LoadingWeather = state<
  LoadingWeatherActions,
  LoadingWeatherData,
  TimeoutId
>(
  {
    Enter: data => [
      log(`request:${data.requestId}:fetching`),
      requestJSONAsync(portlandWeatherUrl)
        .validate(assertOpenMeteoForecastResponse)
        .chainToAction(
          response => weatherLoaded(normalizeWeatherReport(response)),
          reason =>
            weatherLoadFailed({
              message: formatErrorMessage(reason),
            }),
        ),
    ],

    WeatherLoaded: (data, weather) =>
      WaitingToReturn({
        requestId: data.requestId,
        weather,
      }),

    WeatherLoadFailed: (data, payload) =>
      Failed({
        errorMessage: payload.message,
        requestId: data.requestId,
      }),
  },
  { name: "LoadingWeather" },
)

const WaitingToReturn = state<
  WaitingToReturnActions,
  WaitingToReturnData,
  TimeoutId
>(
  {
    Enter: (data, _, { startTimer }) => [
      log(`request:${data.requestId}:delaying-response`),
      startTimer("response-delay", 2000),
    ],

    TimerCompleted: data => [
      Completed({
        requestId: data.requestId,
        statusCode: 200,
      }),
      output(
        respondReady({
          body: {
            ok: true,
            weather: data.weather,
          },
          statusCode: 200,
        }),
      ),
    ],
  },
  { name: "WaitingToReturn" },
)

const Failed = state<FailedActions, FailedData, TimeoutId>(
  {
    Enter: data => [
      log(`request:${data.requestId}:failed`, data.errorMessage),
      output(
        respondReady({
          body: {
            error: data.errorMessage,
            ok: false,
          },
          statusCode: 502,
        }),
      ),
    ],
  },
  { name: "Failed" },
)

const Completed = state<CompletedActions, CompletedData, TimeoutId>(
  {
    Enter: () => undefined,
  },
  { name: "Completed" },
)

export const ServerWeatherMachine = createMachine(
  {
    actions: ServerWeatherActions,
    outputActions: ServerWeatherOutputActions,
    states: {
      Completed,
      Failed,
      LoadingWeather,
      WaitingToReturn,
    },
  },
  "ServerWeatherMachine",
)

type CreateServerWeatherRuntimeOptions = Partial<CreateRuntimeOptions> & {
  enableConsoleMonitor?: boolean
  monitorFactory?: (requestId: string) => RuntimeMonitor
}

export const createServerWeatherRuntime = (
  requestId: string,
  options: CreateServerWeatherRuntimeOptions = {},
): Runtime<typeof ServerWeatherActions, typeof ServerWeatherOutputActions> => {
  const enableConsoleMonitor =
    options.enableConsoleMonitor ?? process.env["NODE_ENV"] !== "test"
  const consoleMonitor = enableConsoleMonitor
    ? (options.monitorFactory?.(requestId) ??
      createRuntimeConsoleMonitor({
        prefix: `[Weather API ${requestId}]`,
      }))
    : undefined

  const contextOptions = {
    enableLogging: options.enableLogging ?? enableConsoleMonitor,
    ...(options.customLogger === undefined
      ? {}
      : { customLogger: options.customLogger }),
    ...(options.maxHistory === undefined
      ? {}
      : { maxHistory: options.maxHistory }),
  }

  const runtimeOptions = {
    ...(options.asyncDriver === undefined
      ? {}
      : { asyncDriver: options.asyncDriver }),
    ...(ServerWeatherMachine.name === undefined
      ? {}
      : { debugLabel: ServerWeatherMachine.name }),
    ...(consoleMonitor === undefined && options.monitor === undefined
      ? {}
      : {
          monitor: (event: Parameters<RuntimeMonitor>[0]) => {
            consoleMonitor?.(event)
            options.monitor?.(event)
          },
        }),
    ...(options.timerDriver === undefined
      ? {}
      : { timerDriver: options.timerDriver }),
  }

  return new Runtime(
    createInitialContext(
      [ServerWeatherMachine.states.LoadingWeather({ requestId })],
      contextOptions,
    ),
    ServerWeatherActions,
    ServerWeatherOutputActions,
    runtimeOptions,
  )
}

export {
  Completed,
  Failed,
  LoadingWeather,
  WaitingToReturn,
  weatherLoaded,
  weatherLoadFailed,
}
