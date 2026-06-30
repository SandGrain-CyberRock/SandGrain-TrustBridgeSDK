"""sandgrain_cloud_sdk

Core (transport-agnostic) Cloud SDK for the CyberRock/SandGrain authentication workflow.
"""

from .cyberrock_client import CyberRockClient
from .cloud_sdk import CloudSDK, CloudSDKConfig
from .credentials_store import (
    CredentialsStore,
    JsonFileCredentialsStore,
    DeviceCredentials,
    TenantCredentials,
)
from .exceptions import (
    CyberRockError,
    MissingTokenError,
    WorkflowTimeoutError,
    InvalidInputError,
    SDKError,
)
from .models import (
    TenantLoginResponse,
    ClaimTokenResponse,
    DeviceLoginResponse,
    IoTLoginResponse,
    RequestCWResponse,
    ReplyRWResponse,
    CheckAuthStatusResponse,
    RequestRWResponse,
    CheckRequestRWStatusResponse,
)
from .token_cache import TokenCache

__all__ = [
    # core
    "CyberRockClient",
    "CloudSDK",
    "CloudSDKConfig",
    "TokenCache",
    # credential store
    "CredentialsStore",
    "JsonFileCredentialsStore",
    "DeviceCredentials",
    "TenantCredentials",
    # exceptions
    "SDKError",
    "CyberRockError",
    "MissingTokenError",
    "WorkflowTimeoutError",
    "InvalidInputError",
    # models
    "TenantLoginResponse",
    "ClaimTokenResponse",
    "DeviceLoginResponse",
    "IoTLoginResponse",
    "RequestCWResponse",
    "ReplyRWResponse",
    "CheckAuthStatusResponse",
    "RequestRWResponse",
    "CheckRequestRWStatusResponse",
    "AuthenticationResult",
]
