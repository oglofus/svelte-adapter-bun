<script lang="ts">
  import { onMount } from 'svelte';

  onMount(() => {
    const url = new URL('/ws', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    socket.onmessage = event => {
      document.querySelector('pre')!.textContent += event.data + '\n';
    };
    socket.onopen = () => {
      document.querySelector('pre')!.textContent += 'Connected to server\n';
    };
    socket.onclose = () => {
      document.querySelector('pre')!.textContent +=
        'Disconnected from server\n';
    };
    socket.onerror = () => {
      document.querySelector('pre')!.textContent += 'WebSocket connection failed\n';
    };
    return () => socket.close();
  });
</script>

<h1>Welcome to SvelteKit</h1>
<p>
  Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the
  documentation
</p>

<pre></pre>
