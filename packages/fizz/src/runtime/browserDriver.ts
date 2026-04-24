export type BrowserConfirmResult = "accept" | "reject" | boolean

export type RuntimeBrowserDriver = {
  alert?: (message: string) => void | Promise<void>
  confirm?: (
    message: string,
  ) => BrowserConfirmResult | Promise<BrowserConfirmResult>
  copyToClipboard?: (text: string) => void | Promise<void>
  historyBack?: () => void | Promise<void>
  historyForward?: () => void | Promise<void>
  historyGo?: (delta: number) => void | Promise<void>
  locationAssign?: (url: string) => void | Promise<void>
  locationReload?: () => void | Promise<void>
  locationReplace?: (url: string) => void | Promise<void>
  openUrl?: (
    url: string,
    target?: string,
    features?: string,
  ) => void | Promise<void>
  postMessage?: (
    message: unknown,
    targetOrigin: string,
    transfer?: Transferable[],
  ) => void | Promise<void>
  printPage?: () => void | Promise<void>
  prompt?: (message: string) => string | null | Promise<string | null>
}
