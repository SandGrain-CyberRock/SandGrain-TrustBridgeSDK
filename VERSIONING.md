# SDK Versioning and Release Management

## Overview

The Sandgrain SDK follows a release-stream-based versioning strategy.

A dedicated release branch is created for each SDK release stream, while Git tags are used to identify released versions, maintenance updates, and bug-fix releases within that stream.

## Branch Structure

### Development Branch

A single development branch is maintained for the next planned SDK release.

Example:

```text
development/v3.4.0
```

The development branch contains:

* New features
* Enhancements
* Ongoing development work
* Future SDK improvements

### Release Branches

Each SDK release stream is maintained in a dedicated release branch.

Examples:

```text
release/v3.1.0
release/v3.2.0
release/v3.3.0
```

Release branches are considered stable and production-ready.

They may receive:

* Bug fixes
* Security updates
* Maintenance improvements
* Minor non-breaking enhancements

## Tagging Strategy

Tags identify released versions within a release stream.

### Release Stream Example

```text
release/v3.2.0
├── v3.2.0
├── v3.2.1
└── v3.2.2
```

### Tag Types

#### Initial Release Tag

```text
v3.2.0
```

Represents the first production release for the release stream.

#### Maintenance Release Tag

```text
v3.2.1
v3.2.2
```

Represents:

* Bug fixes
* Security updates
* Minor enhancements

No breaking changes should be introduced through maintenance tags.

## Release Lifecycle

### Step 1 – Development

New functionality is developed in the active development branch.

Example:

```text
development/v3.4.0
```

### Step 2 – Release Branch Creation

When development is complete, a release branch is created.

Example:

```text
release/v3.4.0
```

### Step 3 – Initial Release

The first release tag is published.

Example:

```text
v3.4.0
```

### Step 4 – Maintenance Releases

Additional updates are published using tags.

Example:

```text
v3.4.1
v3.4.2
```

These tags remain associated with the same release branch.

## Supported Release Streams

Example:

```text
release/v3.1.0
release/v3.2.0
release/v3.3.0
```

Multiple release branches may be supported simultaneously.

This enables:

* Customer-specific support
* Long-term maintenance
* Security patching
* Controlled upgrade paths

## Best Practices

* Only one active development branch should exist at a time.
* Every production release must be identified by a Git tag.
* Release branches should remain stable after creation.
* Maintenance updates should be delivered through additional tags.
* Critical fixes should be applied to the appropriate release branch and tagged accordingly.
