# CHANGELOG

## [v2.0.0] [2025-06-04] Entra ID Authentication Rewrite
- Refactor: Frontend authentication now only supports Microsoft Entra ID, removed all mock/development login code.
- Refactor: Backend (AkaMoney.Functions) enforces Entra ID JWT authentication, removed all anonymous/dev mode.
- Docs: Updated .env.example, implementation plan, and README for new authentication flow.
- Infra: Ensure all configuration parameters (clientId, tenantId, api scope) are consistent across frontend, backend, and infra.
