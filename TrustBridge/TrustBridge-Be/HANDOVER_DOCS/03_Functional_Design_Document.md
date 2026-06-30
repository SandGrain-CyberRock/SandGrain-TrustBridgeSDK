# Functional Design Document

**Project:** TrustBridge
**Document Reference:** TB-FDD-001
**Revision:** 1.0
**Status:** Approved
**Prepared for:** SandGrain BV
**Classification:** Confidential

---

## Document Control

| Field | Value |
|---|---|
| Project Name | TrustBridge |
| Document Type | Functional Design Document (FDD) |
| Intended Audience | SandGrain BV — Engineering, Product, and Quality Assurance |
| Related Documents | TB-REQ-001 Rev 1.1 — Requirements Specification |
| Scope | Business Logic, Data Rules, State Machines, Workflows |
| Out of Scope | Server infrastructure, deployment topology, code implementation detail |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Data Entities & Relationships](#2-data-entities--relationships)
   - 2.1 Entity Overview & Hierarchy
   - 2.2 Entity Definitions
3. [State Machine Definitions](#3-state-machine-definitions)
   - 3.1 Device Status Lifecycle
   - 3.2 Device Process Log Status Lifecycle
   - 3.3 User Account Status Lifecycle
4. [Module Business Logic](#4-module-business-logic)
   - 4.1 System Initialisation
   - 4.2 Authentication & Session Management
   - 4.3 Password & Credential Lifecycle
   - 4.4 User Management
   - 4.5 Role & Permission (RBAC/PBAC)
   - 4.6 Organisation & Tenant Management
   - 4.7 Device Registry
   - 4.8 Device Authentication Orchestration
   - 4.9 Hardware Gateway — Challenge-Response Workflow
   - 4.10 Device Lifecycle Transfer (SandGrain Integration)
   - 4.11 Tenant API Credential Management
   - 4.12 Audit & System Activity Logging
   - 4.13 Dashboard & Analytics
5. [Cross-Cutting Business Rules](#5-cross-cutting-business-rules)
   - 5.1 Multi-Tenant Data Isolation
   - 5.2 Access Control Evaluation
   - 5.3 Soft Deletion
   - 5.4 Audit Immutability
6. [Error Handling Logic](#6-error-handling-logic)
   - 6.1 Authentication Errors
   - 6.2 Device Authentication Errors
   - 6.3 MQTT Communication Errors
   - 6.4 External API Errors
7. [Business Rule Index](#7-business-rule-index)

---

## 1. Introduction

### 1.1 Purpose of this Document

This Functional Design Document (FDD) defines the business logic, data rules, state machines, and module workflows that govern the behaviour of the TrustBridge platform. It is written for SandGrain BV engineering and product teams and serves as the authoritative reference for what the system does, what rules it enforces, and how its entities relate to one another.

This document does not describe server infrastructure, deployment configuration, or code structure. Those concerns are addressed in the Technical Design Document (TDD).

### 1.2 System Summary

TrustBridge is the management and authentication plane for SandGrain hardware security tokens. Its primary function is to accept hardware token devices into a customer organisation, orchestrate a cryptographic mutual authentication handshake between each token's embedded IC and the SandGrain CyberRock cloud verification service, and then govern the ongoing lifecycle of each authenticated device under a strict multi-tenant access control model.

### 1.3 Key Concepts

| Concept | Definition |
|---|---|
| **Token / Device** | A physical hardware security IC produced by SandGrain, uniquely identified by a 256-bit Token ID (TID). |
| **Gateway** | An edge device running the SandGrain Device SDK that hosts a token IC and communicates with TrustBridge via MQTT. |
| **CyberRock API** | The SandGrain cloud service that issues cryptographic challenges (CW) and verifies responses (RW). |
| **Challenge Word (CW)** | A 256-bit cryptographic challenge issued by CyberRock. |
| **Response Word (RW)** | A 128-bit value computed either by the token IC (Token-Computes-RW) or by CyberRock (Cloud-Computes-RW). |
| **Organisation Unit (OU)** | The top-level customer container. All users, tenants, and device profiles belong to an OU. |
| **Tenant** | A scoped operational division within an OU. Devices and device groups belong to a tenant. |

---

## 2. Data Entities & Relationships

### 2.1 Entity Overview & Hierarchy

The TrustBridge data model follows a strict hierarchical scoping structure. All data access is bounded by this hierarchy.

```
OrganizationUnit (ou_id)
├── User                   [scoped by ou_id]
├── DeviceProfile          [scoped by ou_id]
└── Tenant (tenant_id)
    ├── Device             [scoped by tenant_id]
    ├── DeviceGroup        [scoped by tenant_id]
    └── TenantUserCredential [linked via tenant_id]

Role  ──(many-to-many)──  Permission
  ↑
UserRole  (User ↔ Role junction)
```

**Access scoping rules:**
- A user authenticated with an `ou_id` sees only data belonging to their own OU's tenants.
- A Super Administrator (no `ou_id`) sees data across all organisations.
- Cross-tenant data access is never permitted, even within the same OU, unless the OU's tenant set is loaded together.

---

### 2.2 Entity Definitions

#### 2.2.1 OrganizationUnit

The top-level container representing a customer organisation.

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `ou_id` | integer | No | auto | Primary key |
| `ou_name` | string | No | — | Organisation display name |
| `ou_description` | string | Yes | — | Free-text description |
| `ou_email` | string | Yes | — | Primary contact email |
| `ou_status` | string | No | `ACTIVE` | Lifecycle status: `ACTIVE`, `INACTIVE` |
| `created_at` | datetime | No | now | Creation timestamp |
| `updated_at` | datetime | No | now | Last modification timestamp |
| `deleted_at` | datetime | Yes | null | Soft-delete timestamp |

**Relationships:** Has many `User`, many `Tenant`, many `DeviceProfile`.

---

#### 2.2.2 User

A human actor who interacts with TrustBridge. Every user belongs to one OU.

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `user_id` | integer | No | auto | Primary key |
| `ou_id` | integer | Yes | null | Foreign key → OrganizationUnit. Null for system-level Super Admins. |
| `name` | string | Yes | — | Full name |
| `company_title` | string | Yes | — | Job title |
| `username` | string | No | — | Unique login identifier |
| `email` | string | No | — | Unique email address |
| `password_hash` | string | No | — | bcrypt hash of the user's password |
| `user_status` | string | No | `ACTIVE` | `ACTIVE` or `INACTIVE` |
| `failed_logins` | integer | No | `0` | Counter of consecutive failed login attempts |
| `acc_locked_until` | datetime | Yes | null | Account unlocks at this timestamp; null if not locked |
| `last_login_at` | datetime | Yes | null | Timestamp of most recent successful login |
| `token_version` | integer | No | `1` | Monotonically increasing counter; invalidates all prior JWTs on increment |
| `must_change_password` | boolean | No | `false` | Forces password change before access is granted |
| `password_reset_token` | string | Yes | null | Random hex token for password reset flow |
| `password_reset_expires` | datetime | Yes | null | Expiry of password reset token |
| `invitation_token` | string | Yes | null | Random hex token for first-time password set |
| `invitation_expires` | datetime | Yes | null | Expiry of invitation token |
| `created_at` | datetime | No | now | — |
| `updated_at` | datetime | No | now | — |
| `deleted_at` | datetime | Yes | null | Soft-delete timestamp |

**Unique constraints:** `username`, `email`.
**Relationships:** Belongs to one `OrganizationUnit`. Has many `UserRole`.

---

#### 2.2.3 Role

A named collection of permissions that can be assigned to users.

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | integer | No | auto | Primary key |
| `name` | string | No | — | Unique machine-readable name |
| `label` | string | No | — | Human-readable label |
| `icon` | string | Yes | — | UI icon identifier |
| `icon_color` | string | Yes | — | Icon display colour |
| `description` | string | Yes | — | Purpose description |
| `status` | string | No | `ACTIVE` | `ACTIVE` or `INACTIVE`. Only ACTIVE roles participate in access checks. |
| `created_at` | datetime | No | now | — |
| `deleted_at` | datetime | Yes | null | Soft-delete timestamp |

**Unique constraint:** `name`.
**Relationships:** Has many `RolePermission`, many `UserRole`.

---

#### 2.2.4 Permission

A single, granular access entitlement expressed as a `module:action` key.

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | integer | No | auto | Primary key |
| `key` | string | No | — | Unique permission key, format: `{module}:{action}` (e.g., `device:create`) |
| `module` | string | No | — | Feature domain (e.g., `device`, `user`, `role`) |
| `action` | string | No | — | Operation type (e.g., `create`, `retrieve`, `update`, `delete`) |
| `description` | string | Yes | — | Human-readable description of what this permission grants |
| `created_at` | datetime | No | now | — |
| `deleted_at` | datetime | Yes | null | Soft-delete timestamp |

**Unique constraint:** `key`.

---

#### 2.2.5 Tenant

An operational division within an OU. The primary data isolation boundary for devices.

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `tenant_id` | string | No | — | Primary key (externally provisioned UUID, not auto-generated) |
| `ou_id` | integer | No | — | Foreign key → OrganizationUnit |
| `tenant_status` | string | No | `ACTIVE` | `ACTIVE`, `SUSPENDED`, or `ARCHIVED` |
| `credentials_configured` | boolean | No | `false` | True once SandGrain Tenant API credentials have been configured for this tenant |
| `created_at` | datetime | No | now | — |
| `updated_at` | datetime | No | now | — |
| `deleted_at` | datetime | Yes | null | Soft-delete timestamp |

**Relationships:** Belongs to one `OrganizationUnit`. Has many `Device`, `DeviceGroup`, one `TenantUserCredential`.

---

#### 2.2.6 Device

A registered hardware security token. This is the central entity of the TrustBridge platform.

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `device_id` | integer | No | auto | Primary key |
| `device_name` | string | No | — | Human-readable device label |
| `device_serial` | string | Yes | — | Physical serial number |
| `token_id` | string | No | — | SandGrain hardware Token ID (TID), 64 hex characters. Stored in lowercase. |
| `device_type` | string | No | `device` | Device category type |
| `batch_no` | string | Yes | — | Manufacturing batch identifier |
| `device_group_id` | integer | Yes | — | Foreign key → DeviceGroup |
| `tenant_id` | string | Yes | — | Foreign key → Tenant |
| `profile_id` | integer | Yes | — | Foreign key → DeviceProfile |
| `status` | string | No | `idle` | State machine status. See Section 3.1. |
| `is_approved` | boolean | No | `false` | Set to true when CyberRock returns `AUTH_OK` |
| `is_active` | boolean | No | `true` | Mirrors SandGrain lifecycle activity status |
| `status_message` | string | Yes | — | Human-readable description of current state |
| `is_online` | boolean | No | `false` | Reflects current MQTT presence status |
| `failed_auth_attempts` | integer | No | `0` | Counts consecutive failed authentication attempts |
| `last_seen_at` | datetime | Yes | null | Timestamp of most recent MQTT presence event |
| `claim_token_id` | string | Yes | null | Claim token returned by CyberRock upon successful authentication |
| `offline_cw` | string | Yes | null | Factory pre-computed Challenge Word (for offline auth flow) |
| `offline_rw` | string | Yes | null | Factory pre-computed Response Word (for offline auth flow) |
| `created_at` | datetime | No | now | — |
| `updated_at` | datetime | No | now | — |
| `deleted_at` | datetime | Yes | null | Soft-delete timestamp |

**Unique constraint:** `token_id` (one device record per physical token).
**TID rule:** All TIDs are normalised to lowercase on ingestion. Comparisons are case-insensitive.
**Relationships:** Belongs to `DeviceGroup`, `Tenant`, `DeviceProfile`. Has many `DeviceLog`.

---

#### 2.2.7 DeviceGroup

A logical grouping of devices that share a common set of MQTT broker credentials.

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `device_group_id` | integer | No | auto | Primary key |
| `group_id` | string | No | — | External group identifier (used as MQTT username) |
| `group_name` | string | No | — | Display name |
| `password` | string | No | — | Shared MQTT authentication password for all devices in this group |
| `tenant_id` | string | Yes | — | Foreign key → Tenant |
| `status` | string | No | `ACTIVE` | `ACTIVE` or `INACTIVE` |
| `created_at` | datetime | No | now | — |
| `updated_at` | datetime | No | now | — |
| `deleted_at` | datetime | Yes | null | Soft-delete timestamp |

**Relationships:** Belongs to `Tenant`. Has many `Device`.

---

#### 2.2.8 DeviceProfile

A reusable configuration template applied to devices. Defines MQTT connection parameters and authentication policy.

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `profile_id` | integer | No | auto | Primary key |
| `ou_id` | integer | No | — | Foreign key → OrganizationUnit (profiles are org-scoped) |
| `profile_name` | string | No | — | Display name |
| `status` | string | No | `ACTIVE` | `ACTIVE` or `INACTIVE` |
| `is_default` | boolean | No | `false` | If true, this profile is the OU default |
| `category_id` | integer | Yes | — | Classification category |
| `sub_category_id` | integer | Yes | — | Classification sub-category |
| `mqtt_server` | string | Yes | — | MQTT broker hostname or IP |
| `mqtt_username` | string | Yes | — | MQTT broker authentication username |
| `mqtt_password` | string | Yes | — | MQTT broker authentication password |
| `qos_level` | string | No | `"1"` | MQTT Quality of Service level: `"0"`, `"1"`, or `"2"` |
| `tls_type` | string | No | `"TLS 1.2"` | TLS version for MQTT connection |
| `claim_type` | string | No | `"auto"` | Device claim strategy: `"auto"` or `"manual"` |
| `auth_frequency` | integer | No | `60` | Seconds between authentication cycles |
| `max_failed_auth_attempts` | integer | No | `5` | Maximum consecutive failures before device is marked rejected |
| `profile_param_id` | integer | Yes | — | Legacy reference to ProfileDefaultParam |
| `created_at` | datetime | No | now | — |
| `updated_at` | datetime | No | now | — |
| `deleted_at` | datetime | Yes | null | Soft-delete timestamp |

**Relationships:** Belongs to `OrganizationUnit`. Has many-to-many with `Tag`. Has many `Device`.

---

#### 2.2.9 DeviceLog

An immutable, append-only record of a single step in a device authentication or process workflow.

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `log_id` | integer | No | auto | Primary key |
| `device_id` | integer | No | — | Foreign key → Device |
| `process_type` | string | No | `authentication` | Process type: `authentication`, `fw_verification`, `installation` |
| `step` | string | No | — | Step identifier (e.g., `init`, `gw:1/6`, `gw:6/6`, `auth_result`) |
| `status` | string | No | `pending` | Step outcome: `pending`, `in_progress`, `success`, `failed` |
| `message` | string | Yes | — | Human-readable step description |
| `request_data` | string | Yes | — | Raw request payload (JSON) sent at this step |
| `response_data` | string | Yes | — | Raw response payload (JSON) received at this step |
| `duration_ms` | integer | Yes | — | Time taken to complete this step in milliseconds |
| `attempt_number` | integer | No | `1` | Which authentication attempt this step belongs to |
| `created_at` | datetime | No | now | Creation timestamp (immutable) |

**Immutability rule:** DeviceLog records are never modified or deleted after creation.
**Relationships:** Belongs to `Device`.

---

#### 2.2.10 SystemActivity

An immutable, append-only audit record of any significant business event in the platform.

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `activity_id` | integer | No | auto | Primary key |
| `activity_type` | string | No | — | Event classification (e.g., `device_created`, `device_authenticated`, `device_failed`) |
| `entity_type` | string | No | — | The class of entity affected: `device`, `device_group`, `user` |
| `entity_id` | integer | Yes | — | The ID of the affected entity |
| `device_id` | integer | Yes | — | Optional direct link to Device |
| `device_group_id` | integer | Yes | — | Optional direct link to DeviceGroup |
| `title` | string | No | — | Short human-readable event summary |
| `description` | string | Yes | — | Extended explanation of the event |
| `severity` | string | No | `info` | Impact level: `info`, `success`, `warning`, `error` |
| `icon` | string | Yes | — | UI icon identifier |
| `metadata` | JSON | Yes | — | Structured event-specific data (e.g., TID hash, previous status) |
| `created_at` | datetime | No | now | Creation timestamp (immutable) |

**Immutability rule:** SystemActivity records are never modified or deleted.

---

#### 2.2.11 TenantUserCredential

Stores the external SandGrain CyberRock API credentials for a tenant, used by TrustBridge to authenticate outbound API calls on the tenant's behalf.

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | integer | No | auto | Primary key |
| `tenant_id` | string | No | — | Foreign key → Tenant (one-to-one) |
| `tenant_user_id` | string | No | — | External user ID in the SandGrain tenant system |
| `email` | string | No | — | Login email for CyberRock Tenant API |
| `password` | string | No | — | Login password for CyberRock Tenant API |
| `cf_access_client_id` | string | No | — | Cloudflare Access Client ID |
| `cf_access_client_secret` | string | No | — | Cloudflare Access Client Secret |
| `created_at` | datetime | No | now | — |
| `updated_at` | datetime | No | now | — |

**Cardinality:** One TenantUserCredential record per Tenant (1:1).
**Masking rule:** Credential fields are never returned in API responses in plaintext; only their configured/unconfigured state is exposed externally.

---

## 3. State Machine Definitions

### 3.1 Device Status Lifecycle

The `status` field on the Device entity is governed by a strict state machine. Transitions are triggered by specific system events and are subject to pre-condition guards.

#### Status Values

| Status | Meaning |
|---|---|
| `idle` | Device is registered. No authentication process is active. Eligible for authentication. |
| `inprogress` | An authentication or process workflow has been initiated. The device is actively being processed. |
| `claimed` | Authentication succeeded. CyberRock confirmed `AUTH_OK` or issued a `claim_token_id`. Awaiting operator approval. |
| `approved` | Operator has approved the claimed device. Awaiting promotion to `authenticated` via the "Move to Authenticated" action. |
| `authenticated` | Terminal success state. Device is fully enrolled and active in the SandGrain platform. |
| `rejected` | Terminal failure state. The device exhausted its maximum allowed authentication attempts. |

#### Transition Table

| From | To | Trigger | Pre-condition |
|---|---|---|---|
| `idle` | `inprogress` | Authentication workflow initiated (manual or on MQTT online event) | Device has a `token_id`, an assigned `DeviceGroup`, and an assigned `DeviceProfile` |
| `inprogress` | `claimed` | CyberRock returns `AUTH_OK` or issues `claim_token_id` | Authentication workflow in progress |
| `inprogress` | `idle` | CyberRock returns `NOT_READY` | Device not yet provisioned on CyberRock; retry is scheduled |
| `claimed` | `approved` | Operator approves the claimed device | Device status is `claimed` |
| `approved` | `authenticated` | Operator triggers "Move to Authenticated" action | Device status is `approved` and `is_approved = true` |
| `idle` / `inprogress` | `rejected` | `failed_auth_attempts >= max_failed_auth_attempts` (from DeviceProfile) | Maximum retry threshold reached |
| `rejected` | `idle` | Operator re-authenticates device | Device status is `rejected` |
| `authenticated` | *(no transition)* | Any status update event | **Guard:** `authenticated` is a terminal state. No downgrade is ever permitted, regardless of subsequent MQTT events. |

#### State Diagram

```
                   ┌──────────────────────────────────────┐
                   │             NOT_READY                 │
                   │         (retry scheduled)             │
                   ▼                                       │
[IDLE] ──(auth initiated)──► [INPROGRESS] ────────────────┘
  ▲                                │
  │                          AUTH_OK / claim_token_id
  │ (re-auth)                      │
  │                                ▼
[REJECTED] ◄──(max retries)── [CLAIMED] ──(operator approve)──► [APPROVED]
  │            exhausted                                           │
  │                                                   (move action)│
  └─── (terminal, no further automatic transitions)                ▼
                                                          [AUTHENTICATED]
                                                          (terminal success)

  Note: Lifecycle bulk-auth devices bypass claimed → approved → authenticated
        and go directly from inprogress to authenticated.
```

**Invariant:** Once a device reaches `authenticated`, no system event or API call may reduce its status to a lower state.

---

### 3.2 Device Process Log Status Lifecycle

Each `DeviceLog` record progresses through the following statuses independently.

| Status | Meaning |
|---|---|
| `pending` | Step created; execution not yet started |
| `in_progress` | Step is actively executing |
| `success` | Step completed successfully |
| `failed` | Step completed with a failure outcome |

Log entries are written at step creation (`pending` or `in_progress`) and updated when the step resolves (`success` or `failed`). The `run_auth_init` log entry is created at workflow start with status `in_progress` and closed (to `success` or `failed`) at workflow termination.

---

### 3.3 User Account Status Lifecycle

| Status | Meaning |
|---|---|
| `ACTIVE` | User can log in (subject to lock check) |
| `INACTIVE` | User is administratively disabled. Login is refused regardless of credentials. |

**Note:** Account lockout (`acc_locked_until`) is a temporary, time-bounded suspension independent of `user_status`. An `ACTIVE` user with a future `acc_locked_until` timestamp is denied login until that time elapses.

---

## 4. Module Business Logic

### 4.1 System Initialisation

System initialisation is a **one-time, transactional** operation that bootstraps the platform from an empty state. It is triggered by a Trust Admin user who has not yet been assigned to an organisation.

**Pre-condition:** No OrganizationUnit records exist in the database.

**Transactional sequence:**
1. Create a new `OrganizationUnit` with the provided name, description, and email.
2. Assign the created `ou_id` to the initiating Trust Admin user record.
3. Create a `Tenant` record linked to the new OU, with `credentials_configured = true`.
4. Create a `TenantUserCredential` record with the provided email, password, Cloudflare Client ID, and Cloudflare Client Secret.
5. Create an initial `ADMINISTRATOR` role user account with:
   - A system-generated strong password (16 characters: mixed case, digits, symbols).
   - `must_change_password = true`.
   - `user_status = ACTIVE`.
   - The `ADMINISTRATOR` role assigned.
6. Dispatch an email with the generated credentials to the administrator.

**Failure behaviour:** If any step in the sequence fails, the entire transaction is rolled back. No partial state is persisted.

**Guard:** Attempting to initialise when organisations already exist raises a conflict error. Initialisation cannot be repeated.

---

### 4.2 Authentication & Session Management

#### 4.2.1 Login Logic

**Input:** `username`, `password`

**Validation sequence (in order — first failure stops the chain):**

1. Look up user by `username`. Raise a generic "invalid credentials" error if not found. *(Reason: same error for username-not-found and wrong-password prevents username enumeration.)*
2. Check `user_status = ACTIVE`. Raise "account inactive" if not.
3. Check `acc_locked_until`. If `acc_locked_until > now`, raise "account locked" with the remaining minutes. *(Calculated as: `ceil((acc_locked_until - now) / 60000)` minutes.)*
4. Compare `password` against `password_hash` using bcrypt. If mismatch:
   - Increment `failed_logins`.
   - If `failed_logins >= 5`: set `acc_locked_until = now + 30 minutes`, reset `failed_logins = 0`.
   - Raise "invalid credentials".
5. On successful password match:
   - Reset `failed_logins = 0`, set `acc_locked_until = null`.
   - Update `last_login_at = now`.
   - Increment `token_version` *(this invalidates all previously issued JWTs for this user)*.
   - Issue a signed JWT containing: `{ sub, username, email, ou_id, token_version }`.

**Response payload includes:**
- `access_token`: The signed JWT.
- `mustChangePassword`: Derived from `must_change_password`.
- `credentialsConfigured`: Derived from the associated tenant's `credentials_configured` flag. `false` if user has no `ou_id`.

#### 4.2.2 Token Validation (Per Request)

On every authenticated API request, the JWT is validated by the following rules (all must pass):

1. JWT signature is valid (verified against the signing secret).
2. JWT is not expired.
3. The `sub` (user_id) resolves to an existing, non-deleted user.
4. `user_status = ACTIVE`.
5. `acc_locked_until` is null or in the past.
6. The `token_version` in the JWT matches the `token_version` stored on the user record.

Failure of any check rejects the request with a 401 Unauthorised response.

#### 4.2.3 Session Invalidation Rule

| Event | token_version incremented? | Effect |
|---|---|---|
| Successful login | Yes | All previously issued tokens for that user are invalidated immediately |
| Admin password reset | Yes | All sessions for the affected user are invalidated |
| User changes own password | **No** | The changing user's current session remains valid |

---

### 4.3 Password & Credential Lifecycle

#### 4.3.1 Password Reset (User-Initiated)

1. User submits their registered email address.
2. System generates a cryptographically random 64-hex-character token and stores it with an expiry of `now + 1 hour`.
3. A reset link containing the token is emailed asynchronously (failure is logged, not propagated).
4. User submits the token and a new password.
5. System validates: token exists, `password_reset_expires > now`.
6. New password is hashed with bcrypt and stored. Token and expiry fields are cleared.

**Token entropy:** `crypto.randomBytes(32)` — 256 bits of cryptographic randomness.

#### 4.3.2 User Invitation (First-Time Password Set)

1. Administrator creates a new user.
2. System generates a 64-hex-character invitation token with expiry `now + 7 days`.
3. Invitation email is dispatched asynchronously.
4. User follows the link and submits a new password.
5. System validates: invitation token exists, `invitation_expires > now`.
6. New password is hashed and stored. Invitation token and expiry are cleared.

**Re-send condition:** Invitation can only be re-sent if the user has not yet set a password (`password_hash` is empty or null). Attempting to re-send after the password has been set raises a conflict error.

#### 4.3.3 Admin Password Reset

1. Super Administrator triggers a reset for a target user.
2. System auto-generates a temporary password of the format: `{4-hex-chars}@{8-hex-chars}`.
3. The temporary password is hashed and stored.
4. `must_change_password = true` is set, `failed_logins = 0` is cleared, `acc_locked_until = null`.
5. `token_version` is incremented, invalidating all active sessions for the target user.
6. The temporary password is emailed to the user.

#### 4.3.4 Password Strength Rules

| Context | Min Length | Requirements |
|---|---|---|
| Admin-generated (system init, admin reset) | 16 characters | Uppercase + lowercase + digits + symbols |
| System-generated (user creation auto-password) | 12 characters | Uppercase + lowercase + digits + symbols |
| User-set (change, reset, invitation) | Validated by client-side schema | Min 8 characters, at least one uppercase, one digit |

---

### 4.4 User Management

#### 4.4.1 User Creation Rules

- `username` must be unique across the entire system.
- `email` must be unique across the entire system.
- A new user is created with `user_status = ACTIVE` and `must_change_password = true`.
- An invitation token is generated and the invitation email is dispatched.
- An initial role assignment is created if `role_id` is supplied.

#### 4.4.2 Role Assignment (Single-Role Model)

Each user holds exactly one role at any given time. Assigning a new role to a user **replaces** the existing role — the prior assignment is deleted and the new one is inserted. There is no accumulation of roles.

#### 4.4.3 Data Filtering

All user list operations, searches, and exports are scoped to the `ou_id` of the requesting user. Super Administrators (no `ou_id`) receive unscoped results across all organisations.

**Search logic:** Numeric search terms are matched against `user_id` as well as text fields. Non-numeric terms are matched against `username`, `email`, `name`, and `company_title` using a partial (LIKE) match.

#### 4.4.4 Sensitive Field Suppression

The following fields are **always stripped** from any user object returned via the API, regardless of the caller:
`password_hash`, `password_reset_token`, `password_reset_expires`, `invitation_token`, `invitation_expires`.

---

### 4.5 Role & Permission (RBAC/PBAC)

#### 4.5.1 Access Control Evaluation

Two independent guards control access to every protected API endpoint.

**Role Guard (OR logic):**
A request is permitted if the authenticated user possesses **at least one** of the roles declared on the endpoint.
`user.roles.some(role => requiredRoles.includes(role))`

**Permission Guard (AND logic):**
A request is permitted only if the authenticated user possesses **all** of the permissions declared on the endpoint.
`requiredPermissions.every(perm => user.permissions.includes(perm))`

Both guards must pass independently. A route can require both a role and a set of permissions.

**Active-only rule:** During JWT validation, only roles and permissions with `status = ACTIVE` are loaded into the user's session context. Inactive roles and their permissions have no effect.

#### 4.5.2 Role Management Rules

- Role `name` must be unique.
- Deleting a role first removes all associated `RolePermission` records, then removes the role itself.
- Updating a role's permissions replaces the entire permission set atomically: existing assignments are deleted, new assignments are verified (all IDs must exist) and bulk-inserted.
- Clearing all permissions from a role is a supported operation that leaves the role with zero entitlements.

---

### 4.6 Organisation & Tenant Management

#### 4.6.1 Tenant Addition

Adding a tenant to an organisation is a **transactional** operation:

1. Verify the `tenant_id` does not already exist.
2. Create the `Tenant` record linked to the OU.
3. Create the `TenantUserCredential` record with all provided API credentials.
4. Set `credentials_configured = true` on the tenant record.

If any step fails, the entire operation rolls back.

#### 4.6.2 Tenant Removal

Removing a tenant from an organisation:

1. Verify the tenant belongs to the requesting OU (security check).
2. Delete the associated `TenantUserCredential` record.
3. Delete the `Tenant` record.

This is a **hard delete** of these two records (not soft-delete), since tenant removal is an explicit administrative decommissioning action.

---

### 4.7 Device Registry

#### 4.7.1 Device Registration

A device is registered by providing its `token_id` (TID), `device_name`, `device_type`, and assignments to a `DeviceGroup`, `Tenant`, and `DeviceProfile`.

**TID normalisation:** The TID is stored in lowercase regardless of the case in which it is submitted. All subsequent lookups are case-insensitive.

**On creation:**
- `status = idle`, `is_approved = false`, `is_active = true`.
- If `offline_cw` and `offline_rw` are provided (factory pre-provisioned device), the offline authentication flow is triggered immediately in the background.
- If neither is provided, the device waits in `idle` for an MQTT online event or a manual authentication trigger.

#### 4.7.2 Bulk Import

Bulk import uses a structured JSON format (`TrustBridge Device Import V1.0`) with the following rules:

- Devices are matched by TID (case-insensitive). An existing device with the same TID is updated only if the corresponding `overwrite_*` flag is set in the import section.
- If a device with the same TID does not exist, it is created as new.
- The `cr_already_used` flag on a device entry suppresses post-import authentication (used for devices already claimed externally).
- Devices with both `offline_cw` and `offline_rw` populated automatically enter the offline authentication flow after import.

#### 4.7.3 Gateway Whitelist

The whitelist endpoint (`GET /api/devices/whitelist`) returns a newline-separated list of all registered TIDs in lowercase. Only TIDs that are exactly 64 hexadecimal characters are included; malformed TIDs are silently excluded. This list is consumed by the local hardware gateway on startup to populate its admission whitelist.

#### 4.7.4 Credential Provisioning to Gateway

The `GET /api/devices/credentials-by-tid` endpoint is publicly accessible (no JWT required). It accepts a TID and returns the composite set of credentials the Cloud SDK needs to authenticate:

```
{
  device_username:         DeviceGroup.group_id
  device_password:         DeviceGroup.password
  tenant_email:            TenantUserCredential.email
  tenant_password:         TenantUserCredential.password
  cf_access_client_id:     TenantUserCredential.cf_access_client_id
  cf_access_client_secret: TenantUserCredential.cf_access_client_secret
}
```

If the TID is not found or the device has no group assigned, an empty object is returned.

---

### 4.8 Device Authentication Orchestration

The authentication orchestration module is the most complex functional area of TrustBridge. It manages the state of every device through its cryptographic handshake with the CyberRock service, handling two distinct operational paths.

#### 4.8.1 Path Selection Logic

At the start of any authentication cycle, the system evaluates the device record:

```
IF device.offline_cw IS SET AND device.offline_rw IS SET:
  → Execute OFFLINE AUTHENTICATION PATH
ELSE:
  → Execute ONLINE AUTHENTICATION PATH
```

#### 4.8.2 Offline Authentication Path

Used for factory-provisioned devices where the CW and RW are pre-computed and supplied at import.

**Logical sequence:**

1. Re-fetch the device from the database (to guard against stale in-memory state).
2. Validate credentials: `token_id`, `DeviceGroup.group_id`, `DeviceGroup.password`, `TenantUserCredential.email`, `TenantUserCredential.password`, `TenantUserCredential.cf_access_client_id`, `TenantUserCredential.cf_access_client_secret` must all be present. Any missing field causes immediate rejection.
3. Call CyberRock `requestCW` to obtain a fresh `transactionId`. *(The pre-computed offline CW is used in place of the live CW from this call; only the transactionId is needed.)*
4. Call CyberRock `replyRW` submitting the pre-stored `offline_cw`, `offline_rw`, and the fresh `transactionId`.
5. Parse the `auth_status` and optional `claimTokenId` from the response.
6. Pass the result to the Auth Result Handler (see Section 4.8.4).

#### 4.8.3 Online Authentication Path

Used for live devices connected via MQTT.

**Trigger events:**
- MQTT presence event: device publishes `online` on topic `sandgrain/v1/{tid}/status`.
- Manual trigger: operator calls `POST /api/devices/:id/authenticate`.
- Bulk trigger: operator calls `POST /api/devices/lifecycle/bulk-auth`.

**Guard conditions (before starting the online flow):**
- Device `status` must be `idle` or `rejected`.
- No retry must already be pending for this device.
- Device must have a `token_id`, assigned `DeviceGroup`, and assigned `DeviceProfile`.

**Logical sequence:**

1. Set device `status = inprogress`. Write `run_auth_init` log entry with `status = in_progress`.
2. Retrieve DeviceProfile parameters: `auth_frequency`, `max_failed_auth_attempts`.
3. Retrieve TenantUserCredential for the device's tenant. Obtain a valid CyberRock access token (from cache or by re-authenticating).
4. Call CyberRock `requestCW` → receive `{ cw, transactionId }`.
5. Send `requestComputeRW` via MQTT to the gateway with `{ tid, cw, faultMode }`. Wait up to 60 seconds for the device IC to compute and return the RW. *(faultMode is 0 for Normal Flow, 1 for Fault Injection, 2 for Error Stress.)*
6. Call CyberRock `replyRW` submitting `{ cw, rw, transactionId }`.
7. Parse `auth_status` and optional `claimTokenId` from the CyberRock response.
8. Pass the result to the Auth Result Handler.

**MQTT retry policy (per MQTT request):** 2 attempts with a 3-second delay between attempts before raising a timeout failure.

**MQTT response timeout:** 60 seconds per request.

**run_auth_init auto-close:** If no terminal result (from `gw_log` or `auth_result`) is received within 90 seconds of opening a `run_auth_init` log entry, the entry is automatically closed with status `failed` and message "Authentication timed out — no result received from device". This is a best-effort safety net for cases where the v3 Device SDK does not publish an auth result back via MQTT.

#### 4.8.4 Auth Result Handler

The Auth Result Handler applies business rules to the `auth_status` value returned by CyberRock.

| `auth_status` / Condition | Action |
|---|---|
| `AUTH_OK` | Set `is_approved = true`, `failed_auth_attempts = 0`. Set `status = claimed`. Record `claim_token_id` if provided. Log `success`. Fire `device_approved` system activity. |
| `claimTokenId` present (auth_status ≠ `AUTH_OK`) | Set `claim_token_id`, `is_approved = true`. Set `status = claimed`. Asynchronously call `stepClaimToken()` to finalise the claim on CyberRock. |
| `NOT_READY` | Device is not yet provisioned on CyberRock. Set `status = idle`. Log informational message: "Device not yet provisioned." Schedule a retry after `auth_frequency` seconds. |
| Any other failure (`AUTH_FAIL`, `TIMEOUT`, etc.) | Call Failure-with-Retry Handler (see below). |

**Failure-with-Retry Handler:**

```
INCREMENT device.failed_auth_attempts

IF failed_auth_attempts < max_failed_auth_attempts (from DeviceProfile):
  SET status = idle
  SET status_message = "Retry scheduled in {auth_frequency}s"
  SCHEDULE retry after auth_frequency_ms

ELSE:
  SET status = rejected (terminal)
  SET status_message = "Maximum authentication attempts reached"
  FIRE system activity: device_failed (severity: error)
```

**No-downgrade invariant:** The Auth Result Handler always checks the current `status` before writing. If the device has reached `authenticated` by any concurrent process, the status update is silently skipped.

#### 4.8.5 Lifecycle Bulk Authentication

When `POST /api/devices/lifecycle/bulk-auth` is called, each targeted device is registered in an internal lifecycle set before authentication begins.

**Special rule for lifecycle-registered devices:** When `AUTH_OK` is received for a device in the lifecycle set, the normal `claimed` status is bypassed. The device is transitioned **directly** to `authenticated`, and `is_active = true` is set. This reflects the operational reality that these devices have already been through a prior claim cycle and are being re-authenticated for lifecycle management purposes.

---

### 4.9 Hardware Gateway — Challenge-Response Workflow

This section describes the interaction pattern between the hardware gateway (a non-human system actor) and TrustBridge for the cryptographic CW/RW exchange.

#### 4.9.1 MQTT Communication Pattern

All gateway communication follows a synchronous request-response pattern over MQTT:

```
TrustBridge subscribes to:   sandgrain/v1/{tid}/rsp/{action}
TrustBridge publishes to:    sandgrain/v1/{tid}/req/{action}

Gateway subscribes to:       sandgrain/v1/{tid}/req/{action}
Gateway publishes to:        sandgrain/v1/{tid}/rsp/{action}
```

TrustBridge always subscribes to the response topic **before** publishing the request, to guarantee no response message is missed. After the response is received (or the timeout elapses), the subscription is removed.

**Message envelope:**

```json
{
  "type":    <integer — message type code>,
  "payload": { ... },
  "crc": {
    "TID":           "<CRC-16 hex of TID field>",
    "CW":            "<CRC-16 hex of CW field>",
    "RW":            "<CRC-16 hex of RW field>",
    "transactionId": "<CRC-16 hex of transactionId field>"
  }
}
```

**CRC validation rule:** All inbound messages from the gateway are validated for integrity using CRC-16/CCITT-FALSE on the protected fields (TID, CW, RW, transactionId). A CRC mismatch causes the step to fail with an integrity error and is logged.

#### 4.9.2 Token-Computes-RW Flow (Online Authentication)

```
TrustBridge                CyberRock API               Gateway / Token IC
     │                           │                              │
     │── POST /device/requestCW ──►                             │
     │◄─ { cw, transactionId } ──│                             │
     │                           │                              │
     │── MQTT req requestComputeRW {TID, CW, faultMode} ──────►│
     │                           │         [IC computes RW]     │
     │◄─ MQTT rsp { RW } ────────────────────────────────────── │
     │                           │                              │
     │── POST /device/replyRW ───►                             │
     │    { TID, CW, RW, transactionId }                        │
     │◄─ { auth_status, claimTokenId? } ──────────────────────  │
     │                           │                              │
     [Auth Result Handler]
```

#### 4.9.3 Gateway Log Processing

The gateway publishes step-by-step progress on topic `sandgrain/v1/{tid}/gw_log`. Each message carries `{ step, status, message, attempt }`.

**Mapping table:**

| Gateway `step` | Gateway `status` | TrustBridge log status | Terminal? |
|---|---|---|---|
| `1/6` through `6/6` | `ok` | `success` | Only `6/6 ok` is terminal success |
| `1/6` through `6/6` | `fail` | `failed` | Non-terminal (further steps may follow) |
| `err_mgt` | `ok` | `success` | Terminal success (error recovery succeeded) |
| `failed` | `fail` | `failed` | **Terminal failure** (all gateway retries exhausted) |
| Any | other | `in_progress` | Non-terminal |

**Terminal detection:** When a terminal condition is detected (`6/6 ok`, `err_mgt ok`, or `failed fail`), the `run_auth_init` log entry is closed and the Auth Result Handler is invoked.

**Attempt tracking:** The `attempt_number` for gateway log entries is derived from the `run_auth_init` log (when TrustBridge initiated the auth) or from a session cache keyed by TID (when the gateway initiated autonomously). If a new session starts (`step = 1/6`, `attempt = 1`), a new attempt number is generated.

#### 4.9.4 Firmware Verification Workflow

Initiated via `POST /api/devices/:id/run-process` with `process_type = fw_verification`.

```
TrustBridge
  1. MQTT requestComputeFWVerification(tid) → device computes { fw_verify, rw }
  2. MQTT fwVerification(type=5) to Cloud SDK with { FW_VERIFY, RW }
  3. Cloud SDK returns { permission, verificationRW }
  4. Log and store verificationRW value
```

**Output:** The `verificationRW` value is the required input for the subsequent Installation process.

#### 4.9.5 Installation Workflow

Initiated via `POST /api/devices/:id/run-process` with `process_type = installation`.

**Mandatory input:** `verification_rw` (obtained from a successful prior FW Verification). If not supplied, the request is rejected.

```
TrustBridge
  1. MQTT requestComputeInstallation(tid, fwRw=verification_rw) → device computes { cw, rw }
  2. MQTT fwInstallation(type=6) to Cloud SDK with { CW, RW }
  3. Cloud SDK returns { FW_INSTALLATION }
  4. Log result and update device status message
```

---

### 4.10 Device Lifecycle Transfer (SandGrain Integration)

After a device reaches `authenticated` status, its operational lifecycle is governed through the SandGrain CyberRock Tenant API. TrustBridge mirrors the CyberRock lifecycle state locally via `is_active`.

#### 4.10.1 Lifecycle States

| CyberRock Status | Local `is_active` | Meaning |
|---|---|---|
| `AssetStatusActive` | `true` | Device is operational |
| `AssetOwnedAndActive` | `true` | Device is owned and active |
| `AssetNonActive` | `false` | Device has been suspended |
| `ReadyForHandOver` | `false` | Device is being prepared for transfer |
| `AssetEndOfLife` | `false` | Device has been decommissioned |

#### 4.10.2 Lifecycle Update Flow

When an operator calls `PUT /api/devices/:id/lifecycle`:

1. Look up the device and its tenant.
2. Call CyberRock `PUT /token-serials/{tid}` with `{ status, applyToAllDelegates, iotId, tenantId }`.
3. On success, update the local device record's `is_active` flag to match the lifecycle state.
4. If the new status is active, register the device for lifecycle bulk-auth (its next `AUTH_OK` will directly set it to `authenticated` with `is_active = true`).

---

### 4.11 Tenant API Credential Management

#### 4.11.1 Credential Storage Flow

When an Organisation Administrator saves SandGrain API credentials (`POST /api/tenant-api/credentials`):

1. Look up any existing Tenant associated with the user's `ou_id`.
2. **Transactional operation:**
   - If a tenant exists: update the `Tenant` record and delete + re-insert the `TenantUserCredential`.
   - If no tenant exists: create a new `Tenant` record, then insert the `TenantUserCredential`.
3. Set `credentials_configured = true` on the `Tenant` record.
4. Invalidate any cached access tokens for this tenant.

#### 4.11.2 Token Caching

CyberRock access tokens obtained by TrustBridge on behalf of a tenant are cached in-memory, keyed by `tenant_id`. The caching rule is:

```
Cache the token until: JWT expiry timestamp − 30 seconds
```

This ensures TrustBridge always holds a valid token for outbound calls without re-authenticating on every request. The cache is invalidated when credentials are updated.

#### 4.11.3 Credential Exposure Rules

| Context | What is returned |
|---|---|
| `GET /api/tenant-api/credentials` | Credential fields returned in masked form (e.g., only first/last characters visible) |
| `GET /api/tenant-api/credentials/status` | Boolean only — whether credentials are configured |
| `GET /api/devices/credentials-by-tid` | Full credentials returned (public endpoint for Cloud SDK use) |

---

### 4.12 Audit & System Activity Logging

All significant business events are logged to `SystemActivity` asynchronously and non-blockingly. A failure to write an activity log does not fail the primary operation.

#### 4.12.1 Logged Event Types

| `activity_type` | Trigger | Severity |
|---|---|---|
| `device_created` | Device registered | `info` |
| `device_authenticated` / `device_approved` | `AUTH_OK` received | `success` |
| `device_failed` | Max retries exhausted | `error` |
| `device_rejected` | Device moved to rejected | `warning` |
| `device_group_created` | Device group registered | `info` |
| `device_group_password_changed` | Group password updated | `warning` |
| `user_created` | User account created | `info` |
| `user_role_assigned` | Role assigned to user | `info` |

#### 4.12.2 DeviceLog vs SystemActivity

| | DeviceLog | SystemActivity |
|---|---|---|
| **Scope** | One record per authentication step | One record per significant business event |
| **Granularity** | Step-level (e.g., `gw:2/6`) | Event-level (e.g., `device_authenticated`) |
| **Contains** | Request/response payloads, duration, attempt number | Title, description, severity, metadata |
| **Used for** | Technical debugging, step replay | Operational audit, compliance reporting |

---

### 4.13 Dashboard & Analytics

Dashboard data is computed by the following aggregation logic:

| Endpoint | Logic |
|---|---|
| `/stats` | COUNT of devices grouped by `status`, scoped to the user's `tenant_ids` |
| `/charts/device-status` | Same counts formatted for chart rendering |
| `/charts/authentication-trend` | COUNT of `DeviceLog` entries grouped by date, filtered by `process_type = authentication` and `status = success` |
| `/recent-devices` | SELECT from Device ORDER BY `created_at DESC`, LIMIT N, scoped to `tenant_ids` |
| `/super-admin/stats` | Platform-wide counts: total organisations, total users, total devices |
| `/super-admin/recent-orgs` | SELECT from OrganizationUnit ORDER BY `created_at DESC`, LIMIT N |

---

## 5. Cross-Cutting Business Rules

### 5.1 Multi-Tenant Data Isolation

The isolation model is enforced at the service layer, not at the database level alone.

**Rule:** For every data query involving devices, device groups, device profiles, or audit logs, the system resolves the set of `tenant_ids` associated with the authenticated user's `ou_id`. This set is computed during JWT validation and attached to the session context.

```
tenant_ids = SELECT tenant_id FROM cr_tenant WHERE ou_id = user.ou_id AND deleted_at IS NULL
```

All subsequent queries for tenant-scoped entities include a `WHERE tenant_id IN (tenant_ids)` clause.

**Super Administrator exception:** A Super Administrator user has `ou_id = null`. The `tenant_ids` resolution step is skipped, and queries are executed without the tenant filter, returning data across all organisations.

### 5.2 Access Control Evaluation

Access control is evaluated in this guard order:

```
1. Is the endpoint marked @Public? → Allow (skip all guards)
2. Is the JWT valid? (JwtAuthGuard) → Reject with 401 if not
3. Does the user have a required role? (RolesGuard) → Reject with 403 if not
4. Does the user have all required permissions? (PermissionsGuard) → Reject with 403 if not
```

All four checks are applied independently. A route may require only a JWT (no role/permission decorators), only specific roles, only specific permissions, or both.

### 5.3 Soft Deletion

The following entities are soft-deleted (never physically removed from the database):

`User`, `Device`, `DeviceGroup`, `DeviceProfile`, `OrganizationUnit`, `Tenant`, `Role`, `Permission`

All queries against soft-deletable entities include an implicit `WHERE deleted_at IS NULL` condition. Soft-deleted records remain in the database for historical and forensic purposes.

**Exception:** When a Tenant is removed from an Organisation, the `Tenant` record and its associated `TenantUserCredential` are **hard-deleted**. This is an explicit decommissioning action.

### 5.4 Audit Immutability

`DeviceLog` and `SystemActivity` records are **never updated or deleted** after creation. They are append-only structures. This immutability is enforced at the application logic layer — no update or delete paths exist for these entities.

---

## 6. Error Handling Logic

### 6.1 Authentication Errors

| Condition | Response | Note |
|---|---|---|
| Username not found | Generic "invalid credentials" | Prevents username enumeration |
| Incorrect password | Generic "invalid credentials" | Same message as above |
| User inactive | "Account is inactive" | Distinct from credential failure |
| Account locked | "Account locked. Try again in N minutes." | N is computed from `acc_locked_until` |
| JWT expired | 401 Unauthorised | Client must re-authenticate |
| `token_version` mismatch | 401 Unauthorised | Stale token; user must re-login |

### 6.2 Device Authentication Errors

| Condition | Business Response |
|---|---|
| `token_id` missing on device | Device rejected immediately; logged as validation failure |
| `DeviceGroup` not assigned | Device rejected immediately; logged as credential validation failure |
| `DeviceProfile` not assigned | Online auth cannot start; device logged as configuration error |
| Tenant credentials missing | Auth cannot start; device logged as credential validation failure |
| MQTT request timeout (60s) | Retry up to 2 times with 3s delay; on final timeout, increment `failed_auth_attempts` and apply retry/reject logic |
| CyberRock returns `NOT_READY` | Set `status = idle`; schedule retry (device not yet provisioned, not a permanent failure) |
| CyberRock returns `AUTH_FAIL` | Increment `failed_auth_attempts`; schedule retry if below threshold; reject if threshold reached |
| `failed_auth_attempts >= max_failed_auth_attempts` | Set `status = rejected`; write system activity with `severity = error`; no further automatic retries |
| Attempt to downgrade authenticated device | Status update is silently skipped; no error is raised |

### 6.3 MQTT Communication Errors

| Condition | Business Response |
|---|---|
| MQTT broker connection lost | MQTT client attempts automatic reconnection; pending requests are timed out |
| CRC validation failure on inbound message | Step logged as `failed`; integrity error recorded; treated as a communication failure |
| Response topic receives no message within 60s | Request is considered timed out; retry policy applied (2 attempts, 3s apart) |
| Duplicate auth trigger for device with pending retry | Second trigger is silently ignored; existing retry is not cancelled |

### 6.4 External API Errors

| Condition | Business Response |
|---|---|
| CyberRock API returns non-2xx | The triggering authentication step is failed; retry/reject logic applied |
| Token cache miss + re-authentication fails | All auth operations for that tenant are halted; logged as credential failure |
| Tenant API credentials not configured | `credentials_configured = false`; UI prompts administrator on login |
| Email dispatch failure (any) | Error is logged to server console; the primary operation (user creation, password reset) is **not** rolled back |

---

## 7. Business Rule Index

A consolidated reference of all named business rules for rapid lookup.

| Rule ID | Rule Summary | Section |
|---|---|---|
| BR-001 | Account locks for 30 minutes after 5 consecutive failed login attempts | 4.2.1 |
| BR-002 | Successful login increments `token_version`, invalidating all prior JWTs | 4.2.1 |
| BR-003 | User changing own password does NOT increment `token_version` | 4.2.3 |
| BR-004 | Admin resetting another user's password DOES increment `token_version` | 4.2.3 |
| BR-005 | Password reset tokens expire in 1 hour | 4.3.1 |
| BR-006 | Invitation tokens expire in 7 days | 4.3.2 |
| BR-007 | Invitation resend is blocked if user has already set a password | 4.3.2 |
| BR-008 | A user holds exactly one role at a time; new assignment replaces the old | 4.4.2 |
| BR-009 | All sensitive user fields (`password_hash`, tokens) are stripped from every API response | 4.4.4 |
| BR-010 | Role guard uses OR logic (any matching role); Permission guard uses AND logic (all must match) | 4.5.1 |
| BR-011 | Only ACTIVE roles and permissions participate in access control evaluation | 4.5.1 |
| BR-012 | System initialisation is a one-time, transactional operation | 4.1 |
| BR-013 | TIDs are normalised to lowercase on ingestion; comparisons are case-insensitive | 4.7.1 |
| BR-014 | `cr_already_used = true` in bulk import suppresses post-import authentication | 4.7.2 |
| BR-015 | Whitelist includes only TIDs that are exactly 64 hex characters | 4.7.3 |
| BR-016 | Offline auth path is selected when both `offline_cw` and `offline_rw` are present | 4.8.1 |
| BR-017 | Device credentials are validated before any auth step; missing fields cause immediate failure | 4.8.2, 4.8.3 |
| BR-018 | `AUTH_OK` sets `is_approved = true` and transitions device to `claimed` | 4.8.4 |
| BR-019 | `NOT_READY` resets device to `idle` and schedules a retry; it is not treated as a permanent failure | 4.8.4 |
| BR-020 | Device failures increment `failed_auth_attempts`; threshold reached → `rejected` (terminal) | 4.8.4 |
| BR-021 | `authenticated` is a terminal status; no system event or API call may downgrade it | 3.1 |
| BR-022 | Lifecycle bulk-auth registered devices skip `claimed` and go directly to `authenticated` | 4.8.5 |
| BR-023 | FW Installation requires `verification_rw` from a prior successful FW Verification | 4.9.5 |
| BR-024 | MQTT request timeout is 60 seconds; 2 retry attempts with 3s delay per request | 4.8.3 |
| BR-025 | CRC-16/CCITT-FALSE is validated on all inbound gateway message fields | 4.9.1 |
| BR-026 | CyberRock access tokens are cached until 30 seconds before their expiry | 4.11.2 |
| BR-027 | Credential cache is invalidated when tenant credentials are updated | 4.11.1 |
| BR-028 | DeviceLog and SystemActivity records are immutable once written | 5.4 |
| BR-029 | Soft deletion is applied to all primary business entities; `cr_tenant` and `cr_tenant_user_credential` are hard-deleted on explicit decommission | 5.3 |
| BR-030 | Email dispatch failures do not roll back or fail the primary operation | 6.4 |
| BR-031 | Tenant credential prompt is shown on every login session where `credentials_configured = false` | 4.11.1 |
| BR-032 | Data queries for tenant-scoped entities always include `WHERE tenant_id IN (user's tenant_ids)` | 5.1 |

---

*End of Document — TB-FDD-001 Rev 1.0*
