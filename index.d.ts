import type { Adapter } from '@sveltejs/kit';
import type { AdapterOptions } from './options.js';
import './ambient.js';

export type { AdapterOptions } from './options.js';

export default function adapter(options?: AdapterOptions): Adapter;
