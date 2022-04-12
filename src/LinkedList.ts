class ListItem<T> {
  prev: ListItem<T> | undefined
  next: ListItem<T> | undefined

  constructor(public value: T) {}

  static from<T>(value: T) {
    return new ListItem(value)
  }
}

export class LinkedList<T> implements Iterable<T> {
  head: ListItem<T> | undefined
  tail: ListItem<T> | undefined

  constructor(values: T[] = []) {
    for (const value of values) {
      this.push(value)
    }
  }

  isEmpty(): boolean {
    return !this.head
  }

  push(value: T): void {
    const oldTail = this.tail

    const newTail = ListItem.from(value)

    if (oldTail) {
      oldTail.next = newTail
      newTail.prev = oldTail
    }

    this.tail = newTail

    if (!this.head) {
      this.head = newTail
    }
  }

  pop(): T | undefined {
    if (!this.tail) {
      return
    }

    const oldTail = this.tail
    const newTail = oldTail.prev

    if (newTail) {
      newTail.next = undefined
    }

    this.tail = newTail

    if (this.head === oldTail) {
      this.head = undefined
    }

    return oldTail.value
  }

  unshift(value: T): void {
    const oldHead = this.head

    const newHead = ListItem.from(value)

    if (oldHead) {
      newHead.next = oldHead
      oldHead.prev = newHead
    }

    this.head = newHead

    if (!this.tail) {
      this.tail = newHead
    }
  }

  shift(): T | undefined {
    if (!this.head) {
      return
    }

    const oldHead = this.head
    const newHead = oldHead.next

    if (newHead) {
      newHead.prev = undefined
    }

    this.head = newHead

    if (this.tail === oldHead) {
      this.tail = undefined
    }

    return oldHead.value
  }

  prefix(values: T[]): void {
    const list = LinkedList.from(values)

    if (list.isEmpty()) {
      return
    }

    const newHead = list.head
    const newTail = list.tail

    const oldHead = this.head

    this.head = newHead

    if (oldHead) {
      oldHead.prev = newTail
    }

    if (newTail) {
      newTail.next = oldHead
    }

    if (!this.tail) {
      this.tail = newTail
    }
  }

  postfix(values: T[]): void {
    const list = LinkedList.from(values)

    if (list.isEmpty()) {
      return
    }

    const newHead = list.head
    const newTail = list.tail

    const oldTail = this.tail

    this.tail = newTail

    if (oldTail) {
      oldTail.next = newHead
    }

    if (newHead) {
      newHead.prev = oldTail
    }

    if (!this.head) {
      this.head = newHead
    }
  }

  [Symbol.iterator](): Iterator<T> {
    let node = this.head

    return {
      next: () => {
        if (!node) {
          return { done: true, value: undefined }
        }

        const value = node.value
        node = node.next

        return { done: false, value }
      },
    }
  }

  toArray(): Array<T> {
    return Array.from(this)
  }

  clear() {
    this.head = this.tail = undefined
  }

  // map<T2>(fn: (value: T, index: number, items: T[]) => T2): LinkedList<T2> {
  //   return LinkedList.from(this.toArray().map(fn))
  // }

  // flatMap<T2>(
  //   fn: (value: T, index: number, items: T[]) => T2[],
  // ): LinkedList<T2> {
  //   return LinkedList.from(this.toArray().flatMap(fn))
  // }

  // filter(fn: (value: T, index: number, items: T[]) => unknown): LinkedList<T> {
  //   return LinkedList.from(this.toArray().filter(fn))
  // }

  static from<T>(items: T[]) {
    return new LinkedList(items)
  }

  static empty<T = unknown>() {
    return LinkedList.from<T>([])
  }
}
