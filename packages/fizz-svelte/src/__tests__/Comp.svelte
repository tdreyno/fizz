<script lang="ts">
  import { LoadingMachine } from "@tdreyno/fizz"
  import { machine } from "./machine"

  machine.respondOnMount("Hello", LoadingMachine.Actions.world)
</script>

<div data-testid="didWorld">
  {$machine.currentState.data[0].didWorld ? "true" : "false"}
</div>

<div data-testid="name">{$machine.currentState.name}</div>
