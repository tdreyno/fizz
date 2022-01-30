/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import "@testing-library/jest-dom/extend-expect"
import { render, fireEvent } from "@testing-library/svelte"
import Comp from "./Comp.svelte"

describe("Svelte integration", () => {
  test("Pending", async () => {
    const { getByText } = render(Comp, { name: "World" })
    const button = getByText("Button")

    // Using await when firing events is unique to the svelte testing library because
    // we have to wait for the next `tick` so that Svelte flushes all pending state changes.
    await fireEvent.click(button)

    expect(button).toHaveTextContent("Button Clicked")
  })
})
