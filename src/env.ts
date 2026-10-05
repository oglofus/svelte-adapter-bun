import { envPrefix } from 'svelte-adapter-bun:manifest';

const expected = new Set([
  'SOCKET_PATH',
  'HOST',
  'PORT',
  'ORIGIN',
  'XFF_DEPTH',
  'ADDRESS_HEADER',
  'PROTOCOL_HEADER',
  'HOST_HEADER',
  'PORT_HEADER',
  'BODY_SIZE_LIMIT',
  'IDLE_TIMEOUT',
]);

if (envPrefix) {
  for (const name in Bun.env) {
    if (name.startsWith(envPrefix)) {
      const unprefixed = name.slice(envPrefix.length);
      if (!expected.has(unprefixed)) {
        throw new Error(
          `You should change envPrefix (${envPrefix}) to avoid conflicts with existing environment variables — unexpectedly saw ${name}`
        );
      }
    }
  }
}

export function env(name: string, fallback = '') {
  const prefixed = envPrefix + name;
  return Bun.env[prefixed] ?? fallback;
}
