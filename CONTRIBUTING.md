# Contributing to Tilt Prompt Library Plugins

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## ⚠️ Important: Keep Both Plugins in Sync

**The VS Code extension and Rider plugin are maintained and versioned together.** When adding features or fixing bugs:

- **If you change one, you must change the other.** Both plugins should have feature parity.
- **Both plugins are released together** with the same version number.
- **PRs that only update one plugin** will be asked to include the corresponding changes in the other, unless the change is platform-specific (e.g., VS Code API workaround).

This ensures users get a consistent experience regardless of which IDE they use.

## 🚀 Getting Started

### Prerequisites

**VS Code Extension:**

- Node.js 18+
- VS Code 1.85+

**Rider Plugin:**

- JDK 21
- JetBrains Rider 2025.2+

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub
2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR-USERNAME/TiltPromptLibraryPlugins.git
   cd TiltPromptLibraryPlugins
   ```
3. **Set up the upstream remote:**
   ```bash
   git remote add upstream https://github.com/empowerfinance/TiltPromptLibraryPlugins.git
   ```

### VS Code Extension Development

```bash
cd VSCode
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

### Rider Plugin Development

```bash
cd Rider
./gradlew runIde  # Windows: .\gradlew.bat runIde
```

## 📝 Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/add-search-functionality`
- `fix/sync-error-handling`
- `docs/update-readme`

### Commit Messages

Write clear, concise commit messages:

- Use the imperative mood ("Add feature" not "Added feature")
- Keep the first line under 72 characters
- Reference issues when applicable

**Good examples:**

```
Add real-time search filtering to prompt list
Fix GitHub sync failing on Windows paths
Update README with new installation steps
```

### Code Style

- **TypeScript (VS Code):** Follow existing patterns, use TypeScript strict mode
- **Kotlin (Rider):** Follow Kotlin coding conventions
- **General:** Keep functions focused, add comments for complex logic

## ✅ Testing

### VS Code Extension

```bash
cd VSCode
npm test              # Run all tests
npm run test:watch    # Watch mode
```

### Rider Plugin

```bash
cd Rider
./gradlew test
```

**Always run tests before submitting a PR!**

## 🔄 Pull Request Process

1. **Sync with upstream:**

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Create a feature branch:**

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes** and commit them

4. **Push to your fork:**

   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request** against the `main` branch

6. **Fill out the PR template** completely

7. **Address review feedback** promptly

### PR Requirements

- [ ] **Both plugins updated** (if adding features or fixing shared bugs)
- [ ] All tests pass (both VS Code and Rider)
- [ ] Code follows project style
- [ ] Documentation updated if needed
- [ ] PR description clearly explains the change

## 🐛 Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml) and include:

- Plugin version and IDE version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs or screenshots

## 💡 Suggesting Features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml) and describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## 📚 Documentation

- Update README.md for user-facing changes
- Update inline comments for complex code
- Add JSDoc/KDoc comments for public APIs

## ⚖️ Code of Conduct

Please be respectful and constructive in all interactions. We're building something useful together!

## 🙏 Thank You!

Every contribution helps make these plugins better. Thank you for being part of the community!
