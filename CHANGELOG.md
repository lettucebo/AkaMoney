# Changelog

English | [繁體中文](CHANGELOG.zh-TW.md)

All notable changes to the AkaMoney project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-08-27

### Added
- Added on-demand short URL creation from the dashboard page header and empty state
- Added keyboard support for opening the preview-image picker with Enter or Space
- Added GitHub Copilot skills for documentation lookup, commits, releases, worktrees, Cloudflare and Wrangler tasks, issue management, and browser testing

### Changed
- Replaced the always-visible URL creation panel with a centered modal so the link list and filters remain immediately accessible
- Preserved URL validation, optional metadata, image upload, expiration, list refresh, KPI refresh, and stale-response protection in the modal workflow

### Documentation
- Updated the English and Traditional Chinese implementation, visual-reference, project-structure, and theme documentation for the on-demand creation flow
- Documented that the shipped dashboard intentionally uses a modal instead of the historical `inline-quick-create` design axis

## [1.2.0] - 2026-08-26

### Added
- Redesigned the management application with the Monē interface system
  - Replaced Bootstrap with Tailwind CSS v4 and CSS-first design tokens
  - Added the responsive application shell, sidebar, topbar, KPI summary, inline URL workflows, reusable UI primitives, and light/dark themes
  - Added theme-aware Chart.js analytics components and composables
- Added URL-formatting, trend, short-link, and redirect-validation utilities with test coverage
- Added bilingual project documentation for architecture, authentication, configuration, database, deployment, development, storage, testing, troubleshooting, and documentation navigation
- Added GitHub Copilot repository guidance
- Archived the UI proposal bake-off, including fourteen interactive proposals, screenshots, manifests, and comparison materials

### Fixed
- Fixed authentication bootstrap races through single-flight initialization and removal of duplicate initialization callers
- Hardened login redirect validation by normalizing paths and rejecting external and protocol-relative redirect targets
- Fixed URL list consistency during concurrent loading and mutations, including correct page recovery after deleting the only item on the last page

### Changed
- Documented the existing partial URL update contract in frontend and backend types: explicit `null` clears nullable fields while omitted fields remain unchanged
- Updated dependencies across applications, including Hono, Wrangler, Axios, Happy DOM, and Vitest
- Updated CI to require Node.js 24, matching the repository engine requirement
- Configured the release workflow to supply `VITE_API_URL` from repository variables

### Documentation
- Updated the English and Traditional Chinese READMEs and contribution guidance for the Tailwind interface and Microsoft Entra authentication flow
- Corrected deployment tag examples to match the repository's no-`v` tag convention

## [1.1.6] - 2026-01-03

### Fixed
- Fixed case-sensitive STORAGE_PROVIDER environment variable handling
  - Storage provider names (r2, azure) are now case-insensitive
  - Users can set STORAGE_PROVIDER as "r2", "R2", "azure", "Azure", or "AZURE"
  - Normalized provider names in `getStorageConfig()`, `createStorageProvider()`, and `isStorageConfigured()` functions
  - Added 12 comprehensive test cases for case-insensitive behavior
  - Prevents "Storage is not configured" errors caused by case mismatches

## [1.1.5] - 2025-12-26

### Fixed
- Fixed Cloudflare D1 GraphQL Analytics API filter parameters
  - Changed `datetime_geq` → `date_geq` to match Cloudflare API schema
  - Changed `datetime_leq` → `date_lt` to match Cloudflare API schema
  - Fixed date format from ISO 8601 to YYYY-MM-DD as required by Cloudflare API
  - Resolved GraphQL query failures caused by incorrect parameter names

### Added
- Date range selection feature for D1 Analytics
  - Added interactive date range picker UI with HTML5 date inputs
  - Added "Apply Date Range" button to fetch data for custom periods
  - Added "Reset to Current Month" button to return to default view
  - API now accepts optional `startDate` and `endDate` query parameters (YYYY-MM-DD format)
  - Default date range is current month instead of single day
  - Response includes `dateRange` field with start and end dates
  - Frontend validation ensures start date ≤ end date before API call
  - Date input fields disabled during loading to prevent race conditions

