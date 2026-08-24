const DEFAULT_REDIRECT = '/dashboard';
const LOGIN_REDIRECT = '/login';

export function getValidatedRedirect(redirectPath: unknown): string {
  if (typeof redirectPath !== 'string' || redirectPath.length === 0) {
    return DEFAULT_REDIRECT;
  }

  const pathComponent = redirectPath.split(/[?#]/, 1)[0];
  const normalizedPath = pathComponent.replace(/[\t\n\r]/g, '').replace(/\\/g, '/');

  if (!normalizedPath.startsWith('/')) {
    return DEFAULT_REDIRECT;
  }

  if (normalizedPath.startsWith('//') || normalizedPath.includes('://')) {
    return DEFAULT_REDIRECT;
  }

  if (normalizedPath === LOGIN_REDIRECT) {
    return DEFAULT_REDIRECT;
  }

  return redirectPath;
}
