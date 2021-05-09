export const arraySingleton = <T>(
  value: T | Array<T> | undefined | null | void,
): Array<T> => (value ? (Array.isArray(value) ? value : [value]) : [])
