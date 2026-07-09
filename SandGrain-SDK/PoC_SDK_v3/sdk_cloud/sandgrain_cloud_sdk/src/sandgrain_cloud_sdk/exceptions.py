"""exceptions.py

Exception hierarchy for the SandGrain Cloud SDK.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


class SDKError(Exception):
    """Base error for all SDK exceptions."""
    pass


@dataclass
class CyberRockError(SDKError):
    """Raised when an HTTP request to CyberRock/SandGrain fails or returns an unexpected body."""

    status: int
    message: str
    body: Optional[Dict[str, Any]] = None

    def __str__(self) -> str:
        return f"CyberRockError status={self.status} message={self.message}"


class MissingTokenError(SDKError):
    def __init__(self, token_type: str):
        super().__init__(f"Missing required token: {token_type}")
        self.token_type = token_type


class WorkflowTimeoutError(SDKError):
    def __init__(self, timeout_s: float):
        super().__init__(f"Workflow polling timed out after {timeout_s}s")
        self.timeout_s = timeout_s


class InvalidInputError(SDKError):
    pass
