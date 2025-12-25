import { PublicClientApplication, type Configuration, type AccountInfo } from '@azure/msal-browser';

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigurationError';
  }
}

const clientId = import.meta.env.VITE_ENTRA_ID_CLIENT_ID || '';

// Skip authentication in development mode when VITE_SKIP_AUTH is set
const skipAuth = import.meta.env.VITE_SKIP_AUTH === 'true' && import.meta.env.DEV;

// Mock user account for development mode with skipped authentication
const mockAccount: AccountInfo = {
  homeAccountId: 'dev-mock-account-id',
  localAccountId: 'dev-local-account-id',
  environment: 'login.microsoftonline.com',
  tenantId: 'dev-tenant-id',
  username: 'dev@localhost',
  name: 'Development User'
};

export function isAuthSkipped(): boolean {
  return skipAuth;
}

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

  async initialize() {
    // Skip authentication in development mode when VITE_SKIP_AUTH is set
    if (skipAuth) {
      console.info('[Auth] Skipping authentication in development mode');
      return;
    }

    if (!this.isConfigured || !this.msalInstance) {
      // Skip initialization if not configured - login will show proper error
      return;
    }
    
    try {
      await this.msalInstance.initialize();
      
      // Handle redirect callback and set account/token
      const response = await this.msalInstance.handleRedirectPromise();
      
      if (response && response.account) {
        // Set active account
        this.msalInstance.setActiveAccount(response.account);
        
        // Store token for API usage
        if (response.accessToken) {
          localStorage.setItem('auth_token', response.accessToken);
        } else {
          console.warn(
            'Redirect response received but no access token was returned. Subsequent API calls may fail.'
          );
        }
      }
    } catch (error) {
      console.error('MSAL initialization error:', error);
      // Clean up potentially corrupted state
      localStorage.removeItem('auth_token');
      // Don't throw - let the application continue
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
      
      if (loginResponse.account) {
        msalInstance.setActiveAccount(loginResponse.account);
        // Store token for API requests if available
        if (loginResponse.accessToken) {
          localStorage.setItem('auth_token', loginResponse.accessToken);
        } else {
          console.warn(
            'Login succeeded but no access token was returned. Subsequent API calls relying on auth_token may fail.'
          );
        }
        return loginResponse.account;
      }
    } catch (error) {
      console.error('Login failed:', error);
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
      const msalInstance = this.msalInstance!;
      await msalInstance.loginRedirect({
        scopes: [
          'openid', 
          'profile', 
          'email',
          `api://${clientId}/access_as_user`
        ]
      });
    } catch (error) {
      console.error('Login redirect failed:', error);
      throw error;
    }
  }

  async logout() {
    // Simple logout for skip auth mode
    if (skipAuth) {
      localStorage.removeItem('auth_token');
      return;
    }

    const account = this.getAccount();
    localStorage.removeItem('auth_token');
    
    if (account && this.msalInstance) {
      await this.msalInstance.logoutPopup({
        account
      });
    }
  }

  getAccount(): AccountInfo | null {
    // Return mock account if skip auth is enabled
    if (skipAuth) {
      return mockAccount;
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

  async getToken(): Promise<string | null> {
    // Return mock token if skip auth is enabled
    if (skipAuth) {
      return 'dev-mock-token';
    }

    const account = this.getAccount();
    if (!account || !this.msalInstance) {
      return null;
    }

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
      return response.accessToken;
    } catch (error) {
      console.error('Failed to acquire token:', error);
      return null;
    }
  }
}

export default new AuthService();
