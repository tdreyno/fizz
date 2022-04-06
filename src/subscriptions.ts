import { Action, onFrame } from "./action.js"

import { Subscription } from "@tdreyno/pretty-please"

export { Subscription }

export const onFrameSubscription = <A extends Action<any, any>>(
  actionCreator: (ts: number) => A = ts => onFrame(ts) as unknown as A,
): Subscription<A> => {
  const sub = new Subscription<A>()

  let shouldContinue = false

  const tick = (ts: number) => {
    if (!shouldContinue) {
      return
    }

    void sub.emit(actionCreator(ts))

    requestAnimationFrame(tick)
  }

  sub.onStatusChange(status => {
    switch (status) {
      case "active":
        shouldContinue = true
        tick(performance.now())
        break

      case "inactive":
        shouldContinue = false
        break
    }
  })

  return sub
}

export const onDOMEventSubscription = <A extends Action<any, any>>(
  element: Window | Element,
  eventName: string,
  actionCreator: (e: Event) => A | void,
): Subscription<A> => {
  const sub = new Subscription<A>()

  function onEvent(e: Event) {
    const result = actionCreator(e)

    if (result !== undefined) {
      void sub.emit(result)
    }
  }

  sub.onStatusChange(status => {
    switch (status) {
      case "active":
        element.addEventListener(eventName, onEvent)
        break

      case "inactive":
        element.removeEventListener(eventName, onEvent)
        break
    }
  })

  return sub
}
