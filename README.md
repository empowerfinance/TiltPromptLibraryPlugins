# Tilt Prompt Library Plugins

[![Build & Release](https://github.com/empowerfinance/TiltPromptLibraryPlugins/actions/workflows/build-and-release.yml/badge.svg?branch=main)](https://github.com/empowerfinance/TiltPromptLibraryPlugins/actions/workflows/build-and-release.yml)

This repo hosts both plugin implementations:

- JetBrains Rider plugin: see [Rider/](./Rider/) and its [README](./Rider/README.md)
- VS Code extension: see [VSCode/](./VSCode/) and its [README](./VSCode/README.md)

## Releases

- Rider releases are created from tags matching `rider-vX.Y.Z` and attach the built ZIP artifact.
- VS Code releases are created from tags matching `vsc-vX.Y.Z` and attach the packaged `.vsix`.

For CI builds on main and PRs, both workflows validate builds without publishing a release.

