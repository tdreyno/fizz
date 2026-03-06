import { readFile } from "node:fs/promises"

const POLL_INTERVAL_MS = 2000
const MAX_WAIT_MS = 120000

const normalizeHost = host => host.replace(/\/+$/, "")

const parseReportTask = async () => {
  const reportTask = await readFile(".scannerwork/report-task.txt", "utf8")
  const values = reportTask
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .reduce((acc, line) => {
      const [key, ...rest] = line.split("=")

      if (key && rest.length > 0) {
        acc[key] = rest.join("=")
      }

      return acc
    }, {})

  return {
    ceTaskUrl: values.ceTaskUrl,
    dashboardUrl: values.dashboardUrl,
    projectKey: values.projectKey,
    serverUrl: values.serverUrl,
  }
}

const parseProjectProperties = async () => {
  const raw = await readFile("sonar-project.properties", "utf8")

  return raw
    .split("\n")
    .map(line => line.trim())
    .filter(line => Boolean(line) && !line.startsWith("#"))
    .reduce((acc, line) => {
      const [key, ...rest] = line.split("=")

      if (key && rest.length > 0) {
        acc[key] = rest.join("=")
      }

      return acc
    }, {})
}

const sonarRequest = async ({ url, token }) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Sonar request failed (${response.status}): ${url}`)
  }

  return response.json()
}

const waitForCeTask = async ({ ceTaskUrl, token }) => {
  const started = Date.now()

  while (Date.now() - started < MAX_WAIT_MS) {
    const { task } = await sonarRequest({ url: ceTaskUrl, token })

    if (!task) {
      throw new Error("Malformed Sonar CE task response")
    }

    if (task.status === "SUCCESS") {
      return task
    }

    if (task.status === "FAILED" || task.status === "CANCELED") {
      throw new Error(
        `Sonar CE task did not complete successfully: ${task.status}`,
      )
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(`Timed out waiting for Sonar CE task after ${MAX_WAIT_MS}ms`)
}

const main = async () => {
  const token = process.env.SONAR_TOKEN

  if (!token) {
    throw new Error("SONAR_TOKEN is required")
  }

  let reportTask

  try {
    reportTask = await parseReportTask()
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("report-task.txt")
    ) {
      throw error
    }
  }

  const properties = await parseProjectProperties()

  const projectKey =
    process.env.SONAR_PROJECT_KEY ??
    reportTask?.projectKey ??
    properties["sonar.projectKey"]

  if (!projectKey) {
    throw new Error(
      "Missing project key. Set SONAR_PROJECT_KEY or sonar.projectKey in sonar-project.properties",
    )
  }

  const host = normalizeHost(
    process.env.SONAR_HOST_URL ??
      reportTask?.serverUrl ??
      properties["sonar.host.url"] ??
      "https://sonarcloud.io",
  )

  if (!host) {
    throw new Error(
      "SONAR_HOST_URL is required when report task serverUrl is unavailable",
    )
  }

  let ceTask

  if (reportTask?.ceTaskUrl) {
    ceTask = await waitForCeTask({ ceTaskUrl: reportTask.ceTaskUrl, token })
  } else {
    console.log(
      "No .scannerwork/report-task.txt found. Assuming automatic analysis mode and checking project quality gate directly.",
    )
  }

  const qualityGateUrl = `${host}/api/qualitygates/project_status?projectKey=${encodeURIComponent(projectKey)}`
  const quality = await sonarRequest({ url: qualityGateUrl, token })

  const status = quality?.projectStatus?.status

  if (!status) {
    throw new Error("Malformed quality gate response")
  }

  if (ceTask) {
    console.log(`Sonar CE task: ${ceTask.status}`)
  }

  console.log(`Quality gate status: ${status}`)

  if (reportTask?.dashboardUrl) {
    console.log(`Dashboard: ${reportTask.dashboardUrl}`)
  } else {
    console.log(
      `Dashboard: ${host}/summary/new_code?id=${encodeURIComponent(projectKey)}`,
    )
  }

  if (status !== "OK") {
    throw new Error(`Quality gate failed: ${status}`)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
