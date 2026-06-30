"""device_store.py

Backwards compatible wrapper around :mod:`sandgrain_cloud_sdk.credentials_store`.

Earlier SDK versions used a `DeviceCredentialStore` keyed by PCCID.
Newer versions key by **TID** and also allow storing Tenant credentials.

Prefer importing from `sandgrain_cloud_sdk.credentials_store` directly.
"""

from __future__ import annotations

from .credentials_store import (
    CredentialsStore,
    JsonFileCredentialsStore,
)

# Backwards compatible aliases
DeviceCredentialStore = CredentialsStore
JsonFileDeviceCredentialStore = JsonFileCredentialsStore
