import { write } from 'bun';

// The adapter already builds the Bun server. Only add deployment packaging;
// keep index.js, client and prerendered in the standard SvelteKit build layout.
const entrypoint = `#!/bin/sh
set -eu
rm -rf /home/bun/public/* /home/bun/public/.[!.]* /home/bun/public/..?*
cp -R /home/bun/app/client /home/bun/app/prerendered /home/bun/public/
echo ">> Updated public volume <<"
exec "$@"`;

await write('./build/entrypoint.sh', entrypoint);
