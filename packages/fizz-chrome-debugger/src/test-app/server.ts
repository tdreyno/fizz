import { readFile } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { createServer } from "node:http"
import { extname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { enter } from "@tdreyno/fizz"

import {
  createServerWeatherRuntime,
  respondReady,
} from "./serverWeatherMachine.js"
import type {
  WeatherApiErrorResponse,
  WeatherApiSuccessResponse,
} from "./weather.js"

const currentDir = fileURLToPath(new URL(".", import.meta.url))
const publicDir = resolve(currentDir, "../public")
const port = Number(process.env["PORT"] ?? 4311)
let requestCounter = 1

const contentTypeByExtension: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
}

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  })
  response.end(JSON.stringify(body, null, 2))
}

const serveAsset = async (pathname: string, response: ServerResponse) => {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname
  const assetPath = resolve(publicDir, `.${normalizedPath}`)
  const contentType =
    contentTypeByExtension[extname(assetPath)] ?? "text/plain; charset=utf-8"
  const asset = await readFile(assetPath)

  response.writeHead(200, {
    "Content-Type": contentType,
  })
  response.end(asset)
}

const runWeatherRequest = async (requestId: string) => {
  const runtime = createServerWeatherRuntime(requestId)

  return await new Promise<{
    body: WeatherApiErrorResponse | WeatherApiSuccessResponse
    statusCode: number
  }>((resolve, reject) => {
    const unsubscribe = runtime.onOutput(outputAction => {
      if (!respondReady.is(outputAction)) {
        return
      }

      const payload = outputAction.payload

      unsubscribe()
      resolve(payload)
    })

    void runtime.run(enter()).catch(error => {
      unsubscribe()
      reject(
        error instanceof Error ? error : new Error("Unexpected server error"),
      )
    })
  })
}

const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
) => {
  if (!request.url) {
    writeJson(response, 400, {
      error: "Missing request URL",
      ok: false,
    })
    return
  }

  const url = new URL(request.url, `http://localhost:${port}`)

  if (url.pathname === "/api/weather") {
    const requestId = `${requestCounter++}`

    try {
      const payload = await runWeatherRequest(requestId)

      writeJson(response, payload.statusCode, payload.body)
      return
    } catch (error) {
      writeJson(response, 500, {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
        ok: false,
      })
      return
    }
  }

  try {
    await serveAsset(url.pathname, response)
  } catch {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
    })
    response.end("Not found")
  }
}

const server = createServer((request, response) => {
  void handleRequest(request, response)
})

server.listen(port, () => {
  console.log(`Test app ready at http://localhost:${port}`)
})
