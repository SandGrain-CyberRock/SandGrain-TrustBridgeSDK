# SandGrain POC – Mutual Authentication Cloud App (MQTT/EMQX)

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

> ℹ️ **Note about alternative handler**
>
> The original asynchronous implementation — where the embedded explicitly polls
> for the RW using `checkRequestRWStatus` — is preserved as
> `handlers_alternative.py`.
>
> The default implementation used by the app is `handlers.py` (single-call `requestRW`).

---

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

---

## MQTT topics

Topics include a `device_id` segment and an `action` segment.

The Cloud POC app subscribes to **all devices**:

- `sandgrain/v1/+/req/+`

Requests (embedded → cloud):

- `sandgrain/v1/{device_id}/req/requestCW`
- `sandgrain/v1/{device_id}/req/replyRW`
- `sandgrain/v1/{device_id}/req/checkAuthStatus`
- `sandgrain/v1/{device_id}/req/requestRW`
- (optional, only with `handlers_alternative.py`) `sandgrain/v1/{device_id}/req/checkRequestRWStatus`

Responses (cloud → embedded):

- `sandgrain/v1/{device_id}/rsp/<same action>`

QoS: this POC uses `qos=1`.

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

## Running the application

```bash
pip install -r requirements.txt
python -m app.main
```
