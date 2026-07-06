# Versioning

This repository versions the Sandgrain SDK using a **release-branch-per-minor**
model with **tags** for every version published on a line.

## Release model

- Every minor release line gets its own branch: **`release/vX.Y.0`**
  (e.g. `release/v3.1.0`, `release/v3.2.0`, ...). That branch is the **main
  release** for the `X.Y` line.
- After the main release, all **bug fixes, enhancements and updates** for that
  line are committed to the same release branch and published as **tags**:
  `vX.Y.1`, `vX.Y.2`, ... — i.e. the `release/vX.Y.0` branch carries the whole
  **`X.Y.x`** series, and each release in the series is a tag on that branch.
- New feature work that changes the minor version starts a **new release
  branch** (`release/v3.2.0`, then `release/v3.3.0`, and so on) rather than
  landing on an existing line.
- `development/vX.Y.0` branches (where present) are the working/development
  lines feeding the corresponding `release/vX.Y.0` branch.

### Example

| Branch | Version line | Releases |
| ------ | ------------ | -------- |
| `release/v3.1.0` | 3.1.x | `v3.1.0` (main release), then tags `v3.1.1`, `v3.1.2`, ... for fixes/enhancements |
| `release/v3.2.0` | 3.2.x | `v3.2.0` (main release), then tags `v3.2.1`, `v3.2.2`, ... |
| `release/v3.3.0` | 3.3.x | `v3.3.0` (main release), then tags `v3.3.1`, ... |

To get an exact released version, check out its tag (e.g.
`git checkout v3.1.2`); to get the latest state of a line, check out its
release branch.

## This branch

`development/v3.1.0` — the development line for the **3.1.x** series, laid out
under `SDK/PoC_SDK_v3/`.

## Component versions on this branch

- The C firmware (SGR SDK under `poc_sdk_device/sdk_fw/` and
  `poc_sdk_gateway/sdk_fw/`) carries no version macro in code — its version is
  the version line of this branch.
- The Python Cloud SDK is independently versioned in its own
  `pyproject.toml`: `sandgrain-cloud-sdk` **0.3.0**
  (`SDK/PoC_SDK_v3/sdk_cloud/sandgrain_cloud_sdk/`).

## Note on the previous scheme

Earlier, each branch of this repository mirrored a specific upstream
`sandgrain-sdk` revision (`rev3.1`, `rev3.2-ARM`, `rev3.2-Mutual`,
`trustbridge-0.4`, ...). **That practice is retired** — the mapping is kept
only as historical context in old commit messages and is no longer how
versions are assigned. Going forward, versions follow the release model
described above.
