export const prerender = true;
export const trailingSlash = 'always';

export const load = async ({ fetch }) => {
  const response = await fetch('/base/dependency.json');
  return { message: (await response.json()).message };
};
