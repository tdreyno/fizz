import { LinkedList } from "../LinkedList"

describe("LinkedList", () => {
  describe("from", () => {
    it("should handle to empty list", () => {
      expect(LinkedList.from([]).toArray()).toEqual([])
    })

    it("should handle single item", () => {
      const list = LinkedList.from([1])
      expect(list.head).toBe(list.tail)
    })

    it("should handle list of numbers", () => {
      const list = LinkedList.from([1, 2, 3])
      expect(list.toArray()).toEqual([1, 2, 3])
    })
  })

  describe("isEmpty", () => {
    it("should know if a list is not empty", () => {
      const list = LinkedList.from([1, 2, 3])
      expect(list.isEmpty()).toBeFalsy()
    })

    it("should know if a list is empty", () => {
      const list = LinkedList.empty()
      expect(list.isEmpty()).toBeTruthy()
    })
  })

  describe("clear", () => {
    it("should clear empty list", () => {
      const list = LinkedList.empty()
      list.clear()
      expect(list.toArray()).toEqual([])
    })

    it("should clear one-item list", () => {
      const list = LinkedList.from([1])
      list.clear()
      expect(list.toArray()).toEqual([])
    })

    it("should clear longer list", () => {
      const list = LinkedList.from([1, 2, 3])
      list.clear()
      expect(list.toArray()).toEqual([])
    })
  })

  describe("push", () => {
    it("should push into empty list", () => {
      const list = LinkedList.empty<number>()
      list.push(5)
      expect(list.toArray()).toEqual([5])
    })

    it("should push into one-item list", () => {
      const list = LinkedList.from<number>([1])
      list.push(5)
      expect(list.toArray()).toEqual([1, 5])
    })

    it("should push into longer list", () => {
      const list = LinkedList.from<number>([1, 2])
      list.push(5)
      expect(list.toArray()).toEqual([1, 2, 5])
    })
  })

  describe("pop", () => {
    it("should pop from empty list", () => {
      const list = LinkedList.empty<number>()
      const result = list.pop()
      expect(result).toEqual(undefined)
      expect(list.toArray()).toEqual([])
    })

    it("should pop from one-item list", () => {
      const list = LinkedList.from<number>([5])
      const result = list.pop()
      expect(result).toEqual(5)
      expect(list.toArray()).toEqual([])
    })

    it("should pop from longer list", () => {
      const list = LinkedList.from<number>([4, 5])
      const result = list.pop()
      expect(result).toEqual(5)
      expect(list.toArray()).toEqual([4])
    })
  })

  describe("unshift", () => {
    it("should unshift into empty list", () => {
      const list = LinkedList.empty<number>()
      list.unshift(5)
      expect(list.toArray()).toEqual([5])
    })

    it("should unshift into one-item list", () => {
      const list = LinkedList.from<number>([1])
      list.unshift(5)
      expect(list.toArray()).toEqual([5, 1])
    })

    it("should unshift into longer list", () => {
      const list = LinkedList.from<number>([1, 2])
      list.unshift(5)
      expect(list.toArray()).toEqual([5, 1, 2])
    })
  })

  describe("shift", () => {
    it("should shift from empty list", () => {
      const list = LinkedList.empty<number>()
      const result = list.shift()
      expect(result).toEqual(undefined)
      expect(list.toArray()).toEqual([])
    })

    it("should shift from one-item list", () => {
      const list = LinkedList.from<number>([5])
      const result = list.shift()
      expect(result).toEqual(5)
      expect(list.toArray()).toEqual([])
    })

    it("should shift from longer list", () => {
      const list = LinkedList.from<number>([5, 4])
      const result = list.shift()
      expect(result).toEqual(5)
      expect(list.toArray()).toEqual([4])
    })
  })

  describe("prefix", () => {
    it("should prefix empty list into empty list", () => {
      const list = LinkedList.empty<number>()
      list.prefix([])
      expect(list.toArray()).toEqual([])
    })

    it("should prefix one-item into empty list", () => {
      const list = LinkedList.empty<number>()
      list.prefix([5])
      expect(list.toArray()).toEqual([5])
    })

    it("should prefix longer list into empty list", () => {
      const list = LinkedList.empty<number>()
      list.prefix([5, 4, 3])
      expect(list.toArray()).toEqual([5, 4, 3])
    })

    it("should prefix empty list into one-item list", () => {
      const list = LinkedList.from<number>([1])
      list.prefix([])
      expect(list.toArray()).toEqual([1])
    })

    it("should prefix one-item into one-item list", () => {
      const list = LinkedList.from<number>([1])
      list.prefix([5])
      expect(list.toArray()).toEqual([5, 1])
    })

    it("should prefix longer list into one-item list", () => {
      const list = LinkedList.from<number>([1])
      list.prefix([5, 4, 3])
      expect(list.toArray()).toEqual([5, 4, 3, 1])
    })

    it("should prefix empty list into longer list", () => {
      const list = LinkedList.from<number>([1, 2, 3])
      list.prefix([])
      expect(list.toArray()).toEqual([1, 2, 3])
    })

    it("should prefix one-item into longer list", () => {
      const list = LinkedList.from<number>([1, 2, 3])
      list.prefix([5])
      expect(list.toArray()).toEqual([5, 1, 2, 3])
    })

    it("should prefix longer list into longer list", () => {
      const list = LinkedList.from<number>([1, 2, 3])
      list.prefix([5, 4, 3])
      expect(list.toArray()).toEqual([5, 4, 3, 1, 2, 3])
    })
  })

  describe("postfix", () => {
    it("should postfix empty list into empty list", () => {
      const list = LinkedList.empty<number>()
      list.postfix([])
      expect(list.toArray()).toEqual([])
    })

    it("should postfix one-item into empty list", () => {
      const list = LinkedList.empty<number>()
      list.postfix([5])
      expect(list.toArray()).toEqual([5])
    })

    it("should postfix longer list into empty list", () => {
      const list = LinkedList.empty<number>()
      list.postfix([5, 4, 3])
      expect(list.toArray()).toEqual([5, 4, 3])
    })

    it("should postfix empty list into one-item list", () => {
      const list = LinkedList.from<number>([1])
      list.postfix([])
      expect(list.toArray()).toEqual([1])
    })

    it("should postfix one-item into one-item list", () => {
      const list = LinkedList.from<number>([1])
      list.postfix([5])
      expect(list.toArray()).toEqual([1, 5])
    })

    it("should postfix longer list into one-item list", () => {
      const list = LinkedList.from<number>([1])
      list.postfix([5, 4, 3])
      expect(list.toArray()).toEqual([1, 5, 4, 3])
    })

    it("should postfix empty list into longer list", () => {
      const list = LinkedList.from<number>([1, 2, 3])
      list.postfix([])
      expect(list.toArray()).toEqual([1, 2, 3])
    })

    it("should postfix one-item into longer list", () => {
      const list = LinkedList.from<number>([1, 2, 3])
      list.postfix([5])
      expect(list.toArray()).toEqual([1, 2, 3, 5])
    })

    it("should postfix longer list into longer list", () => {
      const list = LinkedList.from<number>([1, 2, 3])
      list.postfix([5, 4, 3])
      expect(list.toArray()).toEqual([1, 2, 3, 5, 4, 3])
    })
  })
})
