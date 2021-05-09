export const arraySingleton = <T>(
  value: T | Array<T> | undefined | null | void,
): Array<T> => (value ? (Array.isArray(value) ? value : [value]) : [])

export const isNotEmpty = <T>(
  arr: T[],
): arr is { pop(): T; shift(): T } & Array<T> => arr.length > 0
