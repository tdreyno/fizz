import { stateWithNested } from "../../../../nested"
import type { CompletedForm } from "../../actions"
import Complete from "../Complete"
import { setName } from "./actions"
import FormInvalid from "./states/FormInvalid"

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
