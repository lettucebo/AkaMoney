# Changelog

English | [繁體中文](CHANGELOG.zh-TW.md)

All notable changes to the AkaMoney project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-17

### Added
- Initial implementation of URL shortening service
- Vue 3 frontend with Vite and TypeScript
- Cloudflare Workers backend with Hono framework
- D1 database integration with migration system
- JWT authentication for API endpoints
- Microsoft Entra ID integration for dashboard login
- URL management dashboard with CRUD operations
- Comprehensive analytics dashboard
  - Click tracking by date (last 30 days)
  - Geographic distribution (country, city)
  - Device type breakdown (mobile, desktop, tablet)
  - Browser statistics
  - Operating system detection
  - Recent clicks table
- Public URL shortening interface
- Custom short code support (3-20 alphanumeric characters + hyphens/underscores)
- Automatic short code generation using nanoid
- URL validation and duplicate prevention
- Fast redirect functionality (302 status)
- Responsive Bootstrap 5 UI
- Pinia state management
- Vue Router with authentication guards
- R2 storage configuration
- DevContainer support for consistent development environment
- Comprehensive documentation
  - README.md - Project overview
  - SETUP.md - Setup and deployment guide
  - API.md - Complete API documentation
  - CONTRIBUTING.md - Contribution guidelines
  - IMPLEMENTATION_SUMMARY.md - Implementation details
- Traditional Chinese translations for all documentation
- CHANGELOG.md for tracking changes

### Security
- JWT token generation and verification with HS256
- Parameterized database queries to prevent SQL injection
- Input validation on all endpoints
- CORS middleware configuration
- XSS prevention through Vue auto-escaping
- CodeQL security scan passed with 0 vulnerabilities

### Configuration
- Node.js 24 (LTS) requirement
- Environment variable templates (.env.example)
- EditorConfig and Prettier configuration
- TypeScript strict mode
- Wrangler configuration for Cloudflare Workers and D1

### Infrastructure
- Cloudflare Workers for serverless API
- Cloudflare Pages for frontend hosting
- Cloudflare D1 for database
- Cloudflare R2 for storage
- Global edge network deployment

### Dependencies
- Frontend: Vue 3.5.13, Vite 6.0.3, Bootstrap 5.3.3, Pinia 2.2.8, Vue Router 4.4.5
- Backend: Hono 4.6.14, nanoid 5.0.9
- Development: TypeScript 5.7.2, Wrangler 3.94.0

### Fixed
- Added missing bootstrap-icons dependency
- Fixed CORS middleware to work correctly in Cloudflare Workers environment
- Improved clipboard copy UX with visual feedback
- Enhanced wrangler.toml documentation for database_id configuration

## [Unreleased]

### Planned Features
- QR code generation for short URLs
- Password-protected links
- Link expiration notifications
- Bulk URL import functionality
- Custom domains per user
- A/B testing for links
- Link scheduling
- Export analytics to CSV/PDF
- Email notifications
- API rate limiting
- Enhanced caching strategies
- Connection pooling optimization
- Error tracking integration (Sentry)
- Monitoring dashboards
- Alert system

---

For more details on each release, see the [release notes](https://github.com/lettucebo/AkaMoney/releases).
