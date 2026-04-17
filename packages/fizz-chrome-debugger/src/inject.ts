import { installFizzChromeDebugger } from "./bridge.js"

const installedDebugger = installFizzChromeDebugger()

const uninstall = () => {
  installedDebugger.uninstall()
}

globalThis.addEventListener("pagehide", uninstall, { once: true })
