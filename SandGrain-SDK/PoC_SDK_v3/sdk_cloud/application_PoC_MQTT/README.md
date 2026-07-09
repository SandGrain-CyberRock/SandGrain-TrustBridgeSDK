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
- Cloud replies RW to CyberRock and polls `checkAuthStatus`.

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
- The Cloud stores the verification result for that TID and RW pair.
- If the verification result is FW_OK, the firmware is marked as allowed for installation.
- If the verification result is not FW_OK, the firmware is marked as not allowed for installation.

### 2) Firmware installation (fwInstallation)
- During installation, the embedded requests a token for a new RW.
- The embedded sends the TID, CW, and RW to the Cloud so the installation can be validated.
- Before calling CyberRock, the Cloud first checks whether firmware verification was previously completed and accepted for that TID.
- This validation is based on the earlier fwVerification step.
- The Cloud derives the verification RW from the installation CW and uses it to find the stored verification record.
- If there is no previous valid firmware verification, installation is rejected.
- If firmware verification exists but was not approved, installation is also rejected.
- If firmware verification is valid, the Cloud requests a new RW from CyberRock and compares it with the RW received from the embedded.
- If both values match, FW_INSTALLATION is returned as OK.
- If they do not match, FW_INSTALLATION is returned as NOK.
- After a successful installation, the stored firmware verification permission is consumed, so it cannot be reused.

## Configuration

This app loads settings from environment variables (see `app/config.py`).

1) Copy the example file:

```bash
cp .env.example .env
```

2) Edit `.env`:

- `CYBERROCK_BASE_URL` – base URL of the SandGrain/CyberRock API
- `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD` – MQTT/EMQX broker settings
- `DEVICE_CREDENTIALS_JSON` – path to a JSON file mapping `TID -> credentials` (see below)
- `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` – **optional**, only needed if your API is protected by Cloudflare Access
  (used for `requestRW` in the default handler, and also for `checkRequestRWStatus` in the alternative handler)

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

CRC is automatically enabled when an incoming request includes a CRC field in the frame. In that case, the CRC of the request is checked and validated, and the response is sent including the CRC of the payload.

This mechanism is used to ensure data integrity.

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
  "payload": { }
}
```

Only `payload` is processed by the Cloud POC app.

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
| 10   | NOT_OK           | Unhandled error                                                             |
| 11   | JSON_INVALID     | JSON parsing error                                                          |
| 12   | CRC_INVALID      | Invalid CRC                                                                 |
| 13   | CYBERROCK_ERROR  | When HTTP request to CyberRock fails                                        |
| 14   | AUTH_NOT_OK      | Authorization error                                                         |
| 15   | PARAM_INVALID    | Invalid key parameter. Parameters must be VALID_FIELDS = ('TID', 'CW', 'RW', 'transactionId', 'auth_status') |
| 16   | KEY_ERROR        | When a key is not recognized                                                |
| 17   | ACTION_INVALID   | Invalid action or type                                                      |
| 18   | TIMEOUT_ERROR    | Timeout error                                                               |


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
{ "transactionId": "..." }
```

---

### `requestRW` (**cloud-computed RW, single call**)
**Input**
```json
{
  "TID": "...",
  "CW": "...",
  "transactionId": "..."
}
```

**Output**
```json
{
  "RW": "..."
}
```

The Cloud App waits internally until the RW is generated or a timeout occurs.

---
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
{ "transactionId": "..." }
```

---

### `fwVerification`
**Input**
```json
{
  "TID": "...",
  "FW_VERIFY": "...",
  "RW": "..."
}
```

**Output**
```json
{
  "permission": "ALLOWED | DENIED",
  "verificationRW": "..."
}
```
---

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

**Output**
```json
{
  "FW_INSTALLATION": "OK | NOK",
  "verificationRW": "..."
}
```
---


## Running the application

```bash
pip install -r requirements.txt
python -m app.main
```
