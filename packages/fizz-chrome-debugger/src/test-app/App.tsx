import type { CSSProperties } from "react"

import type { BrowserWeatherData } from "./browserWeatherMachine.js"
import { useBrowserWeatherMachine } from "./browserWeatherMachine.js"
import { usePageOpenMachine } from "./pageOpenMachine.js"

const panelStyle = {
  background: "rgba(10, 20, 35, 0.82)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 24,
  boxShadow: "0 22px 80px rgba(0, 0, 0, 0.28)",
  padding: 24,
} satisfies CSSProperties

const metricStyle = {
  ...panelStyle,
  borderRadius: 18,
  padding: 18,
} satisfies CSSProperties

export const App = () => {
  const machine = useBrowserWeatherMachine()
  const pageOpenMachine = usePageOpenMachine()
  const currentState = machine.currentState
  const pageOpenState = pageOpenMachine.currentState
  const currentData: BrowserWeatherData = currentState.data
  const weather = currentData.weather
  const isLoading = Boolean(currentState.is(machine.states.Loading))

  return (
    <main
      style={{
        margin: "0 auto",
        maxWidth: 1100,
        padding: "48px 24px 64px",
      }}
    >
      <section
        style={{
          ...panelStyle,
          display: "grid",
          gap: 24,
        }}
      >
        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                color: "#38bdf8",
                fontSize: 12,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
              }}
            >
              Fizz Chrome Debugger Test App
            </div>
            <h1
              style={{
                fontSize: "clamp(2.4rem, 5vw, 4rem)",
                lineHeight: 1,
                margin: "14px 0 10px",
              }}
            >
              Local Weather
            </h1>
            <p
              style={{
                color: "#bfd0e6",
                margin: 0,
                maxWidth: 700,
              }}
            >
              This page hosts two browser Fizz runtimes: one asks for location
              and fetches weather from the local Node endpoint, and one counts
              how many seconds the page has been open. Open Chrome DevTools and
              switch to the Fizz panel to inspect both browser machines while
              the backend request machine logs in the terminal.
            </p>
          </div>

          <button
            disabled={isLoading}
            onClick={() => {
              machine.actions.refresh()
            }}
            style={{
              alignSelf: "start",
              background: isLoading ? "#334155" : "#38bdf8",
              border: 0,
              borderRadius: 999,
              color: isLoading ? "#94a3b8" : "#031523",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: 15,
              fontWeight: 700,
              padding: "14px 18px",
            }}
            type="button"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>
        </header>

        <div
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          <article style={metricStyle}>
            <div
              style={{
                color: "#94a3b8",
                fontSize: 12,
                textTransform: "uppercase",
              }}
            >
              Machine State
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 10 }}>
              {currentState.name}
            </div>
          </article>

          <article style={metricStyle}>
            <div
              style={{
                color: "#94a3b8",
                fontSize: 12,
                textTransform: "uppercase",
              }}
            >
              Fetch Count
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 10 }}>
              {currentState.data.requestCount}
            </div>
          </article>

          <article style={metricStyle}>
            <div
              style={{
                color: "#94a3b8",
                fontSize: 12,
                textTransform: "uppercase",
              }}
            >
              Forecast
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 10 }}>
              {weather?.forecast ?? "Waiting"}
            </div>
          </article>

          <article style={metricStyle}>
            <div
              style={{
                color: "#94a3b8",
                fontSize: 12,
                textTransform: "uppercase",
              }}
            >
              Page Open
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 10 }}>
              {pageOpenState.data.secondsOpen}s
            </div>
            <button
              onClick={() => {
                pageOpenMachine.actions.reset()
              }}
              style={{
                background: "transparent",
                border: "1px solid rgba(148, 163, 184, 0.35)",
                borderRadius: 999,
                color: "#e2e8f0",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                marginTop: 14,
                padding: "8px 12px",
              }}
              type="button"
            >
              Reset Counter
            </button>
          </article>
        </div>

        <section
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          <article style={panelStyle}>
            <h2 style={{ fontSize: 18, marginTop: 0 }}>Today</h2>
            <dl style={{ display: "grid", gap: 12, margin: 0 }}>
              <div>
                <dt
                  style={{
                    color: "#94a3b8",
                    fontSize: 12,
                    textTransform: "uppercase",
                  }}
                >
                  City
                </dt>
                <dd
                  style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 700 }}
                >
                  {weather?.city ?? "Portland, Oregon"}
                </dd>
              </div>
              <div>
                <dt
                  style={{
                    color: "#94a3b8",
                    fontSize: 12,
                    textTransform: "uppercase",
                  }}
                >
                  Date
                </dt>
                <dd style={{ margin: "6px 0 0" }}>
                  {weather?.date ?? "Pending"}
                </dd>
              </div>
              <div>
                <dt
                  style={{
                    color: "#94a3b8",
                    fontSize: 12,
                    textTransform: "uppercase",
                  }}
                >
                  Temperature Range
                </dt>
                <dd style={{ margin: "6px 0 0" }}>
                  {weather
                    ? `${weather.temperatureMin}${weather.units.temperatureMin} to ${weather.temperatureMax}${weather.units.temperatureMax}`
                    : "Pending"}
                </dd>
              </div>
              <div>
                <dt
                  style={{
                    color: "#94a3b8",
                    fontSize: 12,
                    textTransform: "uppercase",
                  }}
                >
                  Precipitation Probability
                </dt>
                <dd style={{ margin: "6px 0 0" }}>
                  {weather
                    ? `${weather.precipitationProbabilityMax}${weather.units.precipitationProbabilityMax}`
                    : "Pending"}
                </dd>
              </div>
            </dl>
          </article>

          <article style={panelStyle}>
            <h2 style={{ fontSize: 18, marginTop: 0 }}>Runtime Data</h2>
            {currentState.data.errorMessage ? (
              <p style={{ color: "#fca5a5", marginTop: 0 }}>
                {currentState.data.errorMessage}
              </p>
            ) : null}
            <pre
              style={{
                background: "rgba(2, 6, 23, 0.88)",
                borderRadius: 16,
                margin: 0,
                overflowX: "auto",
                padding: 16,
              }}
            >
              {JSON.stringify(currentState.data, null, 2)}
            </pre>
          </article>

          <article style={panelStyle}>
            <h2 style={{ fontSize: 18, marginTop: 0 }}>Page Open Runtime</h2>
            <pre
              style={{
                background: "rgba(2, 6, 23, 0.88)",
                borderRadius: 16,
                margin: 0,
                overflowX: "auto",
                padding: 16,
              }}
            >
              {JSON.stringify(pageOpenState.data, null, 2)}
            </pre>
          </article>
        </section>
      </section>
    </main>
  )
}
