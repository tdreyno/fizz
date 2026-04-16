export type OpenMeteoDaily = {
  precipitation_probability_max: number[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  time: string[]
  weather_code: number[]
}

export type OpenMeteoForecastResponse = {
  daily: OpenMeteoDaily
  daily_units: {
    precipitation_probability_max: string
    temperature_2m_max: string
    temperature_2m_min: string
  }
  timezone: string
}

export type WeatherReport = {
  city: string
  date: string
  forecast: string
  precipitationProbabilityMax: number
  temperatureMax: number
  temperatureMin: number
  timezone: string
  units: {
    precipitationProbabilityMax: string
    temperatureMax: string
    temperatureMin: string
  }
  weatherCode: number
}

export type WeatherApiSuccessResponse = {
  ok: true
  weather: WeatherReport
}

export type WeatherApiErrorResponse = {
  error: string
  ok: false
}

export type WeatherCoordinates = {
  latitude: number
  longitude: number
}

export const currentLocationCityLabel = "Current Location"
export const portlandCityLabel = "Portland, Oregon"
export const portlandCoordinates: WeatherCoordinates = {
  latitude: 45.5231,
  longitude: -122.6765,
}

const openMeteoBaseUrl = "https://api.open-meteo.com/v1/forecast"

export const buildOpenMeteoWeatherUrl = (
  coordinates: WeatherCoordinates = portlandCoordinates,
): string => {
  const params = new URLSearchParams({
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: "1",
    latitude: coordinates.latitude.toString(),
    longitude: coordinates.longitude.toString(),
    timezone: "auto",
  })

  return `${openMeteoBaseUrl}?${params.toString()}`
}

const weatherDescriptions = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with light hail",
  99: "Thunderstorm with heavy hail",
} satisfies Record<number, string>

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(item => typeof item === "number")

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === "string")

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

export const describeWeatherCode = (weatherCode: number): string => {
  const descriptionMap: Record<number, string> = weatherDescriptions

  return descriptionMap[weatherCode] ?? "Unknown conditions"
}

export const formatErrorMessage = (reason: unknown): string => {
  if (reason instanceof Error) {
    return reason.message
  }

  if (typeof reason === "string") {
    return reason
  }

  return "Unexpected error"
}

export const assertOpenMeteoForecastResponse = (
  value: unknown,
): asserts value is OpenMeteoForecastResponse => {
  const daily = isRecord(value) ? value["daily"] : undefined
  const dailyUnits = isRecord(value) ? value["daily_units"] : undefined
  const timezone = isRecord(value) ? value["timezone"] : undefined

  if (!isRecord(value) || !isRecord(daily) || !isRecord(dailyUnits)) {
    throw new TypeError("Weather API response shape is invalid")
  }

  if (
    !isStringArray(daily["time"]) ||
    !isNumberArray(daily["temperature_2m_max"]) ||
    !isNumberArray(daily["temperature_2m_min"]) ||
    !isNumberArray(daily["precipitation_probability_max"]) ||
    !isNumberArray(daily["weather_code"]) ||
    typeof dailyUnits["temperature_2m_max"] !== "string" ||
    typeof dailyUnits["temperature_2m_min"] !== "string" ||
    typeof dailyUnits["precipitation_probability_max"] !== "string" ||
    typeof timezone !== "string"
  ) {
    throw new TypeError("Weather API response shape is invalid")
  }
}

export const assertWeatherApiSuccessResponse = (
  value: unknown,
): asserts value is WeatherApiSuccessResponse => {
  const ok = isRecord(value) ? value["ok"] : undefined
  const weather = isRecord(value) ? value["weather"] : undefined
  const units = isRecord(weather) ? weather["units"] : undefined

  if (
    !isRecord(value) ||
    ok !== true ||
    !isRecord(weather) ||
    !isRecord(units)
  ) {
    throw new TypeError("Weather endpoint response shape is invalid")
  }

  if (
    typeof weather["city"] !== "string" ||
    typeof weather["date"] !== "string" ||
    typeof weather["forecast"] !== "string" ||
    typeof weather["precipitationProbabilityMax"] !== "number" ||
    typeof weather["temperatureMax"] !== "number" ||
    typeof weather["temperatureMin"] !== "number" ||
    typeof weather["timezone"] !== "string" ||
    typeof weather["weatherCode"] !== "number" ||
    typeof units["precipitationProbabilityMax"] !== "string" ||
    typeof units["temperatureMax"] !== "string" ||
    typeof units["temperatureMin"] !== "string"
  ) {
    throw new TypeError("Weather endpoint response shape is invalid")
  }
}

export const normalizeWeatherReport = (
  response: OpenMeteoForecastResponse,
  options: { city?: string } = {},
): WeatherReport => ({
  city: options.city ?? currentLocationCityLabel,
  date: response.daily.time[0] ?? "unknown",
  forecast: describeWeatherCode(response.daily.weather_code[0] ?? -1),
  precipitationProbabilityMax:
    response.daily.precipitation_probability_max[0] ?? 0,
  temperatureMax: response.daily.temperature_2m_max[0] ?? 0,
  temperatureMin: response.daily.temperature_2m_min[0] ?? 0,
  timezone: response.timezone,
  units: {
    precipitationProbabilityMax:
      response.daily_units.precipitation_probability_max,
    temperatureMax: response.daily_units.temperature_2m_max,
    temperatureMin: response.daily_units.temperature_2m_min,
  },
  weatherCode: response.daily.weather_code[0] ?? -1,
})
