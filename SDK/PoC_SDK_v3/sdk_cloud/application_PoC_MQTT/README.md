# SandGrain POC – Mutual Authentication and Firmware Installation Cloud App (MQTT/EMQX)

This application is a runnable **POC service** (not a library). It connects:

- an MQTT broker (EMQX)
- the **SandGrain Cloud SDK** (Python) to call SandGrain / CyberRock REST APIs

The goal is to test end-to-end authentication flows between the Embedded side and the Cloud side using MQTT messages.

---

## What “mutual authentication” means in this POC

There are **two directions** for generating the Response Word (RW):

### 1) Embedded-calculated RW
- Cloud requests a Challenge Word (CW) from CyberRock.
- Embedded computes RW from the token IC and sends it to the Cloud.
- Cloud replies RW to CyberRock and polls `checkAuthStatus` until a terminal status.

### 2) Cloud-calculated RW (**simplified for embedded**)
- Embedded requests a CW (`requestCW`).
- Embedded sends the CW to the Cloud and asks CyberRock to generate RW (`requestRW`).
- **The Cloud polls CyberRock internally and returns the RW directly to the embedded.**

The embedded does **not** poll for RW status.

## What "firmware verification and installation" means in this POC

There are two firmware-related flows:

### 1) Firmware verification (fwVerification)
- The embedded sends a notification indicating whether a firmware image is valid or not.
- It sends the TID, the verification result (FW_VERIFY), and the RW.
- In this flow, the RW represents the firmware verification value.
- The Challenge Word (CW) associated with that RW is the firmware hash.
- The Cloud stores the verification result for that TID and RW pair
  (in-memory, with a **5-minute TTL**).
- If the verification result is FW_OK, the firmware is marked as allowed for installation.
- If the verification result is not FW_OK, the firmware is marked as not allowed for installation.

### 2) Firmware installation (fwInstallation)
- During installation, the embedded requests a token for a new RW.
- The embedded sends the TID, CW, and RW to the Cloud so the installation can be validated.
- Before calling CyberRock, the Cloud first checks whether firmware verification was previously completed and accepted for that TID.
- This validation is based on the earlier fwVerification step.
- The Cloud derives the verification RW from the installation CW (the 64-hex-char
  CW must be the verification RW repeated twice: `CW = RW_verify || RW_verify`)
  and uses it to find the stored verification record.
- If there is no previous valid (non-expired) firmware verification, installation is rejected.
- If firmware verification exists but was not approved, installation is also rejected.
- If firmware verification is valid, the Cloud requests a new RW from CyberRock and compares it with the RW received from the embedded.
- If both values match, FW_INSTALLATION is returned as OK.
- If they do not match, FW_INSTALLATION is returned as NOK.
- After a successful installation, the stored firmware verification permission is consumed, so it cannot be reused.

## Configuration

This app loads settings from environment variables (see `app/config.py`, loaded via `python-dotenv`).

1) Copy the example file:

```bash
cp .env.example .env
```

2) Edit `.env`:

- `CYBERROCK_BASE_URL` – base URL of the SandGrain/CyberRock API (**required**)
- `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD` – MQTT/EMQX broker settings
  (defaults: `localhost:1883`, no credentials)
- `DEVICE_CREDENTIALS_JSON` – path to a JSON file mapping `TID -> credentials` (see below);
  default `./device_credentials.json`
- `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` – **optional**, only needed if your API is protected by Cloudflare Access
  (used by the `/api/device/*` calls, e.g. `requestCW`, `replyRW`, `requestRW`)
- `MESSAGE_FORMAT` – optional, `json` (default); `protobuf` is a placeholder and not implemented

> Note: `DEVICE_ID` exists in `.env.example` for historical reasons, but the app currently runs in **multi-device mode**
> and derives `device_id` from the MQTT topic (see below).

### Device credentials JSON format

See `device_credentials_example.json`:

```json
{
  "tenant": { "email": "example@example.com", "password": "Passw0rd!" },
  "devices": {
    "<TID>": { "username": "iot-example", "password": "pswd_example123!" }
  }
}
```

Embedded does **not** send credentials over MQTT.  
The cloud side loads credentials internally based on `TID`.


### CRC Support
CRC support is **optional** and is **disabled by default**.

CRC is automatically enabled when an incoming request includes a `crc` object in the envelope. In that case, the CRC of the request is checked and validated, and the response is sent including the CRC of the payload.

- Algorithm: **CRC-16/CCITT-FALSE** (init `0xFFFF`), computed over the UTF-8 bytes
  of each field value, encoded as 4 hex digits.
- The `crc` object maps field names to their CRC, e.g. `"crc": {"TID": "1a2b", "CW": "..."}`.
- Protected fields: `TID`, `CW`, `RW`, `transactionId`. When CRC is enabled, every
  protected field present in the payload **must** have a matching CRC entry, and every
  CRC key must exist in the payload; any mismatch is rejected with code 12 (`CRC_INVALID`).

