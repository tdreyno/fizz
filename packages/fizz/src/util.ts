export const arraySingleton = <T>(
  value: T | Array<T> | undefined | null | void,
): Array<T> => {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

export type ExternalPromise<T> = {
  promise: Promise<T>
  resolve: (t: T) => void
  reject: (e: unknown) => void
}

export const externalPromise = <T>(): ExternalPromise<T> => {
  let resolver: (t: T) => void = () => void 0
  let rejecter: (e: unknown) => void = () => void 0

  const promise = new Promise<T>((resolve, reject) => {
    resolver = resolve
    rejecter = reject
  })

  return {
    promise,
    resolve: resolver,
    reject: rejecter,
  }
}
