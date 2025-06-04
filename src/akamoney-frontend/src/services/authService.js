// Auth configuration for Azure Entra ID (former Azure AD)
import { PublicClientApplication } from "@azure/msal-browser";

// MSAL configuration
const msalConfig = {
  auth: {
    clientId: process.env.VUE_APP_CLIENT_ID, // Entra ID Application (client) ID
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

let msalInstance = null;
let msalInitPromise = null;

/**
 * Initialize authentication module.
 * This function must be called before using any MSAL API.
 * It handles the redirect promise and ensures MSAL is ready.
 * Should be called once at app startup (e.g., in main.js).
 * @returns {Promise<void>}
 */
async function initializeAuth() {
  if (msalInitPromise) {
    return msalInitPromise;
  }
  msalInitPromise = (async () => {
    if (!msalInstance) {
      msalInstance = new PublicClientApplication(msalConfig);
      // MSAL 3.x 必須先 await initialize()
      if (typeof msalInstance.initialize === 'function') {
        await msalInstance.initialize();
      }
    }
    try {
      await msalInstance.handleRedirectPromise().then(handleResponse);
    } catch (error) {
      console.error("Error handling redirect: ", error);
    }
  })();
  return msalInitPromise;
}

/**
 * Handle the authentication response
 * @param {Object} response - Authentication response
 */
function handleResponse(response) {
  if (response !== null) {
    console.log("Authentication successful");
    window.location.replace('/dashboard');
  }
}

/**
 * Login with Microsoft Entra ID
 */
async function login() {
  await initializeAuth();
  if (!msalInstance) {
    throw new Error("MSAL instance not initialized. You must await authService.login().");
  }
  msalInstance.loginRedirect(loginRequest);
}

/**
 * Logout from the application
 */
async function logout() {
  await initializeAuth();
  if (!msalInstance) {
    throw new Error("MSAL instance not initialized. You must await authService.logout().");
  }
  msalInstance.logoutRedirect();
}

/**
 * Get the active account
 * @returns {Object|null} The active account or null if no active account
 */
async function getAccount() {
  await initializeAuth();
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
  await initializeAuth();
  const account = await getAccount();
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
 * @returns {Promise<boolean>} True if authenticated, false otherwise
 */
async function isAuthenticated() {
  await initializeAuth();
  return msalInstance && msalInstance.getAllAccounts().length > 0;
}

export default {
  get msalInstance() { return msalInstance; },
  login,
  logout,
  getAccount,
  getAccessToken,
  isAuthenticated,
  initializeAuth
};
