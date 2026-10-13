# TrustBridge — MQTT Integration Reference

MQTT topics TrustBridge subscribes to for device authentication and lifecycle tracking, published by the gateway, on-device SDK, or cloud SDK. Each topic carries a JSON payload. Topics marked _(optional)_ aren't required for a minimal integration.

## 1. Device Online/Offline

Whether a leaf device is currently online or offline.

- **Topic:** `sandgrain/v1/{tid}/status`
- **Format:**
  ```json
  { "status": "online" }
  ```
- **Values:** `"online"`, `"offline"`

## 2. Gateway Online/Offline _(optional)_

Whether a gateway (edge device) is currently online or offline.

- **Topic:** `sandgrain/v1/{ip}/gw_status`
- **Format:**
  ```json
  { "status": "online" }
  ```
- **Values:** `"online"`, `"offline"`

## 3. Gateway Log

Step-by-step progress updates sent by the gateway while processing a device flow.

- **Topic:** `sandgrain/v1/{tid}/gw_log`
- **Format:**
  ```json
  {
    "step": "string",
    "status": "ok",
    "message": "string",
    "attempt": 1,
    "gateway_id": "string",
    "app_message_seq": 0
  }
  ```

## 4. Auth Result

Final result of a device authentication attempt.

- **Topic:** `sandgrain/v1/{tid}/auth_result`
- **Format:**
  ```json
  {
    "auth_status": "AUTH_OK",
    "gateway_id": "string",
    "app_message_seq": 0
  }
  ```
- **Values:** `"AUTH_OK"` — success, `"AUTH_NOK"` — failed

## 5. Claim Token

Sent when a device is being claimed; carries the claim token used to link the token with the tenant.

- **Topic:** `sandgrain/v1/{tid}/claim`
- **Format:**
  ```json
  { "claim_token_id": "string" }
  ```
