import { createRoot } from "react-dom/client"

import { App } from "./App.js"

const rootElement = document.querySelector<HTMLDivElement>("#app")

if (!rootElement) {
  throw new Error("Missing #app root")
}

createRoot(rootElement).render(<App />)
