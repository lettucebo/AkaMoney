const DEFAULT_REDIRECT = '/dashboard';
const LOGIN_REDIRECT = '/login';

export function getValidatedRedirect(redirectPath: unknown): string {
  if (typeof redirectPath !== 'string' || redirectPath.length === 0) {
    return DEFAULT_REDIRECT;
  }

  if (!redirectPath.startsWith('/')) {
    return DEFAULT_REDIRECT;
  }

  if (redirectPath.startsWith('//') || redirectPath.includes('://')) {
    return DEFAULT_REDIRECT;
  }

  const pathWithoutQueryOrHash = redirectPath.split(/[?#]/, 1)[0];

  if (pathWithoutQueryOrHash === LOGIN_REDIRECT) {
    return DEFAULT_REDIRECT;
  }

  return redirectPath;
}
