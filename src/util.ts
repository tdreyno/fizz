export const arraySingleton = <T>(
  value: T | Array<T> | undefined | null | void,
): Array<T> => (value ? (Array.isArray(value) ? value : [value]) : [])

export const isNotEmpty = <T>(
  arr: T[],
): arr is { pop(): T; shift(): T } & Array<T> => arr.length > 0

export type ExternalPromise<T> = {
  promise: Promise<T>
  resolve: (t: T) => void
  reject: (e: any) => void
}

export const externalPromise = <T>(): ExternalPromise<T> => {
  let resolver: (t: T) => void = () => void 0
  let rejecter: (e: any) => void = () => void 0

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
