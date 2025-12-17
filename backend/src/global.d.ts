/// <reference types="@cloudflare/workers-types" />

declare module 'hono' {
  interface ContextVariableMap {
    user?: import('./types').JWTPayload;
  }
}
