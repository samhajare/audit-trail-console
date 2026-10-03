export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  )
    return '/';
  const url = new URL(value, window.location.origin);
  if (url.origin !== window.location.origin || url.pathname === '/login')
    return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}
