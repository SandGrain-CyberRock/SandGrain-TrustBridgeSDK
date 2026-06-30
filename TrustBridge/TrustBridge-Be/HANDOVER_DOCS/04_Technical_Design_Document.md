# Technical Design Document — Platform Integration & IoT Authentication Gateway

**Project:** TrustBridge
**Document Reference:** TB-TDD-001
**Revision:** 2.0
**Status:** Approved
**Prepared for:** SandGrain BV
**Classification:** Confidential

---

## Document Control

| Field | Value |
|---|---|
| Project Name | TrustBridge |
| Document Type | Technical Design Document — Component Integration & Security |
| Intended Audience | SandGrain BV — Engineering |
| Related Documents | TB-REQ-001 Rev 1.1 (Requirements Specification), TB-FDD-001 Rev 1.0 (Functional Design Document), TB-TDD-002 Rev 1.0 (Full Platform Architecture) |
| Scope | Cross-component interaction design: Backend (NestJS), Frontend (React), Cloud SDK (Python), and Hardware Gateway (C), as they cooperate to deliver a secure, multi-tenant IoT authentication gateway |
| Supersedes | TB-TDD-001 Rev 1.0 (Cloud SDK Architecture — now absorbed into this document) |

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture & Data Flow](#2-architecture--data-flow)
   - 2.1 Multi-Tenant Isolation Strategy
   - 2.2 Asynchronous Authentication Flow
   - 2.3 Credential Delivery — The Inline MQTT Payload
   - 2.4 Component Responsibility Matrix
3. [State Machine & Lifecycle](#3-state-machine--lifecycle)
   - 3.1 Device Status Transitions
   - 3.2 Terminal State Guard
   - 3.3 Lifecycle Bulk-Auth Bypass
   - 3.4 Gateway Log Terminal Detection
4. [Security & Identity Management](#4-security--identity-management)
   - 4.1 User Authentication & Session Lifecycle
   - 4.2 Account Lockout Mechanism
   - 4.3 Credential Storage & Masking
   - 4.4 Credential Delivery to the SDK
   - 4.5 Token Caching Architecture
5. [Observability & Logging](#5-observability--logging)
   - 5.1 DeviceLog — Technical Step-Level Debugging
   - 5.2 SystemActivity — Business Audit Trail
   - 5.3 Comparison Matrix
6. [Error Handling & Resilience](#6-error-handling--resilience)
   - 6.1 NOT_READY vs AUTH_FAIL — Distinguishing Transient from Terminal
   - 6.2 MQTT Timeout & Retry Policy
   - 6.3 Timeout Cascade Model
   - 6.4 Debouncing & Race Condition Guards
   - 6.5 Email & Async Operation Resilience
7. [Database Schema — Core Entities](#7-database-schema--core-entities)
   - 7.1 Device
   - 7.2 DeviceGroup
   - 7.3 DeviceLog
   - 7.4 User
   - 7.5 TenantUserCredential
8. [Business Rule Traceability Index](#8-business-rule-traceability-index)

---

## 1. System Overview

TrustBridge is a multi-tenant management layer that positions itself between enterprise customer organisations and SandGrain BV's CyberRock hardware authentication service. Its purpose is to provide a secure, auditable, and governed platform through which SandGrain hardware security tokens (embedded cryptographic ICs) are registered, authenticated, and managed across their full operational lifecycle.

The platform operates as a **secure IoT authentication gateway**, mediating every interaction between a physical hardware token and the CyberRock cloud verification service. No device communicates with CyberRock directly — all authentication traffic flows through TrustBridge, which enforces tenant isolation, credential governance, retry policies, and immutable audit logging at every step.

**Three principal components cooperate to deliver this gateway:**

| Component | Role | Technology |
|---|---|---|
| **Backend (BE)** | Central orchestrator. Manages device registry, user identity, tenant isolation, and drives the authentication state machine. Communicates with the Cloud SDK and hardware gateways via MQTT. | NestJS 10, TypeScript, MySQL, TypeORM |
| **Frontend (FE)** | Governed user interface. Renders device status, authentication logs, and management workflows. Enforces permission-driven visibility. Consumes the BE REST API exclusively. | React 19, Vite, Chakra UI, React Query |
| **Cloud SDK (SDK-v3)** | CyberRock protocol bridge. Executes the cryptographic challenge-response exchange (CW/RW) against the CyberRock REST API on behalf of TrustBridge. Transport-agnostic; communicates via MQTT in production. | Python 3.10+, aiohttp, paho-mqtt |

A fourth, non-human component — the **Hardware Gateway** — is an embedded device running the SandGrain Device SDK (C firmware). It hosts the physical token IC and communicates with TrustBridge exclusively via MQTT.

---

## 2. Architecture & Data Flow

### 2.1 Multi-Tenant Isolation Strategy

TrustBridge enforces data isolation at the service layer using a scoping model derived from the authenticated user's organisation.

**Scoping hierarchy:**

```
OrganizationUnit (ou_id)
  └── Tenant (tenant_id)
       ├── Device       ← scoped by tenant_id
       ├── DeviceGroup  ← scoped by tenant_id
       └── Credentials  ← scoped by tenant_id
```

**Isolation mechanism — implemented in `JwtStrategy.validate()`:**

On every authenticated API request, the JWT validation step resolves the user's tenant scope:

```
tenant_ids = SELECT tenant_id FROM cr_tenant WHERE ou_id = user.ou_id
```

This array is attached to the request context and injected into every data query:

```sql
WHERE tenant_id IN (:...tenant_ids)
```

**[BR-032]** All tenant-scoped queries enforce this condition. There are no code paths that access tenant-scoped data without this filter.

**Super Administrator exception:** A user with `ou_id = null` (the `TRUST_ADMIN` role) bypasses tenant filtering entirely. The `tenant_ids` array is empty, and queries execute without the `WHERE tenant_id IN (...)` clause.

**Frontend enforcement:** The FE never receives cross-tenant data. The BE filters all responses before serialisation. The FE additionally suppresses UI elements based on the user's `permissions[]` array returned by `GET /api/auth/me`, ensuring that navigation links and action buttons for inaccessible resources are never rendered. **[BR-010, BR-011]**

---

### 2.2 Asynchronous Authentication Flow

The authentication of a hardware device involves four components communicating asynchronously across two protocols (REST and MQTT). The BE serves as the sole orchestrator.

```
User / Event                              
     │                                     
     ▼                                     
┌──────────────────────┐                   
│   TrustBridge BE     │                   
│   DeviceAuthService  │                   
│   (Orchestrator)     │                   
└────┬────────────┬────┘                   
     │            │                        
     │ MQTT       │ MQTT                   
     │ type:0-2   │ type:4                 
     ▼            ▼                        
┌──────────┐  ┌──────────────┐             
│Cloud SDK │  │  Hardware    │             
│(SDK-v3)  │  │  Gateway     │             
│ SDKPool  │  │  Token IC    │             
└────┬─────┘  └──────────────┘             
     │ HTTPS                               
     ▼                                     
┌──────────────┐                           
│  CyberRock   │                           
│  Tenant API  │                           
└──────────────┘                           
```

**Trigger events (any of):**

| Trigger | Source | Entry Point |
|---|---|---|
| Device comes online | MQTT `sandgrain/v1/{tid}/status` → `"online"` | `handleDeviceOnline(tid)` |
| Operator clicks "Authenticate" | FE → `POST /api/devices/:id/authenticate` | `reAuthenticate(id)` |
| Operator triggers bulk auth | FE → `POST /api/devices/lifecycle/bulk-auth` | `bulkLifecycleAuth(ids)` |
| Device created with offline CW/RW | `POST /api/devices` or bulk import | `processOfflineDeviceAuth(device)` |

**Online authentication sequence (step by step):**

| Step | Actor | Action | MQTT Type | Protocol |
|---|---|---|---|---|
| 1 | BE | Set device status → `inprogress`. Create `run_auth_init` log. | — | Internal |
| 2 | BE → SDK | Request Challenge Word from CyberRock. | type: 0 (`requestCW`) | MQTT → SDK → HTTPS |
| 3 | SDK → BE | Return `{ CW, transactionId }`. | rsp type: 0 | MQTT |
| 4 | BE → GW | Send CW to hardware gateway for IC computation. Pass `fault_mode` (0/1/2). | type: 4 (`computeRW`) | MQTT |
| 5 | GW → BE | IC computes RW from CW. Return `{ RW }`. | rsp type: 4 | MQTT |
| 6 | BE → SDK | Submit `{ TID, CW, RW, transactionId }` to CyberRock for verification. | type: 1 (`replyRW`) | MQTT → SDK → HTTPS |
| 7 | SDK → BE | Return `{ auth_status, claimTokenId? }`. | rsp type: 1 | MQTT |
| 8 | BE | Invoke Auth Result Handler. Update device status based on `auth_status`. | — | Internal |

**[BR-017]** Before Step 1, the BE validates that the device has: a `token_id`, an assigned `DeviceGroup` (with `group_id` and `password`), an assigned `DeviceProfile`, and valid tenant credentials (`email`, `password`, `cf_access_client_id`, `cf_access_client_secret`). Any missing field causes immediate rejection.

---

### 2.3 Credential Delivery — The Inline MQTT Payload

In the legacy SDK-Ikerlan architecture, credentials were loaded from a static JSON file on the gateway host. In the production architecture, TrustBridge resolves credentials from its relational database at call time and embeds them in every MQTT message.

**Credential composition (from `DeviceAuthService`):**

```
{
  device_username:         Device → DeviceGroup.group_id
  device_password:         Device → DeviceGroup.password
  tenant_email:            Device → Tenant → TenantUserCredential.email
  tenant_password:         Device → Tenant → TenantUserCredential.password
  cf_access_client_id:     Device → Tenant → TenantUserCredential.cf_access_client_id
  cf_access_client_secret: Device → Tenant → TenantUserCredential.cf_access_client_secret
}
```

This `credentials` object is included in every MQTT request envelope alongside `type`, `payload`, and `crc`. The Cloud SDK extracts it and uses it for CyberRock API authentication, bypassing any local file lookup.

**Three-tier resolution priority (if inline credentials are absent):**

| Priority | Source | Mechanism |
|---|---|---|
| 1 (highest) | Inline MQTT payload | BE embeds credentials in every message — the production path |
| 2 | TrustBridge API | `GET /api/devices/credentials-by-tid?tid={tid}` (public, no JWT) |
| 3 (lowest) | Local JSON file | `JsonFileCredentialsStore` reads `device_credentials.json` — fallback for standalone SDK |

**[BR-026, BR-027]** CyberRock access tokens obtained using these credentials are cached by both the TenantApiService (BE side) and the TokenCache (SDK side), each applying a 30-second safety buffer before expiry. The cache is invalidated when credentials are updated.

---

### 2.4 Component Responsibility Matrix

| Concern | Backend (BE) | Frontend (FE) | Cloud SDK | Gateway |
|---|---|---|---|---|
| Device registry | Owner | Read-only consumer | — | — |
| Status transitions | Owner (state machine) | Display only | — | Publishes `gw_log` and `auth_result` |
| Credential resolution | Owner (DB lookup) | Settings UI for tenant credentials | Consumer (inline or fallback) | — |
| CyberRock protocol | Orchestrator (triggers flows) | — | Executor (REST calls to CyberRock) | Computes RW on token IC |
| Audit logging | Owner (`DeviceLog`, `SystemActivity`) | Display only | — | Publishes `gw_log` messages |
| User authentication | Owner (JWT issuance, guards) | Token storage, interceptor retry | — | — |
| Tenant isolation | Enforcer (SQL WHERE clause) | Renders only scoped data | — | — |
| Permission enforcement | API-level guards | UI-level element suppression | — | — |

---

## 3. State Machine & Lifecycle

### 3.1 Device Status Transitions

The `status` field on the `tb_device` table is governed by a deterministic state machine. Every transition is triggered by a specific system event and guarded by pre-conditions.

**Status values and their meanings:**

| Status | Meaning | Terminal? |
|---|---|---|
| `idle` | Registered. No authentication in progress. Eligible for auth trigger. | No |
| `inprogress` | Authentication workflow initiated. Steps are actively executing. | No |
| `claimed` | CyberRock confirmed `AUTH_OK` or issued a `claim_token_id`. Awaiting operator approval. | No |
| `approved` | Operator has approved the claimed device. Awaiting promotion to `authenticated`. | No |
| `authenticated` | Fully enrolled and verified. Terminal success state. | **Yes** |
| `rejected` | Maximum authentication attempts exhausted. Terminal failure state. | **Yes** (re-auth resets to `idle`) |

**Transition table:**

| # | From | To | Trigger | Pre-condition | Business Rule |
|---|---|---|---|---|---|
| T1 | `idle` | `inprogress` | Auth workflow initiated | Device has TID, DeviceGroup, DeviceProfile, and tenant credentials | BR-017 |
| T2 | `inprogress` | `claimed` | CyberRock returns `AUTH_OK` or `claimTokenId` | Auth workflow completed successfully | BR-018 |
| T3 | `inprogress` | `idle` | CyberRock returns `NOT_READY` | Device not yet provisioned on CyberRock | BR-019 |
| T4 | `inprogress` | `idle` | Auth failed, retries remaining | `failed_auth_attempts < max_failed_auth_attempts` | BR-020 |
| T5 | `inprogress` | `rejected` | Auth failed, retries exhausted | `failed_auth_attempts >= max_failed_auth_attempts` | BR-020 |
| T6 | `claimed` | `approved` | Operator approves the claimed device | Device status is `claimed` | — |
| T7 | `approved` | `authenticated` | Operator triggers "Move to Authenticated" | Device status is `approved` and `is_approved = true` | — |
| T8 | `inprogress` | `authenticated` | Lifecycle bulk-auth: AUTH_OK for registered device | Device ID in `lifecycleDeviceIds` set | BR-022 |
| T9 | `rejected` | `idle` | Operator re-authenticates device | Manual trigger | — |
| T10 | `authenticated` | *(blocked)* | Any event | **Guard: no downgrade permitted** | **BR-021** |

**State diagram:**

```
                        NOT_READY (retry)
                     ┌────────────────────┐
                     │                    │
                     ▼                    │
   ┌──────┐    ┌───────────┐    ┌────────┘
   │ IDLE │───►│INPROGRESS │────┤
   └──┬───┘    └─────┬─────┘    │   AUTH_OK / claimTokenId
      │              │          │         │
      │              │          │         ▼
      │         max retries     │    ┌─────────┐   approve   ┌──────────┐   move   ┌───────────────┐
      │         exhausted       │    │ CLAIMED  │────────────►│ APPROVED │────────►│ AUTHENTICATED │
      │              │          │    └─────────┘              └──────────┘          │  (terminal)   │
      │              ▼          │                                                   └───────────────┘
      │         ┌──────────┐   │
      └────────►│ REJECTED │◄──┘     Lifecycle bulk-auth: INPROGRESS → AUTHENTICATED (bypass)
   (re-auth)    │(terminal)│   (failure)
                └──────────┘
```

### 3.2 Terminal State Guard

The `updateDeviceStatus()` method in `DeviceAuthService` contains an explicit guard that prevents any status downgrade once a device reaches `authenticated`:

```
IF new_status ≠ "authenticated":
    current = SELECT status FROM tb_device WHERE device_id = :id
    IF current.status = "authenticated":
        LOG "Device already authenticated — skipping downgrade to {new_status}"
        RETURN  ← status update is silently discarded
```

**Implementation detail:** The guard performs a fresh database read (`findOne` with `select: ["device_id", "status"]`) before every non-`authenticated` write. This protects against concurrent processes where one path completes authentication while another attempts to write a lower status.

**[BR-021]** This invariant is absolute: no system event, no API call, and no MQTT message can reduce a device from `authenticated` to any other status.

### 3.3 Lifecycle Bulk-Auth Bypass

When `POST /api/devices/lifecycle/bulk-auth` is called, each target device ID is registered in an in-memory `Set<number>` named `lifecycleDeviceIds`.

When the Auth Result Handler processes an `AUTH_OK` for a device, it checks:

```
isLifecycle = lifecycleDeviceIds.has(deviceId)
IF isLifecycle:
    lifecycleDeviceIds.delete(deviceId)
    finalStatus = "authenticated"    ← skips "claimed" entirely
ELSE:
    finalStatus = "claimed"
```

**[BR-022]** This bypass reflects the operational reality that lifecycle-auth devices have already been through a prior claim cycle and are being re-authenticated for lifecycle transfer purposes. The `claimed` intermediate is unnecessary.

### 3.4 Gateway Log Terminal Detection

The hardware gateway publishes step-by-step authentication progress on `sandgrain/v1/{tid}/gw_log`. TrustBridge's `handleGwLog()` method detects terminal conditions using two boolean expressions:

```
isTerminalOk   = (step = "6/6" AND status = "ok")
                  OR (step = "err_mgt" AND status = "ok")

isTerminalFail = (step = "failed" AND status = "fail")
```

| Condition | Terminal? | Action |
|---|---|---|
| `6/6` + `ok` | Yes — success | Close `run_auth_init` log. Invoke Auth Result Handler with success. |
| `err_mgt` + `ok` | Yes — recovered | Error management succeeded. Same as above. |
| `failed` + `fail` | Yes — failure | All gateway retries exhausted. Invoke Auth Result Handler with failure. |
| Any other combination | No | Create `DeviceLog` entry. Continue waiting. |

When a terminal event is detected, the `run_auth_init` log entry (opened at workflow start) is closed, and the gateway attempt tracking cache is cleared.

---

## 4. Security & Identity Management

### 4.1 User Authentication & Session Lifecycle

**Login validation chain (each step short-circuits on failure):**

| Step | Check | Failure Response | Rule |
|---|---|---|---|
| 1 | Username exists | "Invalid credentials" (generic) | — |
| 2 | `user_status = ACTIVE` | "Account is inactive" | — |
| 3 | `acc_locked_until` is null or past | "Account locked. Try again in N minutes." | BR-001 |
| 4 | bcrypt password match | "Invalid credentials. N attempts remaining." | — |
| 5 | *(success)* | Issue JWT, increment `token_version` | BR-002 |

**Session invalidation via `token_version`:**

The `token_version` integer on the `User` entity is incremented on specific events. Every authenticated API request validates that the JWT's `token_version` matches the database value. A mismatch causes immediate 401 rejection.

| Event | `token_version` incremented? | Effect | Rule |
|---|---|---|---|
| Successful login | Yes | All prior JWTs for this user become invalid | BR-002 |
| Admin resets another user's password | Yes | All sessions for the target user are revoked | BR-004 |
| User changes own password | **No** | Current session remains valid | BR-003 |

**[BR-002]** This design ensures single-session semantics: logging in from a new device immediately invalidates all prior sessions.

### 4.2 Account Lockout Mechanism

**Constants:**

| Parameter | Value |
|---|---|
| `MAX_FAILED_ATTEMPTS` | 5 |
| `LOCK_DURATION_MINUTES` | 30 |

**Logic:**

```
ON failed password:
    user.failed_logins += 1
    IF user.failed_logins >= 5:
        user.acc_locked_until = NOW + 30 minutes
        SAVE user
        REJECT "Account locked due to too many failed attempts"
    ELSE:
        SAVE user
        REJECT "Invalid credentials. {5 - failed_logins} attempts remaining"

ON successful password:
    user.failed_logins = 0
    user.acc_locked_until = NULL
    user.last_login_at = NOW
    user.token_version += 1
    SAVE user
```

**[BR-001]** The lockout is time-based (not permanent). After 30 minutes, the lock expires automatically. The remaining lock time is calculated as `ceil((acc_locked_until - now) / 60000)` minutes and returned to the client.

### 4.3 Credential Storage & Masking

TrustBridge manages two categories of credentials: **user credentials** (for platform login) and **tenant/device credentials** (for CyberRock API authentication).

**User credentials:**

| Field | Storage | Exposed in API? | Rule |
|---|---|---|---|
| `password_hash` | bcrypt hash in `tb_user` | Never — stripped from every response | BR-009 |
| `password_reset_token` | 64-hex random in `tb_user` | Never — stripped from every response | BR-009 |
| `invitation_token` | 64-hex random in `tb_user` | Never — stripped from every response | BR-009 |

**Tenant credentials (SandGrain CyberRock API):**

| Field | Storage | Exposed in API? |
|---|---|---|
| `email` | Plaintext in `cr_tenant_user_credential` | Masked in `GET /api/tenant-api/credentials` (first/last chars only) |
| `password` | Plaintext in `cr_tenant_user_credential` | Masked in responses; full value only in inline MQTT payload |
| `cf_access_client_id` | Plaintext in `cr_tenant_user_credential` | Masked in responses |
| `cf_access_client_secret` | Plaintext in `cr_tenant_user_credential` | Masked in responses |

**Device group credentials:**

| Field | Storage | Exposed in API? |
|---|---|---|
| `group_id` (username) | Plaintext in `tb_device_group` | Returned in device group responses |
| `password` | Plaintext in `tb_device_group` | Returned in device group responses (used as MQTT broker password) |

**[BR-009]** Sensitive user fields are stripped at the service layer before any API response is serialised. The stripping is applied universally — not per-endpoint — to prevent accidental exposure.

### 4.4 Credential Delivery to the SDK

When the BE initiates an authentication workflow, it constructs a credential composite from three database entities and embeds it in the MQTT message envelope:

```
┌─────────────────────────────────────────────────────────────┐
│  MQTT Message Envelope                                       │
│                                                              │
│  {                                                           │
│    "type": 0,                                                │
│    "payload": { "TID": "800000...4a" },                      │
│    "credentials": {                                          │
│      "device_username":         ← DeviceGroup.group_id       │
│      "device_password":         ← DeviceGroup.password       │
│      "tenant_email":            ← TenantUserCredential.email │
│      "tenant_password":         ← TenantUserCredential.password │
│      "cf_access_client_id":     ← TenantUserCredential.cf_access_client_id │
│      "cf_access_client_secret": ← TenantUserCredential.cf_accesBs_client_secret │
│    },                                                        │
│    "crc": { ... }                                            │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

The Cloud SDK uses these credentials to:
1. Call `POST /api/auth/deviceLogin` with `device_username` / `device_password` → obtain device access token.
2. Call `POST /api/auth/tenantUserLogin` with `tenant_email` / `tenant_password` → obtain tenant access token.
3. Inject `cf_access_client_id` / `cf_access_client_secret` as `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers on all CyberRock API calls.

**Security note:** Credentials travel over MQTT in plaintext within the envelope. In production deployments, the MQTT broker connection must be secured with TLS to protect credential confidentiality in transit.

### 4.5 Token Caching Architecture

Both the BE and the SDK cache CyberRock access tokens to avoid re-authenticating on every request.

**Backend (`TenantApiService.tokenCache`):**

```
Map<tenant_id, { token: string, expiresAt: number }>
```

Cache hit condition: `cached.expiresAt > (Date.now() / 1000) + 30`

The 30-second buffer ensures the token is refreshed before its actual expiry, preventing authentication failures from clock skew or network latency.

**Cloud SDK (`TokenCache`):**

```
_tenant:        TokenInfo | null                  (single cached tenant token)
_device_by_key: Dict[str, TokenInfo]             (per-device-key tokens)
```

Each `TokenInfo` holds `{ token, exp }` where `exp` is extracted from the JWT payload via unverified Base64 decode. The same 30-second safety window applies.

**[BR-026]** Both caches are invalidated when tenant credentials are updated via `PATCH /api/tenant-api/credentials`. **[BR-027]**

---

## 5. Observability & Logging

TrustBridge maintains two distinct, immutable logging systems that serve complementary purposes.

### 5.1 DeviceLog — Technical Step-Level Debugging

**Table:** `tb_device_log`
**Mutability:** Append-only. No update or delete paths exist. **[BR-028]**

Each record captures a single step in a device authentication or process workflow.

| Field | Purpose |
|---|---|
| `device_id` | Links to the device being processed |
| `process_type` | `authentication`, `fw_verification`, or `installation` |
| `step` | Step identifier: `init`, `run_auth_init`, `gw:1/6` … `gw:6/6`, `auth_result`, `claim_token` |
| `status` | `pending`, `in_progress`, `success`, `failed` |
| `message` | Human-readable description |
| `request_data` | Raw JSON payload sent at this step |
| `response_data` | Raw JSON payload received at this step |
| `duration_ms` | Step execution time |
| `attempt_number` | Which authentication attempt this step belongs to |
| `created_at` | Immutable timestamp |

**Use case:** An engineer debugging a failed authentication for TID `800000...4a` can query all `DeviceLog` entries ordered by `created_at` to replay the exact sequence of MQTT messages, CyberRock responses, and timing that occurred during the attempt.

### 5.2 SystemActivity — Business Audit Trail

**Table:** `tb_system_activity`
**Mutability:** Append-only. No update or delete paths exist. **[BR-028]**

Each record captures a significant business event.

| Field | Purpose |
|---|---|
| `activity_type` | Event classification: `device_created`, `device_authenticated`, `device_failed`, `device_group_password_changed`, etc. |
| `entity_type` | Affected entity class: `device`, `device_group`, `user`, `category` |
| `entity_id` | The ID of the affected entity |
| `title` | Short event summary (e.g., "Device 'Temp Sensor A1' authenticated") |
| `description` | Extended description |
| `severity` | `info`, `success`, `warning`, `error` |
| `icon` | UI icon identifier for rendering |
| `metadata` | Structured JSON for event-specific data |
| `created_at` | Immutable timestamp |

**Use case:** An organisation administrator reviewing the audit log for the past week can filter by `severity = error` to identify all failed device authentications and credential changes that occurred during that period.

### 5.3 Comparison Matrix

| Dimension | DeviceLog | SystemActivity |
|---|---|---|
| **Scope** | One record per authentication step | One record per business event |
| **Granularity** | Step-level (`gw:2/6`, `auth_result`) | Event-level (`device_authenticated`) |
| **Contains** | Request/response payloads, duration, attempt | Title, description, severity, metadata |
| **Primary consumer** | Engineering / debugging | Operations / compliance |
| **Tied to** | A single device (`device_id` FK) | Any entity type (polymorphic) |
| **Write trigger** | MQTT message processing, auth orchestration | Service-layer CRUD operations |
| **Tenant filtering** | Via `device.tenant_id` | Via `device.tenant_id` or `deviceGroup.tenant_id` |

---

## 6. Error Handling & Resilience

### 6.1 NOT_READY vs AUTH_FAIL — Distinguishing Transient from Terminal

The CyberRock API returns an `auth_status` string that determines the next action. The distinction between transient and terminal failure is a critical design decision:

| `auth_status` | Classification | System Response | Device Status | Rule |
|---|---|---|---|---|
| `AUTH_OK` | **Success** | Set `is_approved = true`, `failed_auth_attempts = 0`. Transition to `claimed`. Record `claim_token_id`. | → `claimed` | BR-018 |
| `claimTokenId` present (status ≠ AUTH_OK) | **Success (variant)** | Store `claim_token_id`, set `is_approved = true`. Transition to `claimed`. Async call `stepClaimToken()`. | → `claimed` | BR-018 |
| `NOT_READY` | **Transient** | Log as `info`. Device not yet provisioned on CyberRock. Transition to `idle`. Schedule retry after `auth_frequency` seconds. | → `idle` | **BR-019** |
| `AUTH_NOT_OK` / other | **Terminal failure** | Increment `failed_auth_attempts`. If below threshold → retry after delay. If at threshold → transition to `rejected`. | → `idle` or `rejected` | **BR-020** |

**[BR-019]** `NOT_READY` does **not** increment `failed_auth_attempts`. It is treated as "the device is not ready yet" — a condition external to TrustBridge — and the retry is unconditional. This prevents factory-provisioned devices from being rejected before CyberRock has ingested their credentials.

**[BR-020]** `AUTH_NOT_OK` and all other failure statuses **do** increment `failed_auth_attempts`. The threshold is defined by `DeviceProfile.max_failed_auth_attempts` (default: 5). When the threshold is reached, the device is permanently marked `rejected` with `severity: error` in the `SystemActivity` log.

### 6.2 MQTT Timeout & Retry Policy

**Constants:**

| Constant | Value | Source |
|---|---|---|
| `MQTT_RETRY_ATTEMPTS` | 2 | `device-auth.service.ts:15` |
| `MQTT_RETRY_DELAY_MS` | 3000 (3 seconds) | `device-auth.service.ts:16` |

**Retry loop:**

```
FOR attempt = 1 TO MQTT_RETRY_ATTEMPTS:
    TRY:
        response = await mqttService.request(tid, action, type, payload, credentials)
        RETURN response   ← success, exit loop
    CATCH error:
        lastError = error
        IF attempt < MQTT_RETRY_ATTEMPTS:
            LOG "MQTT {action} attempt {attempt} failed, retrying in 3000ms..."
            SLEEP 3000ms
THROW lastError   ← all attempts exhausted
```

**[BR-024]** The MQTT request timeout is 60 seconds per request. The retry wraps the entire request (subscribe + publish + wait), not individual sub-steps.

**run_auth_init auto-close safety net:** If no terminal result (from `gw_log` or `auth_result`) is received within **90 seconds** of opening a `run_auth_init` log entry, a background timer automatically closes the entry with status `failed` and message "Authentication timed out — no result received from device". This protects against the v3 Device SDK not publishing a terminal event back via MQTT.

**Timeout mechanism (`_waitForResponse`):**

The MQTT response wait is implemented as a `Promise` with a `setTimeout` rejection:

```
Promise((resolve, reject) => {
    timer = setTimeout(() => {
        listeners.delete(topic)
        client.unsubscribe(topic)
        reject(Error("MQTT timeout waiting for response on {topic}"))
    }, timeoutMs)

    listeners.set(topic, (payload) => {
        clearTimeout(timer)
        resolve(payload)
    })
})
```

The subscribe-first pattern (subscribe to `rsp` before publishing to `req`) prevents race conditions where the response arrives before the listener is registered.

### 6.3 Timeout Cascade Model

The system enforces timeouts at four nested levels, each shorter than its parent, ensuring that inner failures propagate cleanly:

```
Level 1 (Outermost): TrustBridge MQTT request timeout ─── 60 seconds
  │
  └── Level 2: Cloud App handler timeout ─────────────── 25 seconds
        │
        └── Level 3: CyberRock polling timeout ───────── 20 seconds
              │
              └── Level 4: Single CyberRock HTTP call ── 15 seconds
```

| Level | Component | Default | On Expiry |
|---|---|---|---|
| 1 | `MqttService._waitForResponse()` | 60 s | MQTT promise rejects → retry or propagate |
| 2 | Cloud App `asyncio.wait_for()` | 25 s | Handler returns `TIMEOUT_ERROR` (code 18) |
| 3 | Cloud App `_poll_until()` | 20 s | Raises `asyncio.TimeoutError` → caught at Level 2 |
| 4 | `CyberRockClient.timeout` | 15 s | `aiohttp.ClientTimeout` → raises at Level 3 |

### 6.4 Debouncing & Race Condition Guards

| Guard | Mechanism | Purpose |
|---|---|---|
| **Duplicate auth prevention** | `pendingRetries: Set<number>` tracks device IDs with scheduled retries. `handleDeviceOnline()` checks this set and silently ignores the event if a retry is pending. | Prevents duplicate auth triggers when a device reconnects during a retry window. |
| **Race condition recheck** | After creating a device or triggering re-auth, TrustBridge waits 3 seconds and re-checks the device's MQTT online status from the `onlineTids` set. | Catches devices that came online during the creation/trigger window. |
| **Lifecycle registration guard** | `lifecycleDeviceIds: Set<number>` is checked atomically at terminal event time. If present, the device bypasses `claimed` and goes directly to `authenticated`. | Prevents lifecycle devices from being stuck in `claimed`. **[BR-022]** |
| **No-downgrade invariant** | `updateDeviceStatus()` performs a fresh DB read before every non-`authenticated` write. If the current status is `authenticated`, the write is silently discarded. | Prevents concurrent processes from downgrading a device that was authenticated by a parallel path. **[BR-021]** |

### 6.5 Email & Async Operation Resilience

**[BR-030]** All email operations (invitation, password reset, credential notification) are dispatched asynchronously with a fire-and-forget pattern:

```
emailService.sendInvitationEmail(email, username, token).catch(() => {})
```

A failure to send an email:
- Is logged to the server console.
- Returns `false` (not thrown).
- Does **not** roll back or fail the primary operation (user creation, password reset).

The same pattern applies to `SystemActivity` logging — failures are caught and discarded to ensure that audit logging never blocks business operations.

---

## 7. Database Schema — Core Entities

### 7.1 Device (`tb_device`)

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `device_id` | INT | No | auto | Primary key |
| `device_name` | VARCHAR | No | — | Human-readable label |
| `device_serial` | VARCHAR | Yes | — | Physical serial number |
| `token_id` | VARCHAR | No | — | SandGrain TID (64 hex chars, stored lowercase) **[BR-013]** |
| `device_type` | VARCHAR | No | `"device"` | Category type |
| `batch_no` | VARCHAR | Yes | — | Manufacturing batch |
| `device_group_id` | INT | Yes | — | FK → `tb_device_group` |
| `tenant_id` | VARCHAR | Yes | — | FK → `cr_tenant` (ON DELETE SET NULL) |
| `profile_id` | INT | Yes | — | FK → `tb_device_profile` (ON DELETE SET NULL) |
| `claim_token_id` | VARCHAR | Yes | — | CyberRock claim token (set on AUTH_OK) |
| `offline_cw` | TEXT | Yes | — | Factory pre-computed Challenge Word **[BR-016]** |
| `offline_rw` | TEXT | Yes | — | Factory pre-computed Response Word **[BR-016]** |
| `status` | VARCHAR | No | `"idle"` | State machine status (Section 3.1) |
| `is_approved` | BOOLEAN | No | `false` | Set `true` on AUTH_OK **[BR-018]** |
| `is_active` | BOOLEAN | No | `true` | Mirrors SandGrain lifecycle state |
| `status_message` | TEXT | Yes | — | Human-readable current state description |
| `is_online` | BOOLEAN | No | `false` | MQTT presence status |
| `failed_auth_attempts` | INT | No | `0` | Consecutive failures (reset on success) **[BR-020]** |
| `last_seen_at` | DATETIME | Yes | — | Last MQTT presence event |
| `created_at` | DATETIME | No | now | — |
| `updated_at` | DATETIME | No | now | — |
| `deleted_at` | DATETIME | Yes | — | Soft delete **[BR-029]** |

### 7.2 DeviceGroup (`tb_device_group`)

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `device_group_id` | INT | No | auto | Primary key |
| `group_id` | VARCHAR | No | — | External identifier (MQTT username) |
| `group_name` | VARCHAR | No | — | Display name |
| `password` | VARCHAR | No | — | Shared MQTT broker password for all devices in this group |
| `status` | VARCHAR | No | `"ACTIVE"` | `ACTIVE` or `INACTIVE` |
| `tenant_id` | VARCHAR | Yes | — | FK → `cr_tenant` |
| `created_at` | DATETIME | No | now | — |
| `updated_at` | DATETIME | No | now | — |
| `deleted_at` | DATETIME | Yes | — | Soft delete **[BR-029]** |

### 7.3 DeviceLog (`tb_device_log`)

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `log_id` | INT | No | auto | Primary key |
| `device_id` | INT | No | — | FK → `tb_device` |
| `process_type` | VARCHAR | No | `"authentication"` | `authentication`, `fw_verification`, `installation` |
| `step` | VARCHAR | No | — | Step identifier |
| `status` | VARCHAR | No | `"pending"` | `pending`, `in_progress`, `success`, `failed` |
| `message` | TEXT | Yes | — | Human-readable step description |
| `request_data` | TEXT | Yes | — | Raw request JSON |
| `response_data` | TEXT | Yes | — | Raw response JSON |
| `duration_ms` | INT | Yes | — | Step execution time |
| `attempt_number` | INT | No | `1` | Authentication attempt counter |
| `created_at` | DATETIME | No | now | Immutable **[BR-028]** |

### 7.4 User (`tb_user`)

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `user_id` | INT | No | auto | Primary key |
| `ou_id` | INT | Yes | — | FK → `tb_organization_unit` (null for TRUST_ADMIN) |
| `name` | VARCHAR | Yes | — | Full name |
| `company_title` | VARCHAR | Yes | — | Job title |
| `username` | VARCHAR | No | — | Unique login identifier |
| `email` | VARCHAR | No | — | Unique email address |
| `password_hash` | VARCHAR | No | — | bcrypt hash **[BR-009]** |
| `user_status` | VARCHAR | No | `"ACTIVE"` | `ACTIVE` or `INACTIVE` |
| `failed_logins` | INT | No | `0` | Failed attempt counter **[BR-001]** |
| `acc_locked_until` | DATETIME | Yes | — | Lock expiry timestamp **[BR-001]** |
| `last_login_at` | DATETIME | Yes | — | Most recent login |
| `token_version` | INT | No | `1` | Session invalidation counter **[BR-002]** |
| `must_change_password` | BOOLEAN | No | `false` | Forces password change on next login |
| `password_reset_token` | VARCHAR | Yes | — | Random 64-hex token, expires in 1h **[BR-005]** |
| `password_reset_expires` | DATETIME | Yes | — | Token expiry |
| `invitation_token` | VARCHAR | Yes | — | Random 64-hex token, expires in 7d **[BR-006]** |
| `invitation_expires` | DATETIME | Yes | — | Token expiry |
| `created_at` | DATETIME | No | now | — |
| `updated_at` | DATETIME | No | now | — |
| `deleted_at` | DATETIME | Yes | — | Soft delete **[BR-029]** |

### 7.5 TenantUserCredential (`cr_tenant_user_credential`)

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INT | No | auto | Primary key |
| `tenant_id` | VARCHAR | No | — | FK → `cr_tenant` (1:1) |
| `tenant_user_id` | VARCHAR | No | — | External user ID in SandGrain tenant system |
| `email` | VARCHAR | No | — | CyberRock API login email |
| `password` | VARCHAR | No | — | CyberRock API login password |
| `cf_access_client_id` | VARCHAR | No | — | Cloudflare Access Client ID |
| `cf_access_client_secret` | VARCHAR | No | — | Cloudflare Access Client Secret |
| `created_at` | DATETIME | No | now | — |
| `updated_at` | DATETIME | No | now | — |

**Note:** This entity does not use soft delete. When a tenant is removed from an organisation, the credential record is hard-deleted as part of the explicit decommissioning action. **[BR-029]**

---

## 8. Business Rule Traceability Index

The following index maps every business rule defined in TB-FDD-001 to the section(s) of this document where its implementation is described.

| Rule | Summary | TDD Section |
|---|---|---|
| BR-001 | Account locks for 30 min after 5 failed login attempts | 4.2 |
| BR-002 | Login increments `token_version`, invalidating all prior JWTs | 4.1 |
| BR-003 | Changing own password does NOT increment `token_version` | 4.1 |
| BR-004 | Admin resetting another user's password DOES increment `token_version` | 4.1 |
| BR-005 | Password reset tokens expire in 1 hour | 7.4 |
| BR-006 | Invitation tokens expire in 7 days | 7.4 |
| BR-007 | Invitation resend blocked if user has already set a password | *(FDD 4.3.2)* |
| BR-008 | A user holds exactly one role; new assignment replaces the old | *(FDD 4.4.2)* |
| BR-009 | Sensitive user fields stripped from every API response | 4.3 |
| BR-010 | Role guard uses OR logic; Permission guard uses AND logic | 2.1 |
| BR-011 | Only ACTIVE roles and permissions participate in access checks | 2.1 |
| BR-012 | System initialisation is one-time and transactional | *(FDD 4.1)* |
| BR-013 | TIDs normalised to lowercase; comparisons case-insensitive | 7.1 |
| BR-014 | `cr_already_used = true` in bulk import suppresses post-import auth | *(FDD 4.7.2)* |
| BR-015 | Whitelist includes only TIDs that are exactly 64 hex characters | *(FDD 4.7.3)* |
| BR-016 | Offline auth selected when both `offline_cw` and `offline_rw` are present | 7.1 |
| BR-017 | Credentials validated before any auth step; missing fields → immediate failure | 2.2 |
| BR-018 | `AUTH_OK` sets `is_approved = true`, transitions to `claimed` | 3.1, 6.1 |
| BR-019 | `NOT_READY` resets to `idle`, schedules retry (not a permanent failure) | 6.1 |
| BR-020 | Failures increment `failed_auth_attempts`; threshold → `rejected` | 3.1, 6.1 |
| BR-021 | `authenticated` is terminal; no downgrade permitted | 3.2 |
| BR-022 | Lifecycle bulk-auth devices skip `claimed` → go directly to `authenticated` | 3.3 |
| BR-023 | FW Installation requires `verification_rw` from a prior FW Verification | *(FDD 4.9.5)* |
| BR-024 | MQTT request timeout is 60s; 2 retries with 3s delay | 6.2 |
| BR-025 | CRC-16/CCITT-FALSE validated on all inbound gateway message fields | *(SDK protocol)* |
| BR-026 | CyberRock tokens cached until 30s before expiry | 4.5 |
| BR-027 | Credential cache invalidated on credential update | 4.5 |
| BR-028 | DeviceLog and SystemActivity are immutable once written | 5.1, 5.2 |
| BR-029 | Soft delete for primary entities; hard delete for tenant decommission | 7.1–7.5 |
| BR-030 | Email failures do not roll back the primary operation | 6.5 |
| BR-031 | Credential prompt shown every session where `credentials_configured = false` | *(FDD 4.11.1)* |
| BR-032 | Tenant-scoped queries always include `WHERE tenant_id IN (...)` | 2.1 |

Rules marked *(FDD x.x)* or *(SDK protocol)* are implemented at layers documented in their respective documents (TB-FDD-001, TB-TDD-002) and are referenced here for traceability.

---

*End of Document — TB-TDD-001 Rev 2.0*
