import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
  name: url.searchParams.get('name') ?? 'visitor',
});