On the device side, the CRC is processed only if the CRC field is present. If the field is not included, CRC handling is considered disabled.

---

## MQTT topics

Topics include a `device_id` segment and an `action` segment.

The Cloud POC app subscribes to **all devices**:

- `sandgrain/v1/+/req/+`

Requests (embedded → cloud):

- `sandgrain/v1/{device_id}/req/requestCW`
- `sandgrain/v1/{device_id}/req/replyRW`
- `sandgrain/v1/{device_id}/req/requestRW`
- `sandgrain/v1/{device_id}/req/checkAuthStatusCloud` (accepted, but no response is published)
- `sandgrain/v1/{device_id}/req/fwVerification`
- `sandgrain/v1/{device_id}/req/fwInstallation`

Responses (cloud → embedded):

- `sandgrain/v1/{device_id}/rsp/<same action>`

QoS: this POC uses `qos=1`.
Ensures the message is delivered, but allows duplicates to achieve that reliability.

---

## MQTT envelope

### Requests
```json
{
  "type": <message_type>,
  "payload": { },
  "crc": { }
}
```

`type` must match the action in the topic (`0` requestCW, `1` replyRW, `2` requestRW,
`3` checkAuthStatusCloud, `6` fwVerification, `7` fwInstallation). `crc` is optional (see above).

### Responses

```json
{
  "type": <action_type>,
  "status": {
    "code": <status_code>,
    "result": <status_result>
  },
  "payload": { }
}
```

| Code | Result           | Description                                                                 |
|------|------------------|-----------------------------------------------------------------------------|
| 0    | OK               |                                                                             |
| 10   | NOT_OK           | Unhandled error / unknown action                                            |
| 11   | JSON_INVALID     | JSON parsing error (envelope level; `type` is echoed as -1)                 |
| 12   | CRC_INVALID      | Invalid CRC — also used as FW_INSTALL_NOT_ALLOWED when `fwInstallation` has no valid prior verification |
| 13   | CYBERROCK_ERROR  | When HTTP request to CyberRock fails                                        |
| 14   | AUTH_NOT_OK      | Authorization error                                                         |
| 15   | PARAM_INVALID    | Invalid key parameter. Allowed payload keys: `TID`, `CW`, `RW`, `transactionId`, `auth_status`, `FW_VERIFY`, `validation_status` |
| 16   | KEY_ERROR        | When a key is not recognized                                                |
| 17   | ACTION_INVALID   | Invalid action or type / action mismatch                                    |
| 18   | TIMEOUT          | Timeout error (handler hard-timeout is 25 s; internal polling 20 s at 0.5 s intervals) |


There is **no correlation id / msgId** in this POC.

---

## Identifiers

All actions require:

- `TID`

Legacy identifiers (PCC, ID, PCCID, IoT aliases) are **not supported**.

---

## Actions

### `requestCW`
**Input**
```json
{ "TID": "..." }
```

**Output**
```json
{ "CW": "...", "transactionId": "..." }
```

---

### `replyRW` (embedded-computed RW)
**Input**
```json
{
  "TID": "...",
  "CW": "...",
  "RW": "...",
  "transactionId": "..."
}
```

**Output**
```json
{ "auth_status": "..." }
```

The Cloud forwards the RW to CyberRock and polls `checkAuthStatus` internally
until a terminal status, which is returned as `auth_status`.

---

### `requestRW` (**cloud-computed RW, single call**)
**Input**
```json
{
  "TID": "...",
  "CW": "..."
}
```

(`transactionId` may be included but is ignored.)

**Output**
```json
{
  "RW": "..."
}
```

The Cloud App waits internally until the RW is generated or a timeout occurs.

---

### `fwVerification`
**Input**
```json
{
  "TID": "...",
  "FW_VERIFY": "FW_OK | FW_NOK",
  "RW": "..."
}
```

`RW` must be 32 hex characters (16 bytes).

**Output**
```json
{
  "permission": "ALLOWED | DENIED",
  "verificationRW": "..."
}
```

The stored permission expires after **5 minutes**.

---

### `fwInstallation`
**Input**
```json
{
  "TID": "...",
  "CW": "...",
  "RW": "..."
}
```

`CW` must be 64 hex characters, formed by repeating the verification RW twice.

**Output**
```json
{
  "FW_INSTALLATION": "OK | NOK",
  "verificationRW": "..."
}
```

---

## Running the application

Locally:

```bash
pip install -r requirements.txt
python -m app.main
```

The app maintains a pool of 4 SDK instances (each with its own HTTP session)
and dispatches incoming MQTT requests concurrently.

With Docker (from `../`, i.e. `sdk_cloud/`):

```bash
docker compose up
```

This starts an **EMQX** broker (ports 1883 MQTT, 18083 dashboard) and the cloud
app (built from `../Dockerfile`, running `python -m app.main`). The app reads
`.env` from this directory and mounts `device_credentials.json` into the
container — when running under compose, set `MQTT_HOST=emqx` in `.env` so the
app reaches the broker by its service name.
