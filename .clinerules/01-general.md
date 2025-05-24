# Project Guidelines
## Documentation Requirements
- Update relevant documentation in /docs when modifying features
- Keep README.md in sync with new capabilities
- Maintain changelog entries in CHANGELOG.md
- Write implementation plan to .md files in /docs/implementation
  - Naming convention: <date>-<feature-name>.md

## Naming Conventions
- Code must include appropriate comments.
  - All classes and methods must have comments.
  - All variables and parameters must have comments.
  - Appropriately add comments throughout the entire code.
  - All comments must be written in English.

## Architecture Decision Records
Create ADRs in /docs/adr for:
- Major dependency changes
- Architectural pattern changes
- New integration patterns
- Database schema changes
    - Follow template in /docs/adr/template.md

## Code Style & Patterns
- Generate API clients using OpenAPI Generator
- Use TypeScript axios template
- Place generated code in /src/generated
- Prefer composition over inheritance
- Use repository pattern for data access
- Follow error handling pattern in /src/utils/errors.ts

## Testing Standards
- Unit tests required for business logic
- Integration tests for API endpoints
- E2E tests for critical user flows

## General
- DO NOT BE LAZY. DO NOT OMIT CODE.
- Each step should be committed separately to preserve history.