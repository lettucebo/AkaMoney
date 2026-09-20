import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type Configuration,
  type AccountInfo
} from '@azure/msal-browser';
import { inspectOAuthCallback } from '@/utils/oauthCallback';
import { toSafeErrorContext } from '@/utils/safeError';
import { clearSessionExpiry, getSessionGeneration, markSessionExpired, readSessionExpiry } from '@/utils/sessionExpiry';

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigurationError';
  }
}

/**
 * Outcome of the one-time redirect-callback handling performed by
 * {@link AuthService.initialize}.
 *
 * - `none`: no authorization response was consumed.
 * - `handled`: MSAL consumed a valid redirect response and restored an account.
 * - `failed`: MSAL initialization or redirect handling threw.
 */
export interface AuthInitializationResult {
  readonly status: 'none' | 'handled' | 'failed';
  /**
   * Whether the launch URL carried OAuth response parameters, recorded before
   * any MSAL work so it survives MSAL clearing the URL. Presence only - no
   * callback value is ever read, returned or logged.
   */
  readonly callbackPresent: boolean;
}

/**
 * Initialization diagnostics are constant strings. An MSAL error object can
 * carry the callback URL, the raw fragment or a correlation identifier, and
 * console output is forwarded to Sentry, so no error value may be logged.
 */
const INITIALIZATION_FAILED_MESSAGE = '[Auth] Initialization failed.';

/**
 * Result of {@link AuthService.getToken}. Only `acquired` may be sent as a
 * bearer token; every other status tells the caller why no token is
 * available so it can react (retry silently, or trigger auth-failure
 * handling) without ever falling back to a stale cached value.
 */
export type TokenResult =
  | { readonly status: 'acquired'; readonly token: string }
  | { readonly status: 'interaction-required' }
  | { readonly status: 'initialization-failed' }
  | { readonly status: 'no-account' }
  | { readonly status: 'unavailable' };

/** MSAL error codes that mean the user must interact again before a token can be issued. */
const INTERACTION_REQUIRED_ERROR_CODES: ReadonlySet<string> = new Set([
  'interaction_required',
  'login_required',
  'consent_required',
  'no_account_error'
]);

const isInteractionRequiredError = (error: unknown): boolean => {
  if (error instanceof InteractionRequiredAuthError) {
    return true;
  }
  if (typeof error === 'object' && error !== null) {
    const errorCode = (error as Record<string, unknown>).errorCode;
    return typeof errorCode === 'string' && INTERACTION_REQUIRED_ERROR_CODES.has(errorCode);
  }
  return false;
};

const clientId = import.meta.env.VITE_ENTRA_ID_CLIENT_ID || '';

/**
 * Flag to skip authentication in development mode.
 * 
 * This feature is controlled by the `VITE_SKIP_AUTH` environment variable
 * and only activates when running in development mode (`import.meta.env.DEV`).
 * 
 * **Security Notice:** This should NEVER be enabled in production.
 * 
 * **Use Cases:**
 * - Automated testing and screenshots
 * - UI demos and development without real authentication
 * - Local development workflow improvements
 */
const skipAuth = import.meta.env.VITE_SKIP_AUTH === 'true' && import.meta.env.DEV;

// Runtime warning when authentication is bypassed
if (skipAuth) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Auth] Authentication is DISABLED because VITE_SKIP_AUTH is true in development. ' +
      'Do NOT enable this mode in production.'
  );
}

/**
 * Mock user account for development mode with skipped authentication.
 * Contains realistic but clearly fake data for testing purposes.
 */
const mockAccount: AccountInfo = {
  homeAccountId: 'mock-home-account-id',
  localAccountId: 'mock-local-account-id',
  environment: 'development.local',
  tenantId: 'mock-tenant-id',
  username: 'dev@localhost',
  name: 'Development User'
};

/**
 * Checks if authentication is currently being skipped.
 * 
 * @returns `true` if `VITE_SKIP_AUTH=true` and running in development mode, `false` otherwise.
 * 
 * This function is used to determine if mock data should be returned
 * instead of making real API calls or authentication requests.
 * 
 * **Security:** Only returns `true` in development mode (`import.meta.env.DEV`).
 */
