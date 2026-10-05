import { resolve } from 'node:path';
import { name } from '../package.json';

const example = Bun.argv[2];
if (!example || !['demo', 'nginx', 'websocket'].includes(example)) {
  throw new Error('Usage: bun run example:install <demo|nginx|websocket>');
}

const cwd = resolve(import.meta.dir, '../examples', example);
const pkg = await Bun.file(resolve(cwd, 'package.json')).json();
const dependency = pkg.devDependencies[name];
if (typeof dependency !== 'string' || !dependency.startsWith('file:')) {
  throw new Error(`Expected a local archive dependency for ${name}`);
}
if (!(await Bun.file(resolve(cwd, dependency.slice(5))).exists())) {
  throw new Error('Run bun run pack before installing an example');
}

// Bun 1.4.2 reuses the locked integrity/cache for replaced file tarballs, even
// with --force. Remove and re-add only the adapter to refresh its integrity
// without upgrading the example's other dependencies.
// Skip prepare here: Docker installs manifests before copying app sources.
for (const args of [
  ['remove', '--ignore-scripts', name],
  ['add', '--ignore-scripts', '-d', `${name}@${dependency}`],
]) {
  const result = Bun.spawnSync([process.execPath, ...args], {
    cwd,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
