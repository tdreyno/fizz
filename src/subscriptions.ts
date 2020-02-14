import { Subscription } from "@tdreyno/pretty-please";
import { Action, onFrame } from "./action";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onFrameSubscription<A extends Action<any>>(
  actionCreator: (ts: number) => A = ts => (onFrame(ts) as unknown) as A,
): Subscription<A> {
  const sub = new Subscription<A>();

  let shouldContinue = false;

  function tick(ts: number) {
    if (!shouldContinue) {
      return;
    }

    sub.emit(actionCreator(ts));

    requestAnimationFrame(tick);
  }

  sub.onStatusChange(status => {
    switch (status) {
      case "active":
        shouldContinue = true;
        tick(performance.now());
        break;

      case "inactive":
        shouldContinue = false;
        break;
    }
  });

  return sub;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onDOMEventSubscription<A extends Action<any>>(
  element: Window | Element,
  eventName: string,
  actionCreator: (e: Event) => A | void,
): Subscription<A> {
  const sub = new Subscription<A>();

  function onEvent(e: Event) {
    const result = actionCreator(e);

    if (result !== undefined) {
      sub.emit(result);
    }
  }

  sub.onStatusChange(status => {
    switch (status) {
      case "active":
        element.addEventListener(eventName, onEvent);
        break;

      case "inactive":
        element.removeEventListener(eventName, onEvent);
        break;
    }
  });

  return sub;
}
