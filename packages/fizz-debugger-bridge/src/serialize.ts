export type FizzDebuggerSerializedValue =
  | null
  | boolean
  | number
  | string
  | FizzDebuggerSerializedArray
  | FizzDebuggerSerializedObject

export type FizzDebuggerSerializedArray = Array<FizzDebuggerSerializedValue>

export type FizzDebuggerSerializedObject = {
  [key: string]: FizzDebuggerSerializedValue
}

type SerializeState = {
  seen: WeakSet<object>
}

const serializeError = (value: Error): FizzDebuggerSerializedObject => ({
  name: value.name,
  message: value.message,
  stack: value.stack ?? null,
})

const createSerializeState = (): SerializeState => ({
  seen: new WeakSet<object>(),
})

const serializePrimitive = (
  value: bigint | boolean | number | string | symbol | undefined,
): FizzDebuggerSerializedValue => {
  if (typeof value === "bigint") {
    return `${value.toString()}n`
  }

  if (typeof value === "symbol") {
    return value.description ? `Symbol(${value.description})` : "Symbol()"
  }

  if (value === undefined) {
    return "[Undefined]"
  }

  return value
}

const serializeObject = (
  value: object,
  state: SerializeState,
): FizzDebuggerSerializedValue => {
  if (state.seen.has(value)) {
    return "[Circular]"
  }

  state.seen.add(value)

  if (value instanceof Error) {
    return serializeError(value)
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map(item => serializeForDebugger(item, state))
  }

  return Object.entries(value).reduce<FizzDebuggerSerializedObject>(
    (sum, [key, entry]) => ({
      ...sum,
      [key]: serializeForDebugger(entry, state),
    }),
    {},
  )
}

export const serializeForDebugger = (
  value: unknown,
  state: SerializeState = createSerializeState(),
): FizzDebuggerSerializedValue => {
  if (value === null) {
    return null
  }

  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string" ||
    value === undefined ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return serializePrimitive(value)
  }

  if (typeof value === "function") {
    return value.name ? `[Function ${value.name}]` : "[Function anonymous]"
  }

  if (typeof value === "object") {
    return serializeObject(value, state)
  }

  return "[Unserializable]"
}
