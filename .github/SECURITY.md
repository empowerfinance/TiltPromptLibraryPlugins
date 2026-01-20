# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

We only provide security updates for the latest release. Please ensure you're using the most recent version.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email the maintainers directly at security@tilt.com
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes

### What to Expect

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 1 week
- **Resolution timeline:** Depends on severity

### Severity Levels

| Severity | Response Time | Examples |
|----------|---------------|----------|
| Critical | 24-48 hours | Remote code execution, data exfiltration |
| High | 1 week | Privilege escalation, authentication bypass |
| Medium | 2 weeks | Information disclosure, XSS |
| Low | 1 month | Minor issues with limited impact |

## Security Best Practices

When contributing to this project:

- Never commit secrets, API keys, or credentials
- Keep dependencies up to date
- Follow secure coding practices
- Review your changes for potential vulnerabilities

## Scope

This security policy covers:
- VS Code Extension
- Rider Plugin
- Build and CI infrastructure

Thank you for helping keep this project secure!

