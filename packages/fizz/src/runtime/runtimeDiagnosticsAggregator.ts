import type { RuntimeDiagnosticsSnapshot } from "./runtimeContracts.js"

type RuntimeResourceDiagnosticsEntry =
  RuntimeDiagnosticsSnapshot["resources"][number]
type RuntimeListenerDiagnosticsEntry =
  RuntimeDiagnosticsSnapshot["listeners"][number]

type RuntimeDiagnosticsSources = {
  asyncOps: () => RuntimeDiagnosticsSnapshot["asyncOps"]
  channelQueues: () => RuntimeDiagnosticsSnapshot["channelQueues"]
  resources: () => RuntimeDiagnosticsSnapshot["resources"]
  timers: () => RuntimeDiagnosticsSnapshot["timers"]
}

const startsWithListenerPrefix = (key: string): boolean =>
  key.startsWith("dom:listen:")

const parseListenerResource = (
  resourceKey: string,
): { target: string; type: string } | undefined => {
  if (!startsWithListenerPrefix(resourceKey)) {
    return undefined
  }

  const segments = resourceKey.split(":")

  if (segments.length < 5) {
    return {
      target: "unknown",
      type: "unknown",
    }
  }

  if (segments[2] === "group") {
    return {
      target: "group",
      type: segments[3] ?? "unknown",
    }
  }

  const type = segments.at(-2) ?? "unknown"
  const target = segments.slice(2, -2).join(":") || "unknown"

  return {
    target,
    type,
  }
}

const toListenerDiagnostics = (
  resources: RuntimeResourceDiagnosticsEntry[],
): RuntimeListenerDiagnosticsEntry[] => {
  const counts = new Map<string, number>()

  resources.forEach(resource => {
    const parsed = parseListenerResource(resource.key)

    if (!parsed) {
      return
    }

    const key = `${parsed.target}:${parsed.type}`

    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  return [...counts.entries()]
    .map(([key, count]) => {
      const separator = key.lastIndexOf(":")

      if (separator < 0) {
        return {
          count,
          target: key,
          type: "unknown",
        }
      }

      return {
        count,
        target: key.slice(0, separator),
        type: key.slice(separator + 1),
      }
    })
    .sort((a, b) => {
      if (a.target === b.target) {
        return a.type.localeCompare(b.type)
      }

      return a.target.localeCompare(b.target)
    })
}

export const buildRuntimeDiagnosticsSnapshot = (
  sources: RuntimeDiagnosticsSources,
): RuntimeDiagnosticsSnapshot => {
  const resources = sources.resources()

  return {
    asyncOps: sources.asyncOps(),
    channelQueues: sources.channelQueues(),
    listeners: toListenerDiagnostics(resources),
    resources,
    timers: sources.timers(),
  }
}