export function isAuthSkipped(): boolean {
  return skipAuth;
}

/**
 * Storage key for tracking explicit logout state.
 * This flag indicates when a user has explicitly logged out,
 * even if MSAL still has cached account information.
 */
const LOGOUT_FLAG_KEY = 'akamoney_explicit_logout';

const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_ID_TENANT_ID || 'common'}`,
    redirectUri: import.meta.env.VITE_ENTRA_ID_REDIRECT_URI || window.location.origin
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: true
  }
};

class AuthService {
  private msalInstance: PublicClientApplication | null = null;
  private isConfigured: boolean;
  private initializationResult: AuthInitializationResult | null = null;
  private initializePromise: Promise<AuthInitializationResult> | null = null;
  /** SDK readiness (`msalInstance.initialize()`) cached only on success: a failure must stay retryable. */
  private msalReady = false;
  private msalReadyPromise: Promise<void> | null = null;

  constructor() {
    this.isConfigured = Boolean(clientId);
    if (this.isConfigured) {
      this.msalInstance = new PublicClientApplication(msalConfig);
    }
  }

  private ensureConfigured(): void {
    if (!this.isConfigured || !this.msalInstance) {
      throw new AuthConfigurationError(
        'Entra ID client is not configured. Please set VITE_ENTRA_ID_CLIENT_ID environment variable.'
      );
    }
  }

  /**
   * Ensures the MSAL SDK itself is ready, independent of one-time redirect
   * callback handling. Success is cached for the lifetime of the service; a
   * failure is never cached so a later caller (`getToken`, `loginRedirect`,
   * or a subsequent `initialize`) can retry it. This never consumes the
   * redirect callback - that only ever happens once, inside
   * {@link AuthService.runInitialization}.
   */
  private async ensureMsalInitialized(): Promise<void> {
    if (this.msalReady) {
      return;
    }
    if (this.msalReadyPromise) {
      return this.msalReadyPromise;
    }

    const promise = (async () => {
      await this.msalInstance!.initialize();
    })();
    this.msalReadyPromise = promise;

    try {
      await promise;
      this.msalReady = true;
    } finally {
      this.msalReadyPromise = null;
    }
  }

  /**
   * Handles an MSAL failure that specifically requires interactive sign-in:
   * `InteractionRequiredAuthError` and the `interaction_required`,
   * `login_required`, `consent_required`, and `no_account_error` codes. Only
   * the affected account's local cache is cleared - never a full server
   * logout or unrelated storage.
   */
  private async handleInteractionRequired(account: AccountInfo): Promise<void> {
    localStorage.removeItem('auth_token');
    markSessionExpired('interaction-required');
    if (this.msalInstance) {
      try {
        await this.msalInstance.clearCache({ account });
      } catch {
        // Best-effort local cleanup: a failed clearCache must not surface as
        // a new error on top of the interaction-required result.
      }
    }
  }

  /**
   * Consumes an OAuth redirect response exactly once and reports what
   * happened. The result is cached so concurrent and later callers observe the
   * same outcome instead of re-running `handleRedirectPromise`, which only
   * returns a response for the first call.
   */
  async initialize(): Promise<AuthInitializationResult> {
    if (this.initializationResult) {
      return this.initializationResult;
    }

    if (this.initializePromise) {
      return this.initializePromise;
    }

    const promise = this.runInitialization();
    this.initializePromise = promise;

    try {
      const result = await promise;
      this.initializationResult = result;
      return result;
    } finally {
      this.initializePromise = null;
    }
  }

  private async runInitialization(): Promise<AuthInitializationResult> {
    // Recorded before any MSAL work: MSAL removes the callback parameters from
    // the URL while handling the response.
    const callbackPresent = inspectOAuthCallback(window.location.href).isCallback;

    // Skip authentication in development mode when VITE_SKIP_AUTH is set
    if (skipAuth) {
      console.info('[Auth] Skipping authentication in development mode');
      return { status: 'none', callbackPresent };
    }

    if (!this.isConfigured || !this.msalInstance) {
      // Skip initialization if not configured - login will show proper error
      return { status: 'none', callbackPresent };
    }

    try {
      await this.ensureMsalInitialized();
    } catch {
      console.error(INITIALIZATION_FAILED_MESSAGE);
      localStorage.removeItem('auth_token');
      markSessionExpired('initialization-failed');
      return { status: 'failed', callbackPresent };
    }

    try {
      // Handle redirect callback and set account/token
      const response = await this.msalInstance.handleRedirectPromise();

      if (response && response.account) {
        if (response.accessToken) {
          // Clear logout flag when successfully logging in via redirect
          localStorage.removeItem(LOGOUT_FLAG_KEY);
          // Set active account
          this.msalInstance.setActiveAccount(response.account);
          // Store token for API usage
          localStorage.setItem('auth_token', response.accessToken);
          // A confirmed account and token restores the session: any prior
          // expiry/loop-detection marker no longer applies.
          clearSessionExpiry();
        } else {
          console.warn(
            'Redirect response received but no access token was returned. Subsequent API calls may fail.'
          );
          // An account without a token must not restore a valid session:
          // leave the active account untouched and require interaction again.
          markSessionExpired('interaction-required');
        }

        return { status: 'handled', callbackPresent };
      }

      return { status: 'none', callbackPresent };
    } catch {
      console.error(INITIALIZATION_FAILED_MESSAGE);
      // Clean up potentially corrupted state
      localStorage.removeItem('auth_token');
      // Persist the failure the same way a readiness failure does: without an
      // expiry marker, a stale cached MSAL account could otherwise be read
      // back as valid by `getAccount()` on a later, unrelated reload even
      // though no access token was ever confirmed here.
      markSessionExpired('initialization-failed');
      // Don't throw - let the application continue
      return { status: 'failed', callbackPresent };
    }
  }

  async login() {
    // Return mock account if skip auth is enabled
    if (skipAuth) {
      return mockAccount;
    }

    this.ensureConfigured();
    try {
      const msalInstance = this.msalInstance!;
      const loginResponse = await msalInstance.loginPopup({
        scopes: [
          'openid', 
          'profile', 
          'email',
          `api://${clientId}/access_as_user`
        ]
      });
      
      if (loginResponse.account && loginResponse.accessToken) {
        // Clear logout flag when successfully logging in
        localStorage.removeItem(LOGOUT_FLAG_KEY);

        msalInstance.setActiveAccount(loginResponse.account);
        localStorage.setItem('auth_token', loginResponse.accessToken);
        // A confirmed account and token restores the session.
        clearSessionExpiry();
        return loginResponse.account;
      }

      if (loginResponse.account) {
        console.warn(
          'Login succeeded but no access token was returned. Subsequent API calls relying on auth_token may fail.'
        );
        // An account without a token must not restore a valid session, even
        // if nothing had previously marked it expired: persist the expiry
        // marker and clear only this account's local cache so a later
        // reload cannot resurrect it as if it were still valid.
        await this.handleInteractionRequired(loginResponse.account);
      }
      // No account, or an account without a token: do not restore a valid session.
      return undefined;
    } catch (error) {
      console.error('[Auth] Login failed.', toSafeErrorContext(error));
      throw error;
    }
  }

  async loginRedirect() {
    // Skip redirect if skip auth is enabled - the store will handle mock login
    if (skipAuth) {
      return;
    }

    this.ensureConfigured();

    try {
      await this.ensureMsalInitialized();
    } catch {
      console.error(INITIALIZATION_FAILED_MESSAGE);
      markSessionExpired('initialization-failed');
      throw new Error('Authentication could not be initialized.');
    }

    try {
      const msalInstance = this.msalInstance!;
      await msalInstance.loginRedirect({
        scopes: [
          'openid', 
          'profile', 
          'email',
          `api://${clientId}/access_as_user`
        ]
      });
      // Note: Logout flag is cleared in initialize() after successful redirect
      // Merely starting a redirect never restores or clears the current
      // expiry state - only a confirmed callback (see initialize()) may.
    } catch (error) {
      console.error('[Auth] Login redirect failed.', toSafeErrorContext(error));
      throw error;
    }
  }

  async logout() {
    // Simple logout for skip auth mode
    if (skipAuth) {
      localStorage.setItem(LOGOUT_FLAG_KEY, 'true');
      localStorage.removeItem('auth_token');
      return;
    }

    // Set explicit logout flag to prevent auto re-authentication
    localStorage.setItem(LOGOUT_FLAG_KEY, 'true');
    localStorage.removeItem('auth_token');
    
    // Clear the active MSAL account reference without signing out of the Microsoft account.
    // Note: setActiveAccount(null) does NOT clear MSAL's cached accounts/tokens from storage;
    // the LOGOUT_FLAG_KEY is what prevents this app from reusing those cached credentials.
    if (this.msalInstance) {
      this.msalInstance.setActiveAccount(null);
    }
  }

  getAccount(): AccountInfo | null {
    // If user has explicitly logged out, don't return any account
    if (localStorage.getItem(LOGOUT_FLAG_KEY) === 'true') {
      return null;
    }

    // Return mock account if skip auth is enabled
    if (skipAuth) {
      return mockAccount;
    }

    // While an expiry marker exists, never repopulate an account from MSAL's
    // local cache: doing so would silently resurrect a session that was just
    // invalidated (e.g. by clearCache leaving other cached accounts behind).
    if (readSessionExpiry() !== null) {
      return null;
    }

    if (!this.msalInstance) {
      return null;
    }
    const currentAccount = this.msalInstance.getActiveAccount();
    if (currentAccount) {
      return currentAccount;
    }

    const accounts = this.msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      this.msalInstance.setActiveAccount(accounts[0]);
      return accounts[0];
    }

    return null;
  }

  isAuthenticated(): boolean {
    // Always authenticated if skip auth is enabled
    if (skipAuth) {
      return true;
    }
    return this.getAccount() !== null;
  }

  async getToken(): Promise<TokenResult> {
    // Return mock token if skip auth is enabled
    if (skipAuth) {
      return { status: 'acquired', token: 'dev-mock-token' };
    }

    const account = this.getAccount();
    if (!account || !this.msalInstance) {
      return { status: 'no-account' };
    }

    try {
      await this.ensureMsalInitialized();
    } catch {
      console.error(INITIALIZATION_FAILED_MESSAGE);
      return { status: 'initialization-failed' };
    }

    // Captured before awaiting acquireTokenSilent: if another request's 401
    // expires the session, or a newer login/callback establishes one, while
    // this call is suspended, the generation moves on. Checked again right
    // after the await returns/throws and before acting on the result, so a
    // stale completion can never restore a token for an already-invalidated
    // session nor invalidate a session it no longer corresponds to.
    const generationBeforeAcquire = getSessionGeneration();

    try {
      const response = await this.msalInstance.acquireTokenSilent({
        scopes: [
          'openid', 
          'profile', 
          'email',
          `api://${clientId}/access_as_user`
        ],
        account
      });
      if (getSessionGeneration() !== generationBeforeAcquire) {
        // The session changed while this call was in flight: treat the
        // result as stale rather than restoring it.
        return { status: 'unavailable' };
      }
      if (!response.accessToken) {
        return { status: 'unavailable' };
      }
      return { status: 'acquired', token: response.accessToken };
    } catch (error) {
      if (isInteractionRequiredError(error)) {
        if (getSessionGeneration() !== generationBeforeAcquire) {
          // The session already changed (expired independently, or a newer
          // successful auth took over) while this call was awaiting MSAL:
          // this stale failure must not expire whatever session is current.
          return { status: 'unavailable' };
        }
        await this.handleInteractionRequired(account);
        return { status: 'interaction-required' };
      }
      console.error('[Auth] Silent token acquisition failed.', toSafeErrorContext(error));
      return { status: 'unavailable' };
    }
  }
}

export default new AuthService();
