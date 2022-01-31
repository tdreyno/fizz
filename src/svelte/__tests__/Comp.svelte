<script lang="ts">
	import { machine } from './machine';
</script>

<!-- svelte-ignore a11y-unknown-role -->
<div role="name">{$machine.currentState.name}</div>