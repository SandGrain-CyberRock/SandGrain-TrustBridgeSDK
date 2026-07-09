"""config.py

Loads configuration for the SandGrain POC Cloud App from environment variables.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
from dotenv import load_dotenv

load_dotenv()

@dataclass(frozen=True)
class AppConfig:
    # CyberRock / SandGrain API base URL (e.g. https://iot-api.sandbox.sandgrain.io)
    cyberrock_base_url: str

    # MQTT / EMQX broker
    mqtt_host: str
    mqtt_port: int
    mqtt_username: str | None
    mqtt_password: str | None

    # Device scope (topics include this)
    device_id: str  # e.g. gw-001

    # TID -> credentials mapping (JSON)
    device_credentials_json: str

    # Cloudflare Access (for cloud-side RW generation endpoints)
    cf_access_client_id: str | None
    cf_access_client_secret: str | None

    # Credential source mode (two first-class modes, NOT a fallback chain):
    #   "trustbridge" -> resolve device/tenant/CF creds from the TrustBridge BE
    #                    database via {be_url}/devices/credentials-by-tid
    #   "standalone"  -> resolve creds from the local device_credentials.json
    credentials_source: str = "standalone"  # trustbridge | standalone

    # TrustBridge BE API base, e.g. http://be:3000/api (required when
    # credentials_source == "trustbridge").
    be_url: str | None = None

    # Message format over MQTT (JSON for this POC; protobuf is optional/placeholder)
    message_format: str = "json"  # json | protobuf


def load_config() -> AppConfig:
    return AppConfig(
        cyberrock_base_url=os.environ["CYBERROCK_BASE_URL"].rstrip("/"),
        mqtt_host=os.getenv("MQTT_HOST", "localhost"),
        mqtt_port=int(os.getenv("MQTT_PORT", "1883")),
        mqtt_username=os.getenv("MQTT_USERNAME") or None,
        mqtt_password=os.getenv("MQTT_PASSWORD") or None,
        device_id=os.getenv("DEVICE_ID", "gw-001"),
        device_credentials_json=os.getenv("DEVICE_CREDENTIALS_JSON", "./device_credentials.json"),
        cf_access_client_id=os.getenv("CF_ACCESS_CLIENT_ID") or None,
        cf_access_client_secret=os.getenv("CF_ACCESS_CLIENT_SECRET") or None,
        credentials_source=(os.getenv("CREDENTIALS_SOURCE", "standalone") or "standalone").strip().lower(),
        be_url=(os.getenv("BE_URL") or "").rstrip("/") or None,
        message_format=(os.getenv("MESSAGE_FORMAT", "json") or "json").lower(),
    )
