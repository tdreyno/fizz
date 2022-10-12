export function timeout(ts: number) {
  return new Promise<void>(resolve => setTimeout(() => resolve(), ts))
}