### Improved
- Enhanced D1 Analytics data accuracy
  - Changed response fields from `daily` to `total` to reflect period-based data
  - Fixed usage percentage calculation to compute average daily usage over selected date range
  - Fixed fallback estimation to respect date range instead of only estimating today
  - Renamed `actualDailyReads/Writes` → `actualTotalReads/Writes` for clarity
- Improved D1 Analytics UI clarity
  - Updated headers to show "total reads/writes" and "limit per day" separately
  - Removed misleading "remaining" calculations that don't make sense for date ranges
  - Added date range display in Information section
  - Added informational alert clarifying Storage Usage is cumulative and not affected by date range
  - Fixed TypeError: Cannot read properties of undefined (reading 'toLocaleString')
- Enhanced input validation
  - Validates both `startDate` and `endDate` are provided together
  - Validates date format and returns 400 error for invalid dates
  - Validates `startDate` is before or equal to `endDate`
  - Eliminated date calculation duplication between API and service layers

## [1.1.3] - 2025-12-25

### Fixed
- Fixed click recording by adding missing short_code column to redirect service INSERT statement
  - Added `short_code` field to `ClickRecord` interface in redirect service types
  - Updated INSERT statement to include `short_code` column
  - Prevented NOT NULL constraint violations
  - Ensured click statistics properly update in Dashboard and Analytics

## [1.1.2] - 2025-12-24

### Fixed
- Fixed MSAL redirect callback handling and state synchronization issues
  - Properly handle redirect promise response in initialize()
  - Set active account after redirect callback
  - Store access token to localStorage after successful redirect
  - Add comprehensive error handling for MSAL initialization
  - Enable `storeAuthStateInCookie` to prevent state sync issues
- Fixed pagination buttons showing when search results are zero or insufficient
  - Calculate total pages based on actual data count
  - Hide pagination when data count is 0
  - Hide pagination when data is less than one page
  - Prevent out-of-range page navigation
  - Reset to page 1 when search query changes
  - Limit visible page numbers to improve UX

### Improved
- Better authentication flow with redirect-based login
- Enhanced pagination UX with proper page calculation
- Reduced browser extension interference with cookie-based state storage

## [1.1.1] - 2025-12-24

### Fixed
- Fixed infinite login loop by switching from popup to redirect authentication flow
  - Changed from `loginPopup()` to `loginRedirect()` to avoid routing conflicts in popup window
  - Removed manual redirect logic in LoginView component (handled by router guard)
  - Prevents popup blocker issues
  - Better user experience with full-page redirect flow
  - Follows Microsoft's best practices for authentication

## [1.1.0] - 2025-12-24

### Added
- Copy button for short URLs in Dashboard with visual feedback
  - One-click clipboard copy functionality
  - Visual confirmation with checkmark icon when copied
  - Accessibility features with screen reader support
- Search functionality in Dashboard URL list
  - Search by short code, URL, or title
  - Real-time filtering of URL list
  - Clear button to reset search
  - Shows result count and pagination note
- Enhanced accessibility improvements
  - ARIA labels for interactive elements
  - Screen reader announcements for copy actions
  - Keyboard-friendly navigation

### Improved
- Dashboard UI enhancements for better user experience
- Better visual feedback for user actions

