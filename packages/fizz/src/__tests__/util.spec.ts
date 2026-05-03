import { describe, expect, test } from "@jest/globals"

import { arraySingleton, externalPromise } from "../util.js"

describe("util", () => {
  describe("arraySingleton", () => {
    test("returns an empty array for empty-ish values", () => {
      expect(arraySingleton(undefined)).toEqual([])
      expect(arraySingleton(null)).toEqual([])
      expect(arraySingleton(0)).toEqual([])
      expect(arraySingleton("")).toEqual([])
      expect(arraySingleton(false)).toEqual([])
    })

    test("returns the value wrapped when value is non-array", () => {
      expect(arraySingleton("ok")).toEqual(["ok"])
      expect(arraySingleton(1)).toEqual([1])
    })

    test("returns the same array shape when value is an array", () => {
      expect(arraySingleton([1, 2, 3])).toEqual([1, 2, 3])
    })
  })

  describe("externalPromise", () => {
    test("resolves through exported resolve", async () => {
      const pending = externalPromise<number>()

      pending.resolve(42)

      await expect(pending.promise).resolves.toBe(42)
    })

    test("rejects through exported reject", async () => {
      const pending = externalPromise<number>()

      pending.reject(new Error("boom"))

      await expect(pending.promise).rejects.toThrow("boom")
    })
  })
})
