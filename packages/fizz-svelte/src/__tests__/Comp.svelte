<script lang="ts">
  import { Actions, machine } from "./machine"

  machine.respondOnMount("Hello", Actions.world)
</script>

<div data-testid="didWorld">
  {$machine.currentState.data.didWorld ? "true" : "false"}
</div>

<div data-testid="name">{$machine.currentState.name}</div>
