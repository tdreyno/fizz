export class WaitUntilAbortError extends Error {
  override readonly name = "WaitUntilAbortError"

  constructor(message = "waitUntil was aborted") {
    super(message)
  }
}

export class WaitUntilTimeoutError extends Error {
  override readonly name = "WaitUntilTimeoutError"

  constructor(public readonly timeoutMs: number) {
    super(`waitUntil timed out after ${timeoutMs}ms`)
  }
}

export class RuntimeDisconnectedError extends Error {
  override readonly name = "RuntimeDisconnectedError"

  constructor(message = "Runtime was disconnected before waitUntil resolved") {
    super(message)
  }
}
