import { PublicClientApplication, type Configuration, type AccountInfo } from '@azure/msal-browser';

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigurationError';
  }
}

const clientId = import.meta.env.VITE_ENTRA_ID_CLIENT_ID || '';

const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_ID_TENANT_ID || 'common'}`,
    redirectUri: import.meta.env.VITE_ENTRA_ID_REDIRECT_URI || window.location.origin
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false
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
    if (!this.isConfigured || !this.msalInstance) {
      // Skip initialization if not configured - login will show proper error
      return;
    }
    await this.msalInstance.initialize();
    await this.msalInstance.handleRedirectPromise();
  }

  async login() {
    this.ensureConfigured();
    try {
      const loginResponse = await this.msalInstance!.loginPopup({
        scopes: ['openid', 'profile', 'email']
      });
      
      if (loginResponse.account) {
        this.msalInstance!.setActiveAccount(loginResponse.account);
        // Store token for API requests
        localStorage.setItem('auth_token', loginResponse.accessToken);
        return loginResponse.account;
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async loginRedirect() {
    this.ensureConfigured();
    try {
      await this.msalInstance!.loginRedirect({
        scopes: ['openid', 'profile', 'email']
      });
    } catch (error) {
      console.error('Login redirect failed:', error);
      throw error;
    }
  }

  async logout() {
    const account = this.getAccount();
    localStorage.removeItem('auth_token');
    
    if (account && this.msalInstance) {
      await this.msalInstance.logoutPopup({
        account
      });
    }
  }

  getAccount(): AccountInfo | null {
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
    return this.getAccount() !== null;
  }

  async getToken(): Promise<string | null> {
    const account = this.getAccount();
    if (!account || !this.msalInstance) {
      return null;
    }

    try {
      const response = await this.msalInstance.acquireTokenSilent({
        scopes: ['openid', 'profile', 'email'],
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
