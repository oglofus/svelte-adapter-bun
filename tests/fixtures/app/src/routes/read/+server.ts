import { read } from '$app/server';
import text from '../../lib/imported.txt?url';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => read(text);
