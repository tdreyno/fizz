import type { Enter } from "../action"
import { createInitialContext } from "../context"
import { createMachine } from "../createMachine"
import { noop } from "../effect"
import { matchesSelectorWhen, runStateSelector, selectWhen } from "../selectors"
import { state } from "../state"

const expectNumber = (value: number): number => value
const expectString = (value: string): string => value

describe("selectors", () => {
  test("defaults to undefined when function selector state does not match", () => {
    const Editing = state<Enter, { readOnly: boolean }>(
      {
        Enter: noop,
      },
      { name: "Editing" },
    )

    const Viewing = state<Enter, { archived: boolean }>(
      {
        Enter: noop,
      },
      { name: "Viewing" },
    )

    const selector = selectWhen(Editing, data => !data.readOnly)
    const viewingContext = createInitialContext([Viewing({ archived: true })])
    const selectedValue = runStateSelector(
      selector,
      viewingContext.currentState,
      viewingContext,
    )
    const typedSelectedValue: boolean | undefined = selectedValue

    expect(typedSelectedValue).toBeUndefined()
  })

  test("runs selected branch for matching state and returns undefined for non-matching state", () => {
    const Editing = state<Enter, { readOnly: boolean }>(
      {
        Enter: noop,
      },
      { name: "Editing" },
    )

    const Viewing = state<Enter, { archived: boolean }>(
      {
        Enter: noop,
      },
      { name: "Viewing" },
    )

    const selector = selectWhen(Editing, data => !data.readOnly)

    const editingContext = createInitialContext([Editing({ readOnly: false })])
    const viewingContext = createInitialContext([Viewing({ archived: true })])

    expect(
      runStateSelector(selector, editingContext.currentState, editingContext),
    ).toBe(true)
    expect(
      runStateSelector(selector, viewingContext.currentState, viewingContext),
    ).toBeUndefined()

    const typedSelectedValue: boolean | undefined = runStateSelector(
      selector,
      viewingContext.currentState,
      viewingContext,
    )

    expect(typedSelectedValue).toBeUndefined()
  })

  test("supports multi-state narrowing with selectWhen", () => {
    const Editing = state<Enter, { readOnly: boolean }>(
      {
        Enter: noop,
      },
      { name: "Editing" },
    )

    const Reviewing = state<Enter, { reviewer: string }>(
      {
        Enter: noop,
      },
      { name: "Reviewing" },
    )

    const selector = selectWhen(
      [Editing, Reviewing] as const,
      (_data, state) => {
        if (state.is(Editing)) {
          const value = expectNumber(Number(state.data.readOnly))

          return value
        }

        const value = expectString(state.data.reviewer)

        return value.length
      },
    )

    const editingState = Editing({ readOnly: true })

    expect(matchesSelectorWhen(editingState, selector.when)).toBe(true)
  })

  test("supports matcher-object shorthand in the second selectWhen argument", () => {
    const Editing = state<Enter, { readOnly: boolean }>(
      {
        Enter: noop,
      },
      { name: "Editing" },
    )

    const Viewing = state<Enter, { archived: boolean }>(
      {
        Enter: noop,
      },
      { name: "Viewing" },
    )

    const selector = selectWhen(Editing, { readOnly: false })

    const editingContext = createInitialContext([Editing({ readOnly: false })])
    const viewingContext = createInitialContext([Viewing({ archived: true })])

    const editingValue = runStateSelector(
      selector,
      editingContext.currentState,
      editingContext,
    )
    const viewingValue = runStateSelector(
      selector,
      viewingContext.currentState,
      viewingContext,
    )

    expect(editingValue).toBe(true)
    expect(viewingValue).toBe(false)

    const typedValue: boolean = editingValue

    expect(typedValue).toBe(true)
  })

  test("accepts unary data predicates directly as selector functions", () => {
    const Editing = state<Enter, { label: string; readOnly: boolean }>(
      {
        Enter: noop,
      },
      { name: "Editing" },
    )

    const isInteractive = (data: { label: string }): boolean =>
      data.label === "Interactive"

    const selector = selectWhen(Editing, isInteractive)
    const context = createInitialContext([
      Editing({ label: "Interactive", readOnly: false }),
    ])

    expect(runStateSelector(selector, context.currentState, context)).toBe(true)
  })

  test("supports colocated selectors on createMachine definitions", () => {
    const Editing = state<Enter, { readOnly: boolean }>(
      {
        Enter: noop,
      },
      { name: "Editing" },
    )

    const Viewing = state<Enter, { archived: boolean }>(
      {
        Enter: noop,
      },
      { name: "Viewing" },
    )

    const machine = createMachine({
      selectors: {
        isEditable: selectWhen(Editing, data => !data.readOnly),
      },
      states: { Editing, Viewing },
    })

    const context = createInitialContext([Editing({ readOnly: false })])

    expect(
      runStateSelector(
        machine.selectors.isEditable,
        context.currentState,
        context,
      ),
    ).toBe(true)
  })
})
