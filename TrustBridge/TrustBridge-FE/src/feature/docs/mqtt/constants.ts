import type { Doc } from './types';

export const ACCENT_COLORS: Record<Doc['accent'], string> = {
  teal: '#0F766E',
  indigo: '#4338CA',
};

export const DOCS: Doc[] = [
  {
    id: 'cloud',
    name: 'SandGrain Cloud SDK',
    subtitle: 'Gateway ↔ Cloud MQTT Topics & Message Formats',
    version: '0.4',
    audience: 'Integration / Client Engineering',
    accent: 'teal',
    sections: [
      {
        id: 'overview',
        title: 'Overview',
        intro:
          'The Cloud SDK runs as a service against the MQTT broker (EMQX). It subscribes to a single wildcard for all devices and answers each request on the matching response topic. In a gateway deployment the gateway relays each leaf device\u2019s authentication and firmware actions up to the broker; the Cloud SDK processes them against the SandGrain / CyberRock REST API and publishes the reply back down. In a standalone deployment the device speaks to the broker directly; the contract on the wire is identical. Every message carries a JSON envelope. Requests use the req topic; responses use the rsp topic. Topics and sections marked (optional) are not required for a minimal authentication integration.',
        fields: [
          { name: 'Subscribe (cloud)', desc: 'sandgrain/v1/+/req/+' },
          { name: 'Request topic', desc: 'sandgrain/v1/{tid}/req/{action}' },
          { name: 'Response topic', desc: 'sandgrain/v1/{tid}/rsp/{action}' },
          {
            name: 'Direction',
            desc: 'Request: gateway \u2192 cloud \u00b7 Response: cloud \u2192 gateway',
          },
          {
            name: 'QoS',
            desc: '1 (at-least-once; duplicates possible). No correlation id / msgId in this POC.',
          },
          {
            name: 'Key',
            desc: '{tid} is the CyberRock Token ID, lower-case hex. It is the only identifier; legacy PCC / ID / IoT aliases are not supported.',
          },
        ],
      },
      {
        id: 'request-envelope',
        title: 'Request Envelope',
        intro:
          'Published by the gateway (or device) on the req topic. Only payload is processed for the action; the other fields are metadata.',
        topic: {
          payload: {
            label: 'Format',
            json: `{
  "type": <action_type>,
  "payload": { ... },
  "crc": { ... },        // optional; see CRC
  "gateway_id": "string", // optional; relaying gateway's IP
  "flow_id": "string"    // optional; device-minted correlation id
}`,
          },
          fields: [
            {
              name: 'type',
              desc: 'Numeric action type; must agree with the {action} in the topic (see Message Types).',
            },
            {
              name: 'gateway_id',
              desc: 'The relaying gateway stamps its own broker-facing IP for cloud traceability. Absent for standalone / older gateways.',
            },
            {
              name: 'flow_id',
              desc: 'Device-minted, per-attempt id relayed by the gateway so one auth attempt correlates across device, gateway and cloud. When absent, the cloud mints its own.',
            },
          ],
        },
      },
      {
        id: 'response-envelope',
        title: 'Response Envelope',
        intro:
          'Published by the Cloud SDK on the rsp topic. type is echoed from the request.',
        topic: {
          payload: {
            label: 'Format',
            json: `{
  "type": <action_type>,
  "status": { "code": <int>, "result": "<string>" },
  "payload": { ... },
  "crc": { ... }  // optional; echoed only when the request carried CRC
}`,
          },
          fields: [
            {
              name: 'status.code / status.result',
              desc: 'Outcome classification (see Status Codes). code 0 / "OK" on success.',
            },
          ],
        },
      },
      {
        id: 'status-codes',
        title: 'Status Codes',
        table: {
          headers: ['Code', 'Name', 'Meaning'],
          rows: [
            ['0', 'OK', 'Success.'],
            ['10', 'NOT_OK', 'Unhandled error.'],
            ['11', 'JSON_INVALID', 'JSON parsing error.'],
            ['12', 'CRC_INVALID', 'Invalid CRC.'],
            ['13', 'CYBERROCK_ERROR', 'HTTP request to CyberRock failed.'],
            ['14', 'AUTH_NOT_OK', 'Authorization error.'],
            [
              '15',
              'PARAM_INVALID',
              'Invalid key. Allowed: TID, CW, RW, transactionId, auth_status, FW_VERIFY, validation_status.',
            ],
            ['16', 'KEY_ERROR', 'Key not recognized.'],
            [
              '17',
              'ACTION_INVALID',
              'Invalid action, or type disagrees with the topic action.',
            ],
            ['18', 'TIMEOUT_ERROR', 'Timeout (handler cap is 25s).'],
          ],
        },
      },
      {
        id: 'message-types',
        title: 'Message Types',
        intro: 'The type field maps 1:1 to the topic action:',
        table: {
          headers: ['Type', 'Action'],
          rows: [
            ['0', 'requestCW'],
            ['1', 'replyRW'],
            ['2', 'requestRW'],
            ['3', 'checkAuthStatusCloud'],
            ['6', 'fwVerification'],
            ['7', 'fwInstallation'],
          ],
        },
      },
      {
        id: 'requestCW',
        title: '1 \u00b7 requestCW',
        intro:
          'Opens an authentication attempt: the cloud requests a Challenge Word (CW) from CyberRock for the token and returns it with the CyberRock transaction id.',
        topic: {
          reqTopic: 'sandgrain/v1/{tid}/req/requestCW',
          rspTopic: 'sandgrain/v1/{tid}/rsp/requestCW',
          request: { label: 'Request payload', json: `{ "TID": "..." }` },
          response: {
            label: 'Response payload',
            json: `{ "CW": "...", "transactionId": "..." }`,
          },
        },
      },
      {
        id: 'replyRW',
        title: '2 \u00b7 replyRW',
        intro:
          'The device has computed the Response Word (RW) from the CW; the cloud replies the RW to CyberRock and confirms the attempt.',
        topic: {
          reqTopic: 'sandgrain/v1/{tid}/req/replyRW',
          rspTopic: 'sandgrain/v1/{tid}/rsp/replyRW',
          request: {
            label: 'Request payload',
            json: `{
  "TID": "...",
  "CW": "...",
  "RW": "...",
  "transactionId": "..."
}`,
          },
          response: {
            label: 'Response payload',
            json: `{ "transactionId": "..." }`,
          },
          note: 'On a first-enrollment attempt the response payload may also carry claim_token_id. In TrustBridge mode the cloud forwards it to the backend on sandgrain/v1/{tid}/claim (see Claim Forward).',
        },
      },
      {
        id: 'requestRW',
        title: '3 \u00b7 requestRW',
        intro:
          'Simplified flow for constrained devices: the device sends the CW and the cloud asks CyberRock to generate the RW, polling internally and returning it directly. The device does not poll for RW status.',
        topic: {
          reqTopic: 'sandgrain/v1/{tid}/req/requestRW',
          rspTopic: 'sandgrain/v1/{tid}/rsp/requestRW',
          request: {
            label: 'Request payload',
            json: `{
  "TID": "...",
  "CW": "...",
  "transactionId": "..."
}`,
          },
          response: { label: 'Response payload', json: `{ "RW": "..." }` },
          note: 'The cloud blocks internally until the RW is generated or the handler timeout (25s) fires.',
        },
      },
      {
        id: 'checkAuthStatusCloud',
        title: '4 \u00b7 checkAuthStatusCloud',
        intro:
          'A fire-and-forget notification of the authentication outcome. The Cloud SDK intentionally sends no response on this action.',
        topic: {
          reqTopic: 'sandgrain/v1/{tid}/req/checkAuthStatusCloud',
          request: {
            label: 'Request payload',
            json: `{ "TID": "...", "auth_status": "..." }`,
          },
          response: null,
          note: 'No rsp message is published. The cloud logs the attempt and returns nothing.',
        },
      },
      {
        id: 'fwVerification',
        title: '5 \u00b7 fwVerification',
        intro:
          'The device reports whether a firmware image is valid. The RW carries the verification value; the CW behind it is the firmware hash. The cloud stores the result for the TID/RW pair and marks the image allowed or denied for installation.',
        topic: {
          reqTopic: 'sandgrain/v1/{tid}/req/fwVerification',
          rspTopic: 'sandgrain/v1/{tid}/rsp/fwVerification',
          request: {
            label: 'Request payload',
            json: `{
  "TID": "...",
  "FW_VERIFY": "...",
  "RW": "..."
}`,
          },
          response: {
            label: 'Response payload',
            json: `{
  "permission": "ALLOWED | DENIED",
  "verificationRW": "..."
}`,
          },
        },
      },
      {
        id: 'fwInstallation',
        title: '6 \u00b7 fwInstallation',
        intro:
          'The device validates a firmware installation. The cloud first checks that a prior firmware verification for this TID exists and was approved, then requests a fresh RW from CyberRock and compares it. A successful installation consumes the stored verification permission (single use).',
        topic: {
          reqTopic: 'sandgrain/v1/{tid}/req/fwInstallation',
          rspTopic: 'sandgrain/v1/{tid}/rsp/fwInstallation',
          request: {
            label: 'Request payload',
            json: `{
  "TID": "...",
  "CW": "...",
  "RW": "..."
}`,
          },
          response: {
            label: 'Response payload',
            json: `{
  "FW_INSTALLATION": "OK | NOK",
  "verificationRW": "..."
}`,
          },
        },
      },
      {
        id: 'claim-forward',
        title: 'Claim Forward (optional)',
        intro:
          'TrustBridge mode only. When replyRW yields a claim token, the cloud hands it to the backend so it can run the tenant-api claim flow. Off unless explicitly enabled.',
        topic: {
          topic: 'sandgrain/v1/{tid}/claim',
          direction: 'cloud \u2192 backend',
          payload: {
            label: 'Format',
            json: `{ "TID": "...", "claim_token_id": "..." }`,
          },
        },
      },
      {
        id: 'cloud-log',
        title: 'Cloud Trace Log (optional)',
        intro:
          'Diagnostic mirror of the per-request trace, published only when TRACE_LOG_MQTT is enabled. Mirrors the gateway\u2019s gw_log; QoS 0, fire-and-forget. Never carries CW / RW / HCW / HRW \u2014 crypto material is never logged.',
        topic: {
          topic: 'sandgrain/v1/{tid}/cloud_log',
          direction: 'cloud \u2192 observers / backend',
          fields: [
            {
              name: 'Fields',
              desc: 'timestamp, component, level, message, status, and the per-request envelope: flow_id, request_originator, gateway_id, event_scope, device_id, app_seq_scope, app_message_seq, action (plus per-call extras: req_id, step, event, reason, duration_ms, http_status, \u2026).',
            },
          ],
        },
      },
      {
        id: 'crc',
        title: 'CRC Integrity (optional)',
        intro:
          'Disabled by default and enabled per-message: it applies whenever the request envelope includes a crc object.',
        fields: [
          {
            name: 'Algorithm',
            desc: 'CRC16 / CCITT-FALSE over the UTF-8 string of each field value, hex.',
          },
          {
            name: 'Protected fields',
            desc: 'TID, CW, RW, transactionId. Each present protected field must have a matching CRC entry, and crc must not name a field absent from the payload (strict).',
          },
          {
            name: 'On response',
            desc: 'When the request carried CRC, the cloud includes a crc object over the protected fields present in the response payload.',
          },
          {
            name: 'Failure',
            desc: 'A mismatch or malformed crc returns status 12 / CRC_INVALID.',
          },
        ],
      },
      {
        id: 'source',
        title: 'Source',
        note: 'PoC_SDK_v3/sdk_cloud/application_PoC_MQTT (protocol.py, main.py, dispatcher.py, trace_log.py, README) and the gateway port PoC_SDK_v3/poc_sdk_gateway/app/port/port_comm.c. Credentials are never sent over MQTT; the cloud loads them internally by TID.',
      },
    ],
  },
  {
    id: 'trustbridge',
    name: 'TrustBridge',
    subtitle: 'Accepted MQTT Topics & Message Formats',
    version: '0.4',
    audience: 'Integration / Client Engineering',
    accent: 'indigo',
    sections: [
      {
        id: 'overview',
        title: 'Overview',
        intro:
          'The gateway publishes each message in the exact JSON format shown below, on the matching MQTT topic. TrustBridge subscribes to these topics and receives the messages in that format. Topics marked (optional) are not required for a minimal integration.',
      },
      {
        id: 'device-status',
        title: '1 \u00b7 Device Online/Offline',
        intro: 'Tells us whether a leaf device is currently online or offline.',
        topic: {
          topic: 'sandgrain/v1/{tid}/status',
          payload: { label: 'Format', json: `{ "status": "online" }` },
          possibleValues: [
            { name: 'online', desc: 'Device is online' },
            { name: 'offline', desc: 'Device is offline' },
          ],
        },
        note: 'Offline is not sent by the device1 it uses MQTT Last Will (LWT). On connect, the device registers a will with the broker: this topic, payload { "status": "offline" }, retained. The broker only publishes it if the connection drops uncleanly (crash, network loss) not on a graceful disconnect. So "online" is sent explicitly by the device, but "offline" is fired by the broker itself, sometimes with a short delay.',
      },
      {
        id: 'gateway-status',
        title: '2 \u00b7 Gateway Online/Offline (optional)',
        intro:
          'Tells us whether a gateway (edge device) is currently online or offline.',
        topic: {
          topic: 'sandgrain/v1/{ip}/gw_status',
          payload: { label: 'Format', json: `{ "status": "online" }` },
          possibleValues: [
            { name: 'online', desc: 'Gateway is online' },
            { name: 'offline', desc: 'Gateway is offline' },
          ],
        },
        note: 'Offline is not sent by the gateway it uses MQTT Last Will (LWT). On connect, the gateway registers a will with the broker: this topic, payload { "status": "offline" }, retained. The broker only publishes it if the connection drops uncleanly (crash, network loss) not on a graceful disconnect. So "online" is sent explicitly by the gateway, but "offline" is fired by the broker itself, sometimes with a short delay.',
      },
      {
        id: 'gateway-log',
        title: '3 \u00b7 Gateway Log',
        intro:
          'Step-by-step progress updates sent by the gateway while it processes a device flow.',
        topic: {
          topic: 'sandgrain/v1/{tid}/gw_log',
          payload: {
            label: 'Format',
            json: `{
  "step": "string",
  "status": "ok",
  "message": "string",
  "attempt": 1,
  "gateway_id": "string",
  "app_message_seq": 0
}`,
          },
        },
      },
      {
        id: 'auth-result',
        title: '4 \u00b7 Auth Result',
        intro: 'Final result of a device authentication attempt.',
        topic: {
          topic: 'sandgrain/v1/{tid}/auth_result',
          payload: {
            label: 'Format',
            json: `{
  "auth_status": "AUTH_OK",
  "gateway_id": "string",
  "app_message_seq": 0
}`,
          },
          possibleValues: [
            { name: 'AUTH_OK', desc: 'Authentication succeeded' },
            { name: 'AUTH_NOK', desc: 'Authentication failed' },
          ],
        },
      },
      {
        id: 'claim-token',
        title: '5 \u00b7 Claim Token',
        intro:
          'Sent when a device is being claimed; carries the claim token used to link the token with the tenant.',
        topic: {
          topic: 'sandgrain/v1/{tid}/claim',
          payload: { label: 'Format', json: `{ "claim_token_id": "string" }` },
        },
      },
    ],
  },
];
