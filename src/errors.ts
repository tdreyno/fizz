export class MissingCurrentState extends Error {}

export class UnknownStateReturnType<
  T extends { toString(): string },
> extends Error {
  constructor(public item: T) {
    super(`Returned an known effect type: ${item.toString()}`)
  }
}
