import { SECRET } from '$app/env/private';
import type { Handle } from '@sveltejs/kit/hooks';

// This import captures its value when the hooks module is evaluated.
export const handle: Handle = () => Response.json({ secret: SECRET });
