# Contributing to AkaMoney

English | [繁體中文](CONTRIBUTING.zh-TW.md)

Thank you for your interest in contributing to AkaMoney! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/AkaMoney.git`
3. Create a new branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes thoroughly
6. Commit your changes: `git commit -am 'Add some feature'`
7. Push to the branch: `git push origin feature/your-feature-name`
8. Create a Pull Request

## Development Setup

Follow the [SETUP.md](SETUP.md) guide to set up your development environment.

## Code Style

### TypeScript/JavaScript
- Use TypeScript for type safety
- Follow ESLint rules (if configured)
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

### Vue Components
- Use `<script setup>` syntax
- Use Composition API
- Keep components focused and reusable
- Use props and emits for component communication

### CSS
- Use Bootstrap classes when possible
- Keep custom CSS minimal
- Use scoped styles in Vue components
- Follow mobile-first approach

## Commit Messages

Follow conventional commits format:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `style:` for code style changes
- `refactor:` for code refactoring
- `test:` for test additions/changes
- `chore:` for maintenance tasks

Example: `feat: add QR code generation for short URLs`

## Testing

Before submitting a PR:
1. Test your changes locally
2. Test both frontend and backend
3. Test edge cases and error scenarios
4. Ensure no console errors
5. Test on different browsers (Chrome, Firefox, Safari)
6. Test responsive design on mobile

## Pull Request Guidelines

1. **Clear description**: Explain what changes you made and why
2. **Reference issues**: Link to related issues (e.g., "Fixes #123")
3. **Screenshots**: Include screenshots for UI changes
4. **Tests**: Add or update tests if applicable
5. **Documentation**: Update README.md or other docs if needed
6. **Clean commits**: Squash commits if necessary
7. **No merge conflicts**: Rebase on main branch

## Feature Requests

To request a new feature:
1. Check if it's already requested in Issues
2. Create a new issue with the "enhancement" label
3. Describe the feature and its use case
4. Explain why it would be valuable

## Bug Reports

To report a bug:
1. Check if it's already reported in Issues
2. Create a new issue with the "bug" label
3. Include:
   - Description of the bug
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots (if applicable)
   - Environment (browser, OS, Node version)

## Code Review Process

1. Maintainers will review your PR
2. Address any feedback or requested changes
3. Once approved, maintainers will merge your PR
4. Your contribution will be included in the next release

## Areas for Contribution

Here are some areas where contributions are welcome:

### Frontend
- UI/UX improvements
- Accessibility enhancements
- Mobile responsiveness
- Dark mode
- Internationalization (i18n)

### Backend
- API optimizations
- Rate limiting
- Caching strategies
- Additional analytics
- Export features

### Features
- QR code generation
- Password-protected links
- Custom domains per user
- Bulk URL creation
- Link scheduling
- A/B testing for links

### Documentation
- Tutorial videos
- API documentation
- Deployment guides
- Troubleshooting guides

### Testing
- Unit tests
- Integration tests
- E2E tests
- Performance tests

## Questions?

If you have questions:
- Check existing documentation
- Search closed issues
- Open a discussion in GitHub Discussions
- Ask in the PR comments

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
