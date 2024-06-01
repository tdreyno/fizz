<script lang="ts">
  import { world } from "../../__tests__/loadingMachine/core/actions"
  import { machine } from "./machine"

  machine.respondOnMount("Hello", world)
</script>

<div data-testid="didWorld">
  {$machine.currentState.data[0].didWorld ? "true" : "false"}
</div>

<div data-testid="name">{$machine.currentState.name}</div>
