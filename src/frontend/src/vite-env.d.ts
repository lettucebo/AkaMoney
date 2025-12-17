/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ENTRA_ID_CLIENT_ID: string;
  readonly VITE_ENTRA_ID_TENANT_ID: string;
  readonly VITE_ENTRA_ID_REDIRECT_URI: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_SHORT_DOMAIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
