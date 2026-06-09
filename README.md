# SDK-Versioning-Practice
Demonstration repository for enterprise SDK version management, release branching, tagging strategy, and compatibility management.

## Repository Overview

This repository follows a release-branch-based versioning strategy.

### Active Branches

```text
main
development/v3.4.0

release/v3.1.0
release/v3.2.0
release/v3.3.0
```

### Released Versions

```text
v3.1.0
v3.1.1

v3.2.0
v3.2.1
v3.2.2

v3.3.0
v3.3.1
v3.3.2
```

## Branch Strategy

### Development Branch

The development branch contains features planned for the next release stream.

Example:

```text
development/v3.4.0
```

### Release Branches

Each release stream is maintained in its own release branch.

Examples:

```text
release/v3.1.0
release/v3.2.0
release/v3.3.0
```

Release branches may receive:

* Minor enhancements
* Bug fixes
* Security updates
* Maintenance releases

## Documentation

* VERSIONING.md – Versioning and release process
* COMPATIBILITY.md – SDK compatibility matrix

## Support Policy

The latest release stream receives active development and maintenance.

Older release streams receive:

* Critical bug fixes
* Security updates

No new features are added to legacy release streams.
