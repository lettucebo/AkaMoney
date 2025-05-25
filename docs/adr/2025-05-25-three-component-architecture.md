# ADR-002: Three-Component Architecture for Short URL Service

## Title
Three-Component Architecture for Short URL Service

## Status
Accepted

## Context
The AkaMoney short URL service needs an architecture that is scalable, secure, and cost-effective. We need to balance several considerations:

1. Short URL redirection needs to be extremely fast and reliable
2. Administrative functions need to be secure and separated from the public-facing redirection service
3. Authentication should protect sensitive operations
4. Infrastructure costs should scale with usage

## Decision
We will implement a three-component architecture:

1. **Redirect Service**: A dedicated, lightweight Azure Function that only handles URL redirection and click tracking
2. **Management API**: An Azure Function App with authenticated endpoints for administrative operations
3. **Admin Frontend**: A Vue 3 SPA hosted in Azure Static Web Apps

## Consequences

### Positive
- Separation of concerns with different scaling and security profiles
- Redirect service can be optimized for performance and high availability
- Admin frontend and API can be protected with Azure Entra ID authentication
- Consumption-based pricing model aligns costs with actual usage
- Static Web App hosting provides cost-effective and scalable frontend delivery

### Negative
- More complex deployment with multiple components to manage
- Need for coordination between components
- Multiple custom domains to configure and manage

## Alternatives Considered

### Single Application Architecture
- Pros: Simpler deployment, single codebase
- Cons: No separation of concerns, cannot optimize redirect performance independently, security boundaries less clear

### Serverless + Database-as-a-Service Architecture
- Pros: Similar benefits to our chosen approach
- Cons: Adding a separate database service would increase complexity and potentially cost

## References
- [Azure Functions consumption plan](https://docs.microsoft.com/en-us/azure/azure-functions/functions-scale#consumption-plan)
- [Azure Static Web Apps overview](https://docs.microsoft.com/en-us/azure/static-web-apps/overview)
- [Azure Entra ID integration patterns](https://docs.microsoft.com/en-us/azure/active-directory/develop/authentication-patterns)
