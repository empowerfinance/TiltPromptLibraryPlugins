# CI/CD Pipeline Documentation

## Overview

This repository uses GitHub Actions for continuous integration and delivery. The pipeline builds and tests both the **VS Code extension** (TypeScript) and **Rider plugin** (Kotlin), then creates combined releases on the main branch.

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Pull Request / Push to main                  │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
    ┌───────────────┐                   ┌───────────────┐
    │  build_rider  │                   │  build_vscode │
    │   (Kotlin)    │                   │  (TypeScript) │
    └───────────────┘                   └───────────────┘
            │                                   │
            │  • JDK 17 + Gradle               │  • Node.js 20
            │  • Unit tests                     │  • Vitest tests
            │  • JaCoCo coverage               │  • VSIX package
            │  • Plugin ZIP                     │
            └─────────────────┬─────────────────┘
                              │
                              ▼ (main branch only)
                    ┌───────────────┐
                    │    release    │
                    │               │
                    │ Creates GitHub│
                    │ Release with  │
                    │ both artifacts│
                    └───────────────┘
```

## Jobs

### 1. `build_rider` - Rider Plugin Build

| Step                         | Description                   | Timeout |
| ---------------------------- | ----------------------------- | ------- |
| Setup JDK 17                 | Temurin distribution          | -       |
| Setup Gradle 8.10.2          | With caching                  | -       |
| Warm IntelliJ Platform cache | Download IDE dependencies     | 25 min  |
| Run tests                    | `./gradlew test`              | 10 min  |
| Generate coverage report     | JaCoCo HTML/XML reports       | -       |
| Build plugin                 | `./gradlew buildPlugin`       | -       |
| Upload artifacts             | ZIP + test results + coverage | 30 days |

### 2. `build_vscode` - VS Code Extension Build

| Step                  | Description                  |
| --------------------- | ---------------------------- |
| Setup Node.js 20.18.1 | With npm caching             |
| Install dependencies  | `npm ci`                     |
| Run tests             | `npm test` (Vitest)          |
| Compile               | TypeScript compilation       |
| Package VSIX          | `@vscode/vsce package`       |
| Upload artifact       | VSIX file, 30 days retention |

### 3. `release` - Combined Release (main branch only)

| Step                  | Description                       |
| --------------------- | --------------------------------- |
| Download artifacts    | Both Rider ZIP and VS Code VSIX   |
| Create GitHub Release | Tag: `tilt-plugins-v{run_number}` |

## Artifacts

| Artifact Name                     | Contents                        | Retention |
| --------------------------------- | ------------------------------- | --------- |
| `plugin-distribution-{version}`   | Rider plugin ZIP                | 30 days   |
| `rider-test-results-{version}`    | Test HTML reports + XML results | 30 days   |
| `rider-coverage-report-{version}` | JaCoCo coverage reports         | 30 days   |
| `vscode-extension-{version}`      | VS Code VSIX package            | 30 days   |

## Accessing Artifacts

1. Go to **Actions** tab in GitHub
2. Click on a workflow run
3. Scroll to **Artifacts** section
4. Download the desired artifact

### Viewing Reports Locally

```bash
# Test results (Rider)
open Rider/build/reports/tests/test/index.html

# Coverage report (Rider)
open Rider/build/reports/jacoco/test/html/index.html
```

## Versioning

All artifacts use version `0.0.{run_number}` where `run_number` is the GitHub Actions run number. This provides:

- Unique, sequential versions
- Easy correlation between artifacts and workflow runs
- No manual version bumping required

## Triggers

| Event        | Branches | Jobs Run                           |
| ------------ | -------- | ---------------------------------- |
| Push         | `main`   | build_rider, build_vscode, release |
| Pull Request | `main`   | build_rider, build_vscode          |

## Troubleshooting

### Rider Tests Fail in CI but Pass Locally

1. **Check Java version**: CI uses JDK 17 (Temurin)
2. **Check Gradle version**: CI uses Gradle 8.10.2
3. **Check for environment dependencies**: Look for hardcoded paths or OS-specific code

### VS Code Tests Fail

1. **Check Node version**: CI uses Node.js 20.18.1
2. **Run `npm ci`** locally to match CI's clean install
3. **Check for missing mocks**: Vitest may need different mocks for CI

### Build Timeout

- IntelliJ Platform cache warm-up: 25 minute timeout
- Rider tests: 10 minute timeout
- Increase timeouts in `build-and-release.yml` if needed

### Coverage Report Not Generated

1. Verify tests ran successfully
2. Check JaCoCo plugin in `Rider/build.gradle.kts`
3. Review Gradle logs for errors

## Related Files

| File                                      | Purpose                        |
| ----------------------------------------- | ------------------------------ |
| `.github/workflows/build-and-release.yml` | Main CI workflow               |
| `Rider/build.gradle.kts`                  | Rider build config with JaCoCo |
| `VSCode/package.json`                     | VS Code build scripts          |
| `VSCode/vitest.config.ts`                 | Vitest test configuration      |
