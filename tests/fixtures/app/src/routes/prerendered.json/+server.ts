import { json } from '@sveltejs/kit';
export const prerender = true;
export const GET = () => json({ message: 'prerender endpoint' });
