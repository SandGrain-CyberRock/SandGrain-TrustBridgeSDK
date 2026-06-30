# Requirements Specification Document

**Project:** TrustBridge
**Document Reference:** TB-REQ-001
**Revision:** 1.2
**Status:** Approved
**Prepared for:** SandGrain BV
**Classification:** Confidential

---

## Document Control

| Field | Value |
|---|---|
| Project Name | TrustBridge |
| Document Type | Functional & Non-Functional Requirements Specification |
| Intended Audience | SandGrain BV — Engineering, Product, and Quality Assurance |
| Governing Standard | IEEE 830-1998 (SRS) |

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Stakeholders and User Personas](#2-stakeholders-and-user-personas)
3. [Functional Requirements](#3-functional-requirements)
   - 3.1 Security & Authentication Module
   - 3.2 User Management Module
   - 3.3 Role & Permission (RBAC/PBAC) Module
   - 3.4 Organisation & Tenant Management Module
   - 3.5 Device Registry Module
   - 3.6 Device Authentication & Lifecycle Module
   - 3.7 Device Group Management Module
   - 3.8 Device Profile Module
   - 3.9 Hardware Bridge (SandGrain SDK Integration)
   - 3.10 MQTT Integration Module
   - 3.11 Tenant API Integration Module
   - 3.12 Audit & System Activity Module
   - 3.13 Dashboard & Analytics Module
   - 3.14 Master Data Module
   - 3.15 User Interface Module
4. [Non-Functional Requirements](#4-non-functional-requirements)
   - 4.1 Security
   - 4.2 Performance
   - 4.3 Scalability
   - 4.4 Reliability & Availability
   - 4.5 Maintainability
5. [System Environment](#5-system-environment)
   - 5.1 Backend Technical Stack
   - 5.2 Frontend Technical Stack
   - 5.3 SandGrain SDK Layer
   - 5.4 Infrastructure Dependencies
   - 5.5 Hardware Requirements
6. [Data Integrity Principles](#6-data-integrity-principles)
7. [Glossary](#7-glossary)

---

## 1. Project Overview

### 1.1 Purpose

TrustBridge is a centralised IoT Device Lifecycle Management and Hardware Authentication Platform, purpose-built to operate as the authoritative management layer between SandGrain BV's hardware token ecosystem and enterprise customer deployments. It provides end-to-end visibility, control, and cryptographic verification for every device from initial registration through active operation to end-of-life.

### 1.2 Business Context

SandGrain BV supplies hardware security tokens — embedded cryptographic integrated circuits (ICs) — to enterprise customers. These tokens require a trusted, auditable management plane to:

- Register and enrol hardware tokens into a customer's infrastructure.
- Orchestrate the multi-step cryptographic handshake between each physical token, the edge gateway, and the SandGrain cloud verification service (CyberRock API).
- Manage the full post-authentication lifecycle of each device, including firmware verification, installation, and decommissioning.
- Provide a governed, multi-tenant access model so that multiple customer organisations can independently manage their device fleets without cross-tenant data exposure.

TrustBridge fulfils these functions through a secure, role-governed web application backed by a REST API, a persistent relational database, and a real-time MQTT event bridge to the physical device layer.

### 1.3 Scope

The TrustBridge platform encompasses:

- A **backend REST API service** (Node.js/NestJS) serving all business logic, data persistence, and third-party integrations.
- A **web-based frontend application** (React/TypeScript) providing a governed user interface for all defined user personas.
- An **MQTT bridge service** that subscribes to hardware gateway event topics and drives real-time device state transitions.
- An **integration layer** to the SandGrain CyberRock Tenant API for token lifecycle management.
- A **SandGrain Cloud SDK** component (Python) that implements the cryptographic authentication protocol on behalf of the server side.

### 1.4 Intended Readership

This document is addressed to SandGrain BV's engineering and product teams. It defines the definitive, agreed requirements that govern all design and implementation decisions within the TrustBridge platform.

---

## 2. Stakeholders and User Personas

### 2.1 Super Administrator

The Super Administrator is an operator of the TrustBridge platform itself, typically a SandGrain BV engineer or a designated platform operations role.

**Responsibilities:**
- Creation, configuration, and management of customer organisations within the platform.
- Oversight of the full user base across all tenants.
- Management of global roles and permissions.
- Access to platform-wide analytics and health dashboards.

**System Access Level:** Unrestricted across all organisations and tenants.

### 2.2 Organisation Administrator

The Organisation Administrator is the primary authorised user within a customer organisation. This persona is responsible for the day-to-day governance of their organisation's device fleet and user population.

**Responsibilities:**
- Onboarding and managing users within their organisation.
- Assigning roles and permissions to users.
- Registering device groups and device profiles.
- Initiating and monitoring device authentication workflows.
- Configuring tenant API credentials for integration with SandGrain services.
- Exporting device and user data for reporting.

**System Access Level:** Scoped to their own organisation's data.

### 2.3 Operational User (Hardware Operator)

The Operational User is a technician or field engineer responsible for day-to-day device operations within an organisation.

**Responsibilities:**
- Viewing device status and connectivity.
- Triggering individual or bulk device authentication processes.
- Monitoring authentication event logs.
- Managing device lifecycle transitions (e.g., marking devices as active, initiating end-of-life).
- Reviewing audit logs and communication events.

**System Access Level:** Defined by permissions assigned by the Organisation Administrator. Read and operational access to devices; no administrative access.

### 2.4 Hardware Gateway (System Actor)

The Hardware Gateway is a non-human system actor — an edge computing device running the SandGrain Device SDK. It communicates with TrustBridge exclusively via the MQTT protocol.

**Responsibilities:**
- Publishing device presence (online/offline) status events.
- Executing cryptographic challenge-response computations on the hardware token IC.
- Publishing gateway logs and authentication results to designated MQTT topics.

---

## 3. Functional Requirements

The following requirements are stated in the imperative voice ("The system shall…") and represent the complete, agreed set of capabilities the TrustBridge platform must provide.

---

### 3.1 Security & Authentication Module

**REQ-AUTH-001:** The system shall authenticate users via a username and password credential pair submitted to a dedicated login endpoint.

**REQ-AUTH-002:** The system shall issue a signed JSON Web Token (JWT) upon successful authentication, to be used as the bearer credential for all subsequent API requests.

**REQ-AUTH-003:** The system shall include within the JWT payload the user's identifier, username, email, organisation unit identifier, and a monotonically incrementing token version number.

**REQ-AUTH-004:** The system shall invalidate all previously issued tokens for a user upon each new successful login by incrementing the stored token version and rejecting any inbound token whose version does not match the current stored value.

**REQ-AUTH-005:** The system shall lock a user account for a minimum of 30 minutes following five consecutive failed login attempts, and shall return a clear, non-disclosive error to the client.

**REQ-AUTH-006:** The system shall support a password reset workflow initiated by the registered email address of the user, issuing a time-limited (1 hour) cryptographically random reset token and transmitting it to the user via electronic mail.

**REQ-AUTH-007:** The system shall support a user invitation workflow whereby a newly created user account receives a time-limited (7 days) invitation token via electronic mail, enabling the user to set their initial password before their first login.

**REQ-AUTH-008:** The system shall enforce a mandatory password change for any user whose account has been flagged `must_change_password = true` at login time, redirecting the user to the password change flow before granting access to any other resource.

**REQ-AUTH-009:** The system shall provide a `POST /api/auth/change-password` endpoint for authenticated users to change their current password, requiring submission of the existing credential for verification.

**REQ-AUTH-010:** The system shall provide a Super Administrator endpoint to forcibly reset any user's password without requiring the existing credential.

**REQ-AUTH-011:** The system shall hash all user passwords using the bcrypt algorithm prior to storage, and shall never store or transmit plaintext passwords.

**REQ-AUTH-012:** The system shall apply a global JWT guard to all API routes by default, requiring explicit decorator-level opt-out (`@Public`) for any route intended to be publicly accessible.

**REQ-AUTH-013:** The system shall provide a one-time system initialisation endpoint (`POST /api/auth/initialize`), accessible only to the `TRUST_ADMIN` role, that creates the first Organisation Unit, associates the initiating user with it, provisions tenant credentials, and creates an initial Administrator user account. The operation shall be transactional and shall be rejected if any Organisation Unit already exists.

---

### 3.2 User Management Module

**REQ-USER-001:** The system shall allow authorised administrators to create user accounts, specifying name, username, email address, company title, assigned organisation, and role.

**REQ-USER-002:** The system shall assign a unique, system-generated identifier to each user account at the time of creation.

**REQ-USER-003:** The system shall support listing users with server-side pagination, full-text search, and filtering capabilities.

**REQ-USER-004:** The system shall allow authorised administrators to update user profile information, including name and company title.

**REQ-USER-005:** The system shall implement soft deletion for user accounts, preserving the record in the database with a `deleted_at` timestamp, ensuring referential integrity and auditability.

**REQ-USER-006:** The system shall allow authorised administrators to re-send invitation emails to users who have not yet accepted their invitation.

**REQ-USER-007:** The system shall allow authorised administrators to assign or reassign a role to any user within their governance scope.

**REQ-USER-008:** The system shall support export of the user list in Microsoft Excel (XLSX), CSV, and JSON formats.

**REQ-USER-009:** The system shall expose a dedicated search endpoint for users supporting partial-match queries.

---

### 3.3 Role & Permission (RBAC/PBAC) Module

**REQ-RBAC-001:** The system shall implement a Role-Based Access Control (RBAC) model, wherein each user is assigned exactly one role, and access to resources is governed by that role's permissions.

**REQ-RBAC-002:** The system shall implement a Permission-Based Access Control (PBAC) model layered over RBAC, wherein each role is associated with a discrete set of permissions that govern individual API operations.

**REQ-RBAC-003:** The system shall represent permissions as module–action pairs in the format `{module}:{action}` (e.g., `device:create`, `user:retrieve`).

**REQ-RBAC-004:** The system shall enforce permission guards at the API route level, rejecting any request from a user whose active role does not include the required permission.

**REQ-RBAC-005:** The system shall allow authorised administrators to create, update, and delete roles.

**REQ-RBAC-006:** The system shall allow authorised administrators to assign and revoke permissions from a role.

**REQ-RBAC-007:** The system shall allow authorised administrators to clear all permissions from a role in a single operation.

**REQ-RBAC-008:** The system shall only consider roles and permissions whose status is ACTIVE when evaluating access control decisions.

**REQ-RBAC-009:** The system shall provide an endpoint to retrieve the full list of unique permission module names, enabling dynamic permission management interfaces.

---

### 3.4 Organisation & Tenant Management Module

**REQ-ORG-001:** The system shall support a multi-tenant data model in which the highest-level entity is an Organisation Unit (OU), beneath which one or more Tenants may be registered.

**REQ-ORG-002:** The system shall allow Super Administrators to create, update, and delete organisation units.

**REQ-ORG-003:** The system shall allow Super Administrators to associate one or more tenants with an organisation unit, and to remove such associations.

**REQ-ORG-004:** The system shall scope all data access (devices, groups, profiles, audit logs) to the set of tenant identifiers associated with the authenticated user's organisation unit, enforcing strict cross-tenant isolation.

**REQ-ORG-005:** The system shall grant Super Administrators unrestricted access to data across all organisations and tenants.

**REQ-ORG-006:** The system shall implement soft deletion for organisation units and tenants, preserving records with a `deleted_at` timestamp.

**REQ-ORG-007:** The system shall support listing and retrieval of organisations with pagination.

---

### 3.5 Device Registry Module

**REQ-DEV-001:** The system shall maintain a persistent registry of all hardware devices (tokens), each uniquely identified by a system-generated device identifier and a hardware Token ID (TID) provided at registration.

**REQ-DEV-002:** The system shall record the following attributes for each registered device: device name, Token ID (TID), device type, assigned device group, assigned tenant, assigned profile, status, activity state, and timestamps for creation, modification, and deletion.

**REQ-DEV-003:** The system shall enforce a defined device status lifecycle with the following permissible states: `idle`, `inprogress`, `claimed`, `approved`, `authenticated`, and `rejected`.

**REQ-DEV-004:** The system shall support bulk device registration via import of files in CSV, Microsoft Excel (XLSX), and JSON formats.

**REQ-DEV-005:** The system shall support export of the device registry in Microsoft Excel (XLSX), CSV, and JSON formats.

**REQ-DEV-006:** The system shall support listing devices with server-side pagination, full-text search, and filtering by status.

**REQ-DEV-007:** The system shall provide an endpoint to retrieve a summary count of devices grouped by status.

**REQ-DEV-008:** The system shall provide an endpoint to retrieve a list of devices filtered by tenant association.

**REQ-DEV-009:** The system shall implement soft deletion for device records.

**REQ-DEV-010:** The system shall provide a publicly accessible endpoint (`GET /api/devices/credentials-by-tid`) enabling hardware gateways to retrieve device group credentials by TID, without requiring JWT authentication.

**REQ-DEV-011:** The system shall provide a publicly accessible endpoint (`GET /api/devices/whitelist`) returning the set of registered Token IDs for use as a gateway admission whitelist.

---

### 3.6 Device Authentication & Lifecycle Module

**REQ-DEVAUTH-001:** The system shall orchestrate a multi-step cryptographic authentication workflow for each device, logging every discrete step (including step number, status, message, request data, response data, duration, and attempt number) to a persistent device log.

**REQ-DEVAUTH-002:** The system shall support three distinct post-enrolment process types that can be initiated per device: `authentication`, `fw_verification`, and `installation`.

**REQ-DEVAUTH-003:** The system shall support three authentication verification modes for the authentication process: Option 1 (Normal Flow), Option 2 (Fault Injection), and Option 3 (Error Stress).

**REQ-DEVAUTH-004:** The system shall transition a device from `idle` to `inprogress` status upon initiation of an authentication workflow, and subsequently to `claimed` upon successful token claim with the CyberRock API.

**REQ-DEVAUTH-005:** The system shall transition a device to `authenticated` status upon receipt of a successful terminal authentication result, and to `rejected` upon receipt of a failure. Upon successful authentication the device record shall additionally have its `is_approved` flag set to `true`.

**REQ-DEVAUTH-006:** The system shall provide a dedicated endpoint (`POST /api/devices/move/to-authenticated`) to transition a batch of `approved` devices to `authenticated` status.

**REQ-DEVAUTH-007:** The system shall provide a bulk lifecycle authentication endpoint (`POST /api/devices/lifecycle/bulk-auth`) enabling concurrent authentication initiation across multiple devices in a single operation.

**REQ-DEVAUTH-008:** The system shall update a device's online/offline connectivity status in real time based on presence events received via the MQTT broker.

**REQ-DEVAUTH-009:** The system shall expose a connectivity check endpoint (`GET /api/devices/:id/connectivity`) returning the device's current online status and the timestamp of its last observed presence.

**REQ-DEVAUTH-010:** The system shall expose a TID lifecycle status endpoint (`GET /api/devices/:id/tid-status`) returning the device's current lifecycle state as reported by the SandGrain CyberRock API.

**REQ-DEVAUTH-011:** The system shall provide an endpoint (`PUT /api/devices/:id/lifecycle`) enabling authorised operators to update a device's lifecycle state within the SandGrain CyberRock service, with optional transfer to a specified IoT user.

**REQ-DEVAUTH-012:** The system shall record a `claim_token_id` on the device record upon successful authentication, as returned by the SandGrain CyberRock API.

**REQ-DEVAUTH-013:** The system shall track the number of failed authentication attempts per device and shall enforce a configurable maximum (derived from the device's assigned profile) before ceasing further attempts.

**REQ-DEVAUTH-014:** The system shall retrieve and display the complete history of authentication and process logs for any given device.

**REQ-DEVAUTH-015:** The system shall provide a Device Hierarchy view within the user interface, enabling authorised users to visualise the structural relationships between devices, device groups, and tenants. This view is governed by the `device_hierarchy:retrieve` permission and is not exposed to Super Administrator users.

---

### 3.7 Device Group Management Module

**REQ-DEVGRP-001:** The system shall allow authorised users to create Device Groups, each representing a logical set of devices sharing a common set of broker authentication credentials.

**REQ-DEVGRP-002:** Each Device Group shall store a group identifier (username) and a password, which hardware gateways use to authenticate with the MQTT broker.

**REQ-DEVGRP-003:** The system shall allow authorised users to list, retrieve, update, and delete device groups.

**REQ-DEVGRP-004:** The system shall scope device group access to the tenant identifiers of the authenticated user's organisation.

**REQ-DEVGRP-005:** The system shall implement soft deletion for device group records.

---

### 3.8 Device Profile Module

**REQ-PROF-001:** The system shall allow authorised users to define Device Profiles that specify the default operational parameters applied to devices assigned to that profile.

**REQ-PROF-002:** Each Device Profile shall store the following configurable parameters: MQTT server address, MQTT username, MQTT password, Quality of Service (QoS) level, TLS version, claim type, authentication frequency (in seconds), and maximum failed authentication attempts.

**REQ-PROF-003:** The system shall support designation of a single profile as the default profile for an organisation.

**REQ-PROF-004:** Device Profiles shall support association with master data categories, sub-categories, and tags for classification and filtering.

**REQ-PROF-005:** The system shall allow authorised users to define reusable Profile Default Parameter templates that can be linked to device profiles.

**REQ-PROF-006:** The system shall allow authorised users to list, retrieve, update, and delete device profiles and profile parameter templates.

---

### 3.9 Hardware Bridge — SandGrain SDK Integration

**REQ-HW-001:** The system shall implement, or integrate with, the SandGrain Cloud SDK to execute the server-side cryptographic authentication protocol against the SandGrain CyberRock REST API.

**REQ-HW-002:** The system shall support the **Token-Computes-RW** authentication flow, wherein: (a) the server requests a Challenge Word (CW) from the CyberRock API; (b) the CW is transmitted to the device gateway via MQTT; (c) the hardware token IC computes a Response Word (RW) and returns it via MQTT; (d) the server submits the RW to the CyberRock API for verification.

**REQ-HW-003:** The system shall support the **Cloud-Computes-RW** authentication flow, wherein the server requests CW generation and RW computation entirely from the CyberRock API, simplifying the embedded-side protocol.

**REQ-HW-004:** The system shall validate the integrity of all cryptographic data fields (TID, CW, RW, Transaction ID) using CRC-16/CCITT-FALSE checksums as specified in the SandGrain protocol.

**REQ-HW-005:** The system shall support a factory pre-computed offline authentication mode, wherein Challenge Word and Response Word values are pre-loaded into the device record (via bulk import) for use in environments without continuous cloud connectivity.

**REQ-HW-006:** The system shall cache authentication tokens obtained from the SandGrain CyberRock API with a configurable expiry buffer (minimum 30 seconds before expiry), refreshing them automatically to avoid authentication interruptions.

**REQ-HW-007:** The system shall store, per tenant organisation, the SandGrain Tenant API credentials required to authenticate against the CyberRock service, and shall never transmit these credentials over the MQTT channel.

**REQ-HW-008:** The system shall support optional Cloudflare Access header injection (`CF-Access-Client-Id`, `CF-Access-Client-Secret`) for all outbound calls to the SandGrain CyberRock API.

---

### 3.10 MQTT Integration Module

**REQ-MQTT-001:** The system shall maintain a persistent connection to a configured MQTT broker upon application startup.

**REQ-MQTT-002:** The system shall subscribe to the topic pattern `sandgrain/v1/+/status` to receive device presence events (online/offline) from all registered gateways.

**REQ-MQTT-003:** The system shall subscribe to the topic pattern `sandgrain/v1/+/gw_log` to receive step-by-step authentication progress logs published by the hardware gateway.

**REQ-MQTT-004:** The system shall subscribe to the topic pattern `sandgrain/v1/+/auth_result` to receive terminal authentication result notifications.

**REQ-MQTT-005:** Upon receipt of a presence event, the system shall update the corresponding device record's online status and `last_seen_at` timestamp in the database.

**REQ-MQTT-006:** Upon receipt of a gateway log message, the system shall parse the step, status, message, and attempt fields and persist a corresponding `DeviceLog` entry to the database.

**REQ-MQTT-007:** Upon receipt of an authentication result event, the system shall trigger the appropriate device status transition (approved or rejected) and log the terminal event.

**REQ-MQTT-008:** The MQTT message format shall be JSON, with an envelope structure containing `type`, `payload`, and `crc` fields as specified in the SandGrain protocol.

---

### 3.11 Tenant API Integration Module

**REQ-TAPI-001:** The system shall provide endpoints for authorised administrators to configure, retrieve (masked), and update the SandGrain Tenant API credentials for their organisation.

**REQ-TAPI-002:** The system shall provide an endpoint to verify whether SandGrain Tenant API credentials have been configured for an organisation (`GET /api/tenant-api/credentials/status`).

**REQ-TAPI-003:** The system shall provide a credential-guarded proxy to the SandGrain Tenant API login endpoint, enabling authenticated users to obtain a tenant-scoped access token.

**REQ-TAPI-004:** The system shall provide proxy endpoints to list and create IoT device credentials within the SandGrain Tenant API on behalf of the authenticated organisation.

**REQ-TAPI-005:** The system shall provide a heartbeat/health check endpoint that validates the reachability and authentication status of the configured SandGrain Tenant API connection.

---

### 3.12 Audit & System Activity Module

**REQ-AUDIT-001:** The system shall record a System Activity entry for every significant data mutation event within the platform, including but not limited to: device creation, device approval, device rejection, device authentication, device group credential changes, and user role assignments.

**REQ-AUDIT-002:** Each System Activity record shall capture: a unique activity identifier, activity type, entity type (device, device_group, user), entity identifier, device identifier (where applicable), device group identifier (where applicable), a human-readable title and description, a severity level (info, success, warning, error), an icon identifier, structured metadata (JSON), and a creation timestamp.

**REQ-AUDIT-003:** The system shall provide a paginated endpoint to retrieve all system activities.

**REQ-AUDIT-004:** The system shall provide a dedicated endpoint to retrieve recent system activities.

**REQ-AUDIT-005:** The system shall provide endpoints to retrieve system activities filtered by entity type, by device identifier, and by device group identifier.

**REQ-AUDIT-006:** Audit records shall be immutable once written; the system shall not support modification or deletion of system activity entries.

---

### 3.13 Dashboard & Analytics Module

**REQ-DASH-001:** The system shall provide a dashboard statistics endpoint returning aggregated counts of devices by status.

**REQ-DASH-002:** The system shall provide a device status distribution chart endpoint returning data suitable for graphical representation.

**REQ-DASH-003:** The system shall provide an authentication trend chart endpoint returning time-series data of authentication events.

**REQ-DASH-004:** The system shall provide an endpoint returning the most recently registered or updated devices.

**REQ-DASH-005:** The system shall provide Super Administrator-specific dashboard endpoints returning platform-wide statistics and recently created organisations.

---

### 3.14 Master Data Module

**REQ-MSTR-001:** The system shall maintain a managed set of master data entities — Categories, Sub-Categories, and Tags — that may be used to classify and filter device profiles.

**REQ-MSTR-002:** The system shall provide full create, read, update, and soft-delete lifecycle management for all master data entity types.

---

### 3.15 User Interface Module

**REQ-UI-001:** The system shall provide a web-based user interface, accessible via a modern browser, implementing all user-facing operations defined in this specification.

**REQ-UI-002:** The system shall enforce authentication at the UI layer, redirecting unauthenticated users to the login screen for any protected route.

**REQ-UI-003:** The system shall suppress navigation links and UI controls for which the authenticated user does not possess the required permissions, providing a permission-consistent interface without relying solely on API-level guards.

**REQ-UI-004:** The system shall provide four distinct device management views, each filtering the global device registry by status: Device Enrolment (idle), Authenticated Devices (claimed), Active Devices (authenticated + active), and Inactive Devices (authenticated + inactive).

**REQ-UI-005:** The system shall display real-time device connectivity status by polling the backend connectivity endpoint at a maximum interval of 10 seconds per device.

**REQ-UI-006:** The system shall display live device process logs (authentication, firmware verification, installation) with an automatic refresh interval not exceeding 2 seconds during active processes.

**REQ-UI-007:** The system shall provide device-level action controls for triggering authentication, firmware verification, and installation processes, with support for selecting the authentication verification mode.

**REQ-UI-008:** The system shall provide a bulk import interface accepting CSV, XLSX, and JSON files for device registration.

**REQ-UI-009:** The system shall provide export controls enabling download of device and user data in XLSX, CSV, and JSON formats.

**REQ-UI-010:** The system shall present a modal notification to Organisation Administrator users on every login session in which SandGrain Tenant API credentials remain unconfigured, directing them to the settings interface. The notification shall not be shown to Super Administrator users, who have no associated organisation unit.

**REQ-UI-011:** The system shall present a Super Administrator–specific dashboard distinct from the Organisation Administrator dashboard, providing platform-wide metrics.

**REQ-UI-012:** The system shall render authentication trend and device status distribution data as interactive charts.

**REQ-UI-013:** The system shall implement all modal state management via URL search parameters, ensuring that modal context is preserved through browser navigation and can be linked directly.

**REQ-UI-014:** The system shall reserve dedicated navigation routes and permission-gated access points for an Authentication Events log (`/auth-events`), a Communication Events log (`/comm-events`), and a System Settings interface (`/settings`). The functional implementation of these views is scoped to a subsequent release iteration.

---

## 4. Non-Functional Requirements

### 4.1 Security

**REQ-SEC-001:** All passwords stored in the system database shall be hashed using the bcrypt algorithm. Plaintext passwords shall never be persisted or logged.

**REQ-SEC-002:** All JWT signing secrets shall be sourced from environment variables and shall not be hardcoded in any source artefact.

**REQ-SEC-003:** All password reset and invitation tokens shall be generated using a cryptographically secure random byte generator (a minimum of 128 bits of entropy), and shall be stored with an associated expiration timestamp.

**REQ-SEC-004:** Password reset tokens shall expire within 1 hour of issuance. User invitation tokens shall expire within 7 days of issuance.

**REQ-SEC-005:** All API request body payloads shall be validated against strict Data Transfer Object (DTO) schemas. Any fields not declared in the target DTO shall be stripped from the request before processing (whitelist validation). Requests containing undeclared fields shall be rejected.

**REQ-SEC-006:** All outbound communications between TrustBridge and the SandGrain CyberRock API shall be secured using HTTPS (TLS 1.2 or higher).

**REQ-SEC-007:** Device group passwords, used by hardware gateways to authenticate with the MQTT broker, shall be stored in hashed form and shall not be returned in plaintext via any API response.

**REQ-SEC-008:** Sensitive credentials stored for SandGrain Tenant API integration (usernames, passwords, API keys) shall be masked in all API responses, revealing only sufficient characters to confirm the stored value.

**REQ-SEC-009:** MQTT device credential provisioning shall occur only over authenticated channels. The public `credentials-by-tid` endpoint shall return only the minimum credential data required for device operation, and shall be rate-considered in deployment.

**REQ-SEC-010:** CORS policy shall be configured for the API server. In production deployments, permitted origins shall be explicitly enumerated rather than using a wildcard configuration.

**REQ-SEC-011:** Token version validation shall be performed on every authenticated API request, ensuring that login from a new session immediately invalidates all prior sessions for that user.

**REQ-SEC-012:** The system shall enforce account lockout as defined in REQ-AUTH-005 and shall not disclose whether the lockout is due to account status or temporary lockout in client-facing error messages.

---

### 4.2 Performance

**REQ-PERF-001:** The API server shall return responses for standard data retrieval operations (list, get by ID, dashboard stats) within 500 milliseconds under normal load, measured at the server boundary.

**REQ-PERF-002:** Device process log polling (2-second interval) shall not cause perceptible degradation in the responsiveness of other concurrent API operations.

**REQ-PERF-003:** Bulk device import processing shall support import files of up to 1,000 device records without timeout within the default server request timeout window.

**REQ-PERF-004:** MQTT message processing (presence events, gateway logs, auth results) shall be handled asynchronously and shall not block the main API request-handling loop.

**REQ-PERF-005:** Email transmission (invitation emails, password reset emails) shall be performed asynchronously and shall not block or delay the API response to the triggering operation.

**REQ-PERF-006:** The frontend application shall implement a React Query stale time of 30 seconds, minimising redundant network requests for stable data.

---

### 4.3 Scalability

**REQ-SCALE-001:** The data model shall support an unbounded number of organisations and tenant associations, subject only to database capacity constraints.

**REQ-SCALE-002:** The device registry shall support pagination for all list endpoints, ensuring consistent response times regardless of total device count.

**REQ-SCALE-003:** The MQTT subscription model shall support concurrent presence events from a large fleet of simultaneously connected gateways without message loss at the application layer.

**REQ-SCALE-004:** The multi-tenant data isolation model shall be implemented such that adding additional organisations does not require schema changes or data migration.

**REQ-SCALE-005:** The application shall be deployable as a stateless service behind a load balancer, with all persistent state maintained exclusively in the database and MQTT broker.

---

### 4.4 Reliability & Availability

**REQ-REL-001:** All database write operations for device logs, system activities, and device status transitions shall use atomic transactions to prevent partial state corruption in the event of a process failure.

**REQ-REL-002:** The MQTT client shall implement automatic reconnection logic to re-establish the broker connection following a network interruption, without requiring an application restart.

**REQ-REL-003:** Failures in non-critical asynchronous operations (email dispatch, external API calls) shall be logged to the server console and shall not cause the primary operation (user creation, device registration) to fail.

**REQ-REL-004:** Soft deletion shall be used for all primary entities (users, devices, groups, profiles, organisations, tenants), ensuring that accidental deletion operations are recoverable.

---

### 4.5 Maintainability

**REQ-MAINT-001:** The backend shall be implemented as a modular NestJS application, with each business domain (Auth, User, Device, Mqtt, etc.) encapsulated within a distinct NestJS module.

**REQ-MAINT-002:** Database schema changes shall be managed through a version-controlled migration system.

**REQ-MAINT-003:** All API endpoints shall be documented via OpenAPI (Swagger) annotations, and an interactive API documentation interface shall be available at a designated endpoint in non-production environments.

**REQ-MAINT-004:** All outbound API integrations to third-party services (SandGrain CyberRock, SMTP providers) shall be configurable exclusively via environment variables, with no integration endpoint URLs hardcoded in business logic.

---

## 5. System Environment

### 5.1 Backend Technical Stack

| Component | Technology | Version |
|---|---|---|
| Runtime | Node.js | 18.x LTS or higher |
| Framework | NestJS | 10.x |
| Language | TypeScript | 5.1.x |
| ORM | TypeORM | 0.3.x |
| Database Driver | mysql2 | 3.6.x |
| Authentication | Passport.js + passport-jwt | 0.7.x / 4.0.x |
| JWT Library | @nestjs/jwt | 10.2.x |
| Password Hashing | bcrypt | 5.1.x |
| HTTP Client | axios | 1.x |
| MQTT Client | mqtt | 5.x |
| Email | Nodemailer | 7.x |
| Data Validation | class-validator / class-transformer | 0.14.x / 0.5.x |
| Excel Processing | ExcelJS | 4.4.x |
| API Documentation | @nestjs/swagger | 7.x |
| Process Manager | Node.js native / PM2 (recommended) | — |

### 5.2 Frontend Technical Stack

| Component | Technology | Version |
|---|---|---|
| Framework | React | 19.x |
| Build Tool | Vite | 7.x |
| Language | TypeScript | 5.9.x |
| Routing | React Router | 7.x |
| Server-State Management | TanStack Query (React Query) | 5.x |
| HTTP Client | Axios | 1.x |
| UI Component Library | Chakra UI | 2.x |
| Animation | Framer Motion | 12.x |
| Form Management | react-hook-form | 7.x |
| Form Validation | Yup | 1.x |
| Data Tables | TanStack Table | 8.x |
| Charting | Chart.js + react-chartjs-2 | 4.x / 5.x |
| Date Utilities | date-fns | 4.x |
| Token Storage | js-cookie | 3.x |

### 5.3 SandGrain SDK Layer

| Component | Technology | Version |
|---|---|---|
| Runtime | Python | 3.10+ |
| HTTP Client | aiohttp | 3.9.x |
| MQTT Client | paho-mqtt | 2.0.x |
| Embedded Firmware SDK | C (platform-portable) | — |
| Token IC Interface | SPI / USB-to-Serial (FTDI) | — |
| Message Integrity | CRC-16/CCITT-FALSE | — |

### 5.4 Infrastructure Dependencies

| Service | Technology | Notes |
|---|---|---|
| Relational Database | MySQL | 5.7 or higher required |
| Message Broker | MQTT Broker (Mosquitto / EMQX) | 1.x protocol; port 1883 default |
| SMTP Relay | Any SMTP-compatible service | Gmail, SendGrid, etc. |
| External Authentication API | SandGrain CyberRock Tenant API | HTTPS; base URL configurable |

### 5.5 Hardware Requirements

| Component | Requirement |
|---|---|
| Hardware Security Token | SandGrain Token IC — contains private cryptographic key material; interfaces via SPI |
| Gateway Device | An edge computing device (Linux-capable) running the SandGrain Device SDK firmware |
| Token Interface | USB-to-Serial (FTDI) adapter connecting the token IC to the gateway host |
| Gateway Network | TCP/IP connectivity to the MQTT broker and (optionally) the TrustBridge API |
| Token Identifier | Each token must carry a factory-provisioned 256-bit Token ID (TID) |

### 5.6 Required Environment Variables

The following environment variables shall be configured for each deployment environment:

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` | Database connection parameters |
| `PORT` | HTTP server port |
| `JWT_SECRET` | JWT signing secret (minimum 256-bit entropy recommended) |
| `MQTT_HOST`, `MQTT_PORT` | MQTT broker connection parameters |
| `SMTP_HOST`, `SMTP_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | SMTP relay configuration |
| `FRONTEND_URL` | Public URL of the frontend application (used in email links) |
| `TENANT_API_BASE_URL` | Base URL of the SandGrain CyberRock Tenant API |
| `SEED_SUPERADMIN_PASSWORD` | Initial seed password for the Super Administrator account |

---

## 6. Data Integrity Principles

The following principles reflect SandGrain BV's commitment to data integrity and shall govern all data management decisions within the TrustBridge platform.

**DI-001 — Immutable Audit Trail:** System activity records are write-once. Once a device authentication step, status transition, or administrative action has been logged, that record shall not be modified or deleted by any application-level operation.

**DI-002 — Soft Deletion as Default:** All primary business entities (users, devices, groups, profiles, organisations, tenants) shall be deactivated via soft deletion rather than physical removal from the database, ensuring historical data is preserved for audit and forensic purposes.

**DI-003 — Token ID Uniqueness:** The Token ID (TID) serves as the authoritative physical identity of a hardware token. The system shall treat the TID as the canonical immutable identifier for all cross-system reconciliation with the SandGrain CyberRock service.

**DI-004 — Cryptographic Integrity Verification:** All data payloads originating from the hardware gateway layer shall be validated for integrity using the CRC-16/CCITT-FALSE checksum mechanism defined in the SandGrain protocol specification before being committed to persistent storage.

**DI-005 — Transactional State Transitions:** All device status transitions (idle → inprogress → claimed → approved → authenticated / rejected) shall be performed within database transactions, ensuring that the device record and its corresponding log entries are always in a consistent state.

**DI-006 — No Credential Plaintext Persistence:** Private cryptographic material (passwords, API secrets, hashed credentials) shall never appear in application logs, API response bodies, or any persistent storage layer in unprotected form.

---

## 7. Glossary

| Term | Definition |
|---|---|
| **TID** | Token ID — the factory-provisioned 256-bit unique identifier for a SandGrain hardware token IC. |
| **CW** | Challenge Word — a 256-bit cryptographic challenge issued by the SandGrain CyberRock API. |
| **RW** | Response Word — a 128-bit cryptographic response computed by the hardware token IC or the CyberRock cloud, depending on the authentication flow. |
| **CyberRock API** | The SandGrain cloud-hosted REST API service that orchestrates token authentication and lifecycle management. |
| **Gateway** | An edge computing device running the SandGrain Device SDK, hosting a hardware token IC and communicating with TrustBridge via MQTT. |
| **MQTT** | Message Queuing Telemetry Transport — a lightweight publish/subscribe messaging protocol used for real-time communication between gateways and TrustBridge. |
| **JWT** | JSON Web Token — a signed, self-describing token used as the bearer credential for all authenticated API requests. |
| **RBAC** | Role-Based Access Control — the access control model wherein a user's permissions are determined by their assigned role. |
| **PBAC** | Permission-Based Access Control — a granular access control layer wherein each role carries a discrete list of module:action permission keys. |
| **OU** | Organisation Unit — the top-level multi-tenant organisational container within TrustBridge. |
| **Soft Delete** | A deletion pattern wherein a record is marked with a `deleted_at` timestamp rather than being physically removed from the database. |
| **QoS** | Quality of Service — the MQTT delivery guarantee level for message transmission (0: at most once, 1: at least once, 2: exactly once). |
| **TLS** | Transport Layer Security — the cryptographic protocol governing secure communications over the network. |
| **bcrypt** | A password-hashing function designed for slow, computationally expensive hashing to resist brute-force attacks. |
| **CRC-16** | Cyclic Redundancy Check (16-bit) — a checksum algorithm used to detect accidental data corruption in transmitted payloads. |
| **Claim Token ID** | The token identifier issued by CyberRock upon successful device authentication, confirming device ownership. |
| **SMTP** | Simple Mail Transfer Protocol — the protocol used to deliver transactional email (invitations, password resets). |

---

*End of Document — TB-REQ-001 Rev 1.2*
