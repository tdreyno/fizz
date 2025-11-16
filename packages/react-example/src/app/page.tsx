"use client"

import { useTestMachine } from "../machines/test"

const Page = () => {
  const { currentState, actions } = useTestMachine()

  return (
    <div>
      <h1>{currentState.name}</h1>
      <button onClick={() => actions.world()}>World</button>
      <code>{JSON.stringify(currentState.data, null, 2)}</code>
    </div>
  )
}

export default Page
