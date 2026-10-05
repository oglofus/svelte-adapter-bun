<script lang="ts">
  import { onDestroy, setContext } from 'svelte';
  import Child from '../lib/Child.svelte';

  let { data } = $props();
  const state = { rendered: 0, destroyed: 0 };
  setContext('request', state);
  onDestroy(() => {
    state.destroyed += 1;
    if (state.rendered !== 1 || state.destroyed !== 1) {
      throw new Error('Duplicate SSR context or lifecycle state');
    }
  });
</script>

<svelte:head><title>Adapter integration</title></svelte:head>
<h1>Hello {data.name}</h1>
<Child />
