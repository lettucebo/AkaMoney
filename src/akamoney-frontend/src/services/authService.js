// Auth configuration for Azure Entra ID (former Azure AD)
import { PublicClientApplication } from "@azure/msal-browser";

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development';

// MSAL configuration (only used in non-development environments)
const msalConfig = {
  auth: {
    clientId: process.env.VUE_APP_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.VUE_APP_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

// Authentication request scopes
const loginRequest = {
  scopes: ["User.Read", `api://${process.env.VUE_APP_API_CLIENT_ID}/access_as_user`],
};

// Store for development mock authentication
let developmentAuthState = {
  isAuthenticated: false,
  user: null
};

// Initialize MSAL instance only if not in development
const msalInstance = !isDevelopment ? new PublicClientApplication(msalConfig) : null;

// Handle redirect promise after login (only in non-development environments)
if (!isDevelopment && msalInstance) {
  msalInstance.handleRedirectPromise()
    .then(handleResponse)
    .catch(error => {
      console.error("Error handling redirect: ", error);
    });
}

/**
 * Handle the authentication response
 * @param {Object} response - Authentication response
 */
function handleResponse(response) {
  if (response !== null) {
    console.log("Authentication successful");
  }
}

/**
 * Login with redirect or mock login for development
 */
function login() {
  if (isDevelopment) {
    // Simulate login in development
    developmentAuthState.isAuthenticated = true;
    developmentAuthState.user = {
      name: 'Development User',
      username: 'dev@example.com',
      localAccountId: 'dev-user-id'
    };
    
    // Redirect to dashboard
    window.location.href = '/#/dashboard';
    return;
  }
  
  msalInstance.loginRedirect(loginRequest);
}

/**
 * Logout from the application
 */
function logout() {
  if (isDevelopment) {
    // Simulate logout in development
    developmentAuthState.isAuthenticated = false;
    developmentAuthState.user = null;
    
    // Redirect to login
    window.location.href = '/#/login';
    return;
  }
  
  msalInstance.logoutRedirect();
}

/**
 * Get the active account
 * @returns {Object|null} The active account or null if no active account
 */
function getAccount() {
  if (isDevelopment) {
    return developmentAuthState.isAuthenticated ? developmentAuthState.user : null;
  }
  
  const currentAccounts = msalInstance.getAllAccounts();
  if (currentAccounts.length === 0) {
    return null;
  }
  return currentAccounts[0];
}

/**
 * Get access token for API calls
 * @returns {Promise<string>} Promise resolving to access token
 */
async function getAccessToken() {
  if (isDevelopment) {
    // Return a mock token for development
    return 'dev-mock-token';
  }
  
  const account = getAccount();
  if (!account) {
    throw new Error("No active account! Please sign in.");
  }

  const tokenRequest = {
    scopes: [`api://${process.env.VUE_APP_API_CLIENT_ID}/access_as_user`],
    account: account
  };

  try {
    const response = await msalInstance.acquireTokenSilent(tokenRequest);
    return response.accessToken;
  } catch (error) {
    console.error("Silent token acquisition failed, acquiring token using redirect");
    msalInstance.acquireTokenRedirect(tokenRequest);
  }
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if authenticated, false otherwise
 */
function isAuthenticated() {
  if (isDevelopment) {
    return developmentAuthState.isAuthenticated;
  }
  
  return getAccount() !== null;
}

export default {
  msalInstance,
  login,
  logout,
  getAccount,
  getAccessToken,
  isAuthenticated
};
