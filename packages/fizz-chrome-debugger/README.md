# Fizz Chrome Debugger

This package contains two things:

1. the Chrome extension that adds the `Fizz` DevTools panel
2. a tiny built-in Node + React weather app for testing the extension locally

## Extension build

Build the extension bundle:

```bash
npm run build --workspace @repo/fizz-chrome-debugger
```

Load the unpacked extension from `packages/fizz-chrome-debugger/dist`.

## Test app

The test app lives in the same package and exercises three runtimes:

1. a Node backend machine behind `/api/weather`
2. a browser weather machine rendered on the page and auto-detected through the page runtime registry
3. a browser page-open machine that counts how many seconds the page has been open

### Start the test app

```bash
npm run dev:test-app --workspace @repo/fizz-chrome-debugger
```

That task will:

1. build the test app
2. watch the client and server bundles
3. restart the Node server when the server bundle changes
4. open Google Chrome automatically to `http://localhost:4311`

### What to verify

1. Open Chrome DevTools on the test page.
2. Switch to the `Fizz` panel.
3. Confirm the browser runtimes appear as `BrowserWeatherMachine` and `PageOpenMachine`.
4. Click `Refresh` and watch the weather runtime update in the panel.
5. Leave the page open for a few seconds and confirm the page-open runtime increments once per second.
6. Watch the terminal for the backend `ServerWeatherMachine` logs for `/api/weather`.

The backend machine fetches today's Portland forecast from Open-Meteo, normalizes the JSON payload, waits 2 seconds in a timer-backed state, and then returns the response.

The extension discovers runtimes with zero app-side setup. Each runtime adds itself to a page-global registry when it is created and removes itself on disconnect. The injected page script polls that registry, subscribes to each live runtime by `runtimeId`, and forwards snapshots to the extension panel.

### Production note

The test app is only for local validation of the extension workflow. The published extension build remains the regular `dist` output; the test app builds into `dist-test-app`.
