import { installFizzChromeDebugger } from "@tdreyno/fizz-chrome-debugger"

const installedDebugger = installFizzChromeDebugger()

const uninstall = () => {
  installedDebugger.uninstall()
}

globalThis.addEventListener("pagehide", uninstall, { once: true })
