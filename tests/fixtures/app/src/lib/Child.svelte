<script lang="ts">
  import { getContext } from 'svelte';
  const state = getContext<{ rendered: number; destroyed: number }>('request');
  state.rendered += 1;
</script>

<span>child-render:{state.rendered}</span>
