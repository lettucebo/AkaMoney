# Project Structure

This document explains the organization of the AkaMoney project directory.

## Root Directory Organization

The root directory contains only essential project-level files that are standard for open-source projects:

### Documentation Files (Root Level)
These files remain in the root directory following standard open-source conventions:

- `README.md` / `README.zh-TW.md` - Project overview and quick start guide
- `CHANGELOG.md` / `CHANGELOG.zh-TW.md` - Version history and release notes
- `CONTRIBUTING.md` - Contribution guidelines
- `LICENSE` - Project license

### Configuration Files (Root Level)
These files must remain in the root directory as they configure the entire project:

- `.editorconfig` - Editor settings for consistent coding style
- `.prettierrc` - Code formatting rules
- `.node-version` / `.nvmrc` - Node.js version specification
- `.gitignore` - Git ignore patterns
- `package.json` / `package-lock.json` - Monorepo/workspace coordinator

## Source Code Organization

### `/src` Directory
Contains all application source code, organized by service:

- `backend/` - Admin API service (Cloudflare Worker)
- `frontend/` - Management dashboard (Vue 3 application)
- `redirect/` - Public URL redirect service (Cloudflare Worker)
- `shared/` - Shared types and utilities

### `/docs` Directory
Contains all detailed technical documentation:

- `API.md` / `API.zh-TW.md` - API documentation
- `SETUP.md` / `SETUP.zh-TW.md` - Setup and deployment guide
- `SCREENSHOTS.md` / `SCREENSHOTS.zh-TW.md` - Application screenshots
- `THEME.md` / `THEME.zh-TW.md` - Theme customization guide
- `IMPLEMENTATION_SUMMARY.md` - Implementation details
- `IMPLEMENTATION_SSO_USER.md` - SSO user implementation details

## Organizational Principles

1. **Keep root directory clean**: Only essential project files at root level
2. **Separate concerns**: Documentation in `/docs`, source code in `/src`
3. **Follow conventions**: Standard files (README, LICENSE, etc.) stay at root
4. **Configuration at root**: Project-wide config files must be at root to work properly
5. **Detailed docs in /docs**: Technical documentation and implementation details go in `/docs`

## Why This Structure?

- **Industry Standard**: Follows common Node.js/TypeScript project conventions
- **Tool Compatibility**: Configuration files at root work with editors and tools
- **Clear Separation**: Easy to distinguish between source code, docs, and config
- **Maintainability**: New contributors can quickly understand the project layout
