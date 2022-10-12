import { stateWithNested } from "../../../../state"
import type { CompletedForm } from "../../actions"
import { setName } from "./actions"
import FormInvalid from "./states/FormInvalid"
import Complete from "../Complete"

export default stateWithNested<
  CompletedForm,
  {
    targetName: string
  }
>(
  {
    CompletedForm() {
      return Complete()
    },
  },
  FormInvalid({ name: "" }),
  {
    SetName: setName,
  },
  { name: "Entry" },
)
