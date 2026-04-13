"use client"

import { useIntervalMachine } from "../machines/interval"
import { useTimeoutMachine } from "../machines/timeout"
import { useTestMachine } from "../machines/test"

const Page = () => {
  const testMachine = useTestMachine()
  const intervalMachine = useIntervalMachine()
  const intervalData = intervalMachine.currentState.data
  const timeoutMachine = useTimeoutMachine()
  const timeoutData = timeoutMachine.currentState.data

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-12 text-stone-50">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-stone-800 bg-stone-900 p-6 shadow-2xl shadow-black/20">
          <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">
            Timeout Demo
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {timeoutMachine.currentState.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">
            This panel exercises one-shot scheduling. Arm uses{" "}
            <code>startTimer</code>, cancel uses <code>cancelTimer</code>, and
            faster uses <code>restartTimer</code>.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl bg-stone-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-stone-400">
                Status
              </div>
              <div className="mt-2 text-2xl font-medium capitalize">
                {timeoutData.status}
              </div>
            </article>

            <article className="rounded-2xl bg-stone-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-stone-400">
                Fire Count
              </div>
              <div className="mt-2 text-2xl font-medium">
                {timeoutData.fireCount}
              </div>
            </article>

            <article className="rounded-2xl bg-stone-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-stone-400">
                Delay
              </div>
              <div className="mt-2 text-2xl font-medium">
                {timeoutData.delayMs}ms
              </div>
            </article>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
              disabled={timeoutData.status === "armed"}
              onClick={() => timeoutMachine.actions.arm()}
            >
              Arm
            </button>
            <button
              className="rounded-full border border-stone-700 px-4 py-2 text-sm font-medium text-stone-100 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-500"
              disabled={timeoutData.status !== "armed"}
              onClick={() => timeoutMachine.actions.cancel()}
            >
              Cancel
            </button>
            <button
              className="rounded-full border border-cyan-700 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-500 hover:bg-cyan-950/40"
              onClick={() => timeoutMachine.actions.faster()}
            >
              Faster
            </button>
            <button
              className="rounded-full border border-stone-700 px-4 py-2 text-sm font-medium text-stone-100 transition hover:border-stone-500 hover:bg-stone-800"
              onClick={() => timeoutMachine.actions.reset()}
            >
              Reset
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-stone-400">
              Recent Events
            </div>
            <ul className="mt-3 space-y-2 text-sm text-stone-200">
              {timeoutData.recentEvents
                .slice()
                .reverse()
                .map((event: string, index: number) => (
                  <li
                    key={`${event}-${index}`}
                    className="rounded-xl bg-stone-900 px-3 py-2"
                  >
                    {event}
                  </li>
                ))}
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-stone-800 bg-stone-900 p-6 shadow-2xl shadow-black/20">
          <p className="text-sm uppercase tracking-[0.24em] text-orange-300">
            Interval Demo
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {intervalMachine.currentState.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">
            This panel exercises the new repeating scheduler helpers in a live{" "}
            React flow. Pause uses <code>cancelInterval</code>, faster uses{" "}
            <code>restartInterval</code>, and resume uses{" "}
            <code>startInterval</code>.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl bg-stone-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-stone-400">
                Status
              </div>
              <div className="mt-2 text-2xl font-medium capitalize">
                {intervalData.status}
              </div>
            </article>

            <article className="rounded-2xl bg-stone-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-stone-400">
                Tick Count
              </div>
              <div className="mt-2 text-2xl font-medium">
                {intervalData.tickCount}
              </div>
            </article>

            <article className="rounded-2xl bg-stone-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-stone-400">
                Cadence
              </div>
              <div className="mt-2 text-2xl font-medium">
                {intervalData.intervalMs}ms
              </div>
            </article>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-full bg-orange-400 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
              disabled={intervalData.status === "paused"}
              onClick={() => intervalMachine.actions.pause()}
            >
              Pause
            </button>
            <button
              className="rounded-full border border-stone-700 px-4 py-2 text-sm font-medium text-stone-100 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-500"
              disabled={intervalData.status === "running"}
              onClick={() => intervalMachine.actions.resume()}
            >
              Resume
            </button>
            <button
              className="rounded-full border border-cyan-700 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-500 hover:bg-cyan-950/40"
              onClick={() => intervalMachine.actions.faster()}
            >
              Faster
            </button>
            <button
              className="rounded-full border border-stone-700 px-4 py-2 text-sm font-medium text-stone-100 transition hover:border-stone-500 hover:bg-stone-800"
              onClick={() => intervalMachine.actions.reset()}
            >
              Reset
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-stone-400">
              Recent Events
            </div>
            <ul className="mt-3 space-y-2 text-sm text-stone-200">
              {intervalData.recentEvents
                .slice()
                .reverse()
                .map((event: string, index: number) => (
                  <li
                    key={`${event}-${index}`}
                    className="rounded-xl bg-stone-900 px-3 py-2"
                  >
                    {event}
                  </li>
                ))}
            </ul>
          </div>
        </section>

        <aside className="rounded-3xl border border-stone-800 bg-stone-900/70 p-6 lg:col-span-2">
          <p className="text-sm uppercase tracking-[0.24em] text-stone-400">
            Existing Example
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            {testMachine.currentState.name}
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-300">
            The original demo is still here so the interval example stays an
            additive change.
          </p>
          <button
            className="mt-6 rounded-full border border-stone-700 px-4 py-2 text-sm font-medium text-stone-100 transition hover:border-stone-500 hover:bg-stone-800"
            onClick={() => testMachine.actions.world()}
          >
            World
          </button>
          <pre className="mt-6 overflow-x-auto rounded-2xl bg-stone-950/80 p-4 text-xs leading-6 text-stone-300">
            {JSON.stringify(testMachine.currentState.data, null, 2)}
          </pre>
        </aside>
      </div>
    </main>
  )
}

export default Page