## [1.0.0] - 2025-12-21

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
- Fixed CORS middleware to work correctly in Cloudflare Workers environment (#24)
- Improved clipboard copy UX with visual feedback
- Enhanced wrangler.toml documentation for database_id configuration
- Fixed AADSTS900144 error when Entra ID client_id is not configured (#21)
- Fixed frontend build environment variables injection (#23)
- Fixed authentication flow to request custom API scope for backend authorization (#28)

### Changed
- Organized root directory files, moved most files to docs folder (#3)
- Moved all source code to src folder (#7)
- Split URL redirect service and admin API into separate Cloudflare Workers (#18)
- Replaced custom JWT validation with Microsoft Entra ID token verification (#27)
- Refactored Dashboard to be the home page with unified URL creation interface (#34)
- Migrated non-sensitive config from Secrets to Variables in release workflow (#35)
- Standardized worker secret configuration to use here-string syntax (#20)
- Accepted both v1.0 and v2.0 Microsoft Entra ID token formats (#29)

### Improved
- Added test coverage (80%+) and GitHub Actions CI (#5)
- Added CD workflow for automatic deployment to Cloudflare (#9)
- Implemented secret-driven CD deployment to prevent sensitive info leaks in wrangler.toml (#11)
- CD workflow auto-creates Cloudflare resources if not exists (#12)
- Required authentication for all admin pages (#16)
- Added CD workflow step to configure Worker secrets via wrangler (#19)
- Added Cloudflare Pages origin to CORS allowlist (#24)
- Added dark mode with theme switching functionality (#26)
- Added detailed error responses and logging to auth middleware (#32)
- Added comprehensive error handling with detailed diagnostics to API routes (#33)

## [Unreleased]

### Added
- Integrated Sentry across the Vue frontend, Admin API Worker, and redirect Worker with Issues, Logs, distributed tracing, and error-only frontend Replay.
- Enabled Cloudflare Workers Logs, Worker version metadata, and source-map uploads for readable production stack traces.
- Added a one-minute uptime monitor for `https://aka.money/health`, including first-outage and regression email notifications.
- Added a protected CI source-map flow that keeps the Sentry upload token out of the unprivileged build job and removes `.map` files before Pages deployment.
- Added bilingual monitoring, configuration, deployment, and troubleshooting documentation.

### Changed
- Changed Admin API 5xx responses to return generic error envelopes without raw exception details or stack traces; safe validation details remain available for applicable 4xx responses.
- Changed the release workflow to set `ENVIRONMENT = "production"` in both Worker configurations before deployment, so production telemetry is no longer reported as `development`.
- Changed the frontend build to emit hidden source maps only when `GITHUB_ACTIONS` or `SENTRY_AUTH_TOKEN` is present, so a manual build and deploy can never publish source maps.
- Changed `VITE_SENTRY_REPLAY_ENABLED` handling to trim and lower-case the value, so `false`, `False`, and padded variants all disable error Replay.

### Security
- Removed the pull-request-target trigger and its release label from the production release workflow, so unmerged pull request code can no longer execute in jobs that hold Cloudflare, Azure, Entra, or Sentry credentials (#140).
- Added a credential-free `prepare-release` job that validates the release from a `main`-only policy checkout: an exact SemVer tag or a confirmed manual dispatch must resolve to a commit that is an ancestor of `origin/main`, and that immutable SHA is the only ref later jobs check out, build, or report.
- Added a trusted mainline ancestry recheck to every deploy job, run before dependency installation and before any secret-bearing step, so approval delays cannot deploy a commit that has left mainline.
- Serialised production releases with a non-cancelling `release-production` concurrency group, and documented the remaining release trust limitations: reviewer self-review and admin bypass are possible, a tag on a historical commit still runs that commit's workflow file, same-repo writers stay trusted, and `CLOUDFLARE_API_TOKEN`/`AZURE_STORAGE_SAS_TOKEN` remain repository secrets while only `SENTRY_AUTH_TOKEN` is environment-scoped.
- Removed customer destination URLs from frontend telemetry: URL store console errors now report only an error name, code, and HTTP status, and the link list, analytics, and top-link stats elements that render or attribute an `original_url` are excluded from Session Replay with `data-sentry-block`.
- Removed parsed request cookies from Admin API Sentry events in addition to the `Cookie` header, matching the redirect Worker.
- Removed the raw Entra object id/subject from the successful Admin API token-verification log.

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
- Monitoring dashboards

---

For more details on each release, see the [release notes](https://github.com/lettucebo/AkaMoney/releases).
