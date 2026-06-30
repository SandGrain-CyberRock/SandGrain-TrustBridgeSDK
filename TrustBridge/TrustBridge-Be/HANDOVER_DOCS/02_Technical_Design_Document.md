# Technical Design Document — Full Platform

**Project:** TrustBridge
**Document Reference:** TB-TDD-002
**Revision:** 1.0
**Status:** Approved
**Prepared for:** SandGrain BV
**Classification:** Confidential

---

## Document Control

| Field | Value |
|---|---|
| Project Name | TrustBridge |
| Document Type | Technical Design Document — Full Platform |
| Intended Audience | SandGrain BV — Engineering |
| Related Documents | TB-REQ-001 (Requirements Specification), TB-FDD-001 (Functional Design Document), TB-TDD-001 (Cloud SDK Architecture) |
| Scope | End-to-end platform architecture: backend, frontend, database, authentication, MQTT, and integration layers |

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Backend Architecture](#2-backend-architecture)
   - 2.1 Runtime & Framework
   - 2.2 Module Structure
   - 2.3 Application Bootstrap
   - 2.4 Request Processing Pipeline
   - 2.5 Global Configuration
3. [Frontend Architecture](#3-frontend-architecture)
   - 3.1 Runtime & Build Tooling
   - 3.2 Provider Stack
   - 3.3 Routing Architecture
   - 3.4 Layout System
   - 3.5 HTTP Client & Interceptors
   - 3.6 State Management
   - 3.7 Token Management
4. [Database Design](#4-database-design)
   - 4.1 Schema Overview
   - 4.2 Entity-Relationship Diagram
   - 4.3 Entity Definitions
   - 4.4 Junction Tables
   - 4.5 Cascade & Deletion Rules
   - 4.6 Schema Management Strategy
5. [Authentication & Authorisation Architecture](#5-authentication--authorisation-architecture)
   - 5.1 JWT Strategy
   - 5.2 Guard Pipeline
   - 5.3 Session Lifecycle
   - 5.4 Seeded Roles & Permissions
6. [API Design](#6-api-design)
   - 6.1 Response Envelope
   - 6.2 Validation Pipeline
   - 6.3 API Documentation
   - 6.4 Endpoint Inventory
7. [MQTT & Hardware Integration](#7-mqtt--hardware-integration)
   - 7.1 Broker Configuration
   - 7.2 Topic Subscriptions
   - 7.3 Request-Response Pattern
   - 7.4 Message Type Registry
8. [Email Service](#8-email-service)
9. [Export Engine](#9-export-engine)
10. [Observability & Audit](#10-observability--audit)
11. [Security Architecture](#11-security-architecture)
12. [Development & Build Pipeline](#12-development--build-pipeline)
    - 12.1 Backend
    - 12.2 Frontend
    - 12.3 Git Hooks & Commit Conventions
13. [Deployment Configuration](#13-deployment-configuration)

---

## 1. System Architecture Overview

TrustBridge is a three-tier platform comprising a React single-page application, a NestJS REST API backend, and a MySQL relational database, augmented by an MQTT message broker for real-time hardware device communication.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client Layer                                  │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │   React 19 SPA (Vite)                                        │   │
│   │   Chakra UI · React Query · React Router 7 · Axios           │   │
│   └──────────────────────┬───────────────────────────────────────┘   │
│                          │ HTTPS (REST)                              │
└──────────────────────────┼───────────────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────────────┐
│                     Application Layer                                │
│                          │                                           │
│   ┌──────────────────────▼───────────────────────────────────────┐   │
│   │   NestJS 10 Backend                                          │   │
│   │                                                              │   │
│   │   ┌────────────┐  ┌───────────┐  ┌────────────────────┐     │   │
│   │   │ AuthModule │  │UserModule │  │  DeviceModule       │     │   │
│   │   │ JwtGuard   │  │RoleModule │  │  DeviceAuthService  │     │   │
│   │   │ RolesGuard │  │PermModule │  │  MqttModule         │     │   │
│   │   │ PermsGuard │  │OrgModule  │  │  DeviceGroupModule  │     │   │
│   │   └────────────┘  └───────────┘  │  DeviceProfileModule│     │   │
│   │                                  └─────────┬────────────┘     │   │
│   │   ┌─────────────┐  ┌──────────────┐       │                 │   │
│   │   │TenantApiMod │  │DashboardMod  │       │                 │   │
│   │   │MasterDataMod│  │SysActivityMod│       │ MQTT            │   │
│   │   └─────────────┘  └──────────────┘       │                 │   │
│   └────────────┬──────────────────────────────┼──────────────────┘   │
│                │                              │                      │
└────────────────┼──────────────────────────────┼──────────────────────┘
                 │                              │
       ┌─────────▼─────────┐         ┌─────────▼──────────────┐
       │   MySQL Database   │         │  MQTT Broker            │
       │   (TypeORM)        │         │  (Mosquitto / EMQX)     │
       └───────────────────┘         └─────────┬──────────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  Cloud App (SDK-v3) │
                                    │  ───────────────    │
                                    │  SDKPool (4 slots)  │
                                    │  CyberRock Client   │
                                    │  TokenCache         │
                                    └──────────┬──────────┘
                                               │ HTTPS
                                    ┌──────────▼──────────┐
                                    │  SandGrain CyberRock│
                                    │  Tenant API         │
                                    └─────────────────────┘
```

**Component boundaries:**

| Component | Technology | Communication |
|---|---|---|
| Frontend SPA | React 19, Vite 7, TypeScript 5.9 | REST over HTTPS to backend |
| Backend API | NestJS 10, TypeScript 5.1, Express | REST (inbound), MQTT (outbound to broker), HTTPS (outbound to CyberRock) |
| Database | MySQL 5.7+, TypeORM 0.3 | TCP (mysql2 driver) |
| MQTT Broker | Mosquitto or EMQX | MQTT protocol, port 1883 |
| Cloud App | Python 3.10+, aiohttp, paho-mqtt | MQTT (inbound/outbound), HTTPS (outbound to CyberRock) |
| CyberRock API | SandGrain-hosted | HTTPS with Cloudflare Access headers |

---

## 2. Backend Architecture

### 2.1 Runtime & Framework

| Property | Value |
|---|---|
| Runtime | Node.js 18.x LTS |
| Framework | NestJS 10.x |
| Language | TypeScript 5.1 (target: ES2021, module: CommonJS) |
| HTTP Platform | Express (via `@nestjs/platform-express`) |
| ORM | TypeORM 0.3.x with `mysql2` driver |
| Build | `nest build` → `dist/` |

### 2.2 Module Structure

The application is composed of 14 NestJS modules, registered in `AppModule`:

```
AppModule
├── TypeOrmModule.forRoot(dbConfig)     ← Database connection
├── AuthModule                          ← Login, JWT, password flows
├── OrganizationModule                  ← Organisation & tenant CRUD
├── UserModule                          ← User CRUD, role assignment
├── RoleModule                          ← Role CRUD, permission assignment
├── PermissionModule                    ← Permission CRUD
├── TenantApiModule                     ← SandGrain credential management
├── DeviceModule                        ← Device registry + auth orchestration
│   └── imports: MqttModule             ← MQTT broker integration (nested)
├── DeviceGroupModule                   ← Device group CRUD
├── SystemActivityModule                ← Audit log service
├── DashboardModule                     ← Aggregation & analytics
├── MasterDataModule                    ← Categories, sub-categories, tags
├── ProfileDefaultParamModule           ← Profile parameter templates
└── DeviceProfileModule                 ← Device configuration profiles
```

**Architectural note:** `MqttModule` is not imported at the root level. It is imported by `DeviceModule` only, since MQTT communication is exclusively used by the device authentication orchestration layer.

### 2.3 Application Bootstrap

The `main.ts` bootstrap sequence:

1. Create NestJS application via `NestFactory.create(AppModule)`.
2. Enable CORS: `origin: true`, `credentials: true`, all methods and headers.
3. Apply global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
4. Apply global `ResponseInterceptor` (standardised envelope).
5. Set global API prefix: `/api`.
6. Configure Swagger at `/docs` (title: "TrustBridge API", version: "1.0.0", Bearer JWT auth).
7. Bind to port from `process.env.PORT` (default: 3000).

### 2.4 Request Processing Pipeline

Every inbound HTTP request flows through the following pipeline:

```
Inbound Request
  │
  ├── 1. CORS Check
  │
  ├── 2. Express Middleware
  │
  ├── 3. Global ValidationPipe
  │       ├── Whitelist: strip unknown fields
  │       ├── ForbidNonWhitelisted: reject if unknown fields present
  │       └── Transform: auto-type coercion
  │
  ├── 4. JwtAuthGuard (global APP_GUARD)
  │       ├── @Public() → skip
  │       └── Passport JWT → validate user, load roles/permissions/tenant_ids
  │
  ├── 5. RolesGuard (per-route, if @Roles() present)
  │       └── OR logic: user.roles ∩ requiredRoles ≠ ∅
  │
  ├── 6. PermissionsGuard (per-route, if @Permissions() present)
  │       └── AND logic: requiredPermissions ⊆ user.permissions
  │
  ├── 7. Controller Method
  │       └── @CurrentUser() decorator injects authenticated user
  │
  ├── 8. Service Layer (business logic)
  │
  ├── 9. ResponseInterceptor
  │       └── Wrap in { data, message } envelope
  │
  └── Response
```

### 2.5 Global Configuration

**Database:**

```typescript
{
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  autoLoadEntities: true,
  synchronize: true,   // Auto-migration — disable in production
}
```

**TypeScript:**
- Target: ES2021, Module: CommonJS
- `strictNullChecks: false`, `noImplicitAny: false` (relaxed strict mode)
- `emitDecoratorMetadata: true`, `experimentalDecorators: true` (required by NestJS/TypeORM)
- Incremental compilation enabled

---

## 3. Frontend Architecture

### 3.1 Runtime & Build Tooling

| Property | Value |
|---|---|
| Framework | React 19.x |
| Build Tool | Vite 7.x |
| Language | TypeScript 5.9 (strict mode enabled) |
| UI Library | Chakra UI 2.x + Emotion |
| Server State | TanStack React Query 5.x |
| Routing | React Router 7.x |
| Forms | react-hook-form 7.x + Yup 1.x |
| Tables | TanStack Table 8.x |
| Charts | Chart.js 4.x + react-chartjs-2 |
| HTTP | Axios 1.x |
| Token Storage | js-cookie 3.x |

**Vite config:** Minimal — `react()` plugin for Fast Refresh and `svgr()` for SVG-as-component support. No proxy config; API URL is set via `VITE_APP_ENDPOINT` environment variable.

### 3.2 Provider Stack

The application wraps all routes in a provider hierarchy (outermost to innermost):

```
<BrowserRouter>
  <ChakraProvider theme={theme} toastOptions={{ position: 'top-right', duration: 2000 }}>
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>
  </ChakraProvider>
</BrowserRouter>
```

**React Query defaults:**

| Setting | Value | Rationale |
|---|---|---|
| `staleTime` | 30 000 ms | Data is fresh for 30 seconds; reduces redundant fetches |
| `retry` | `false` | No automatic retries; errors surface immediately |
| `refetchOnWindowFocus` | `false` | Prevents disruptive refetches on tab switch |

### 3.3 Routing Architecture

**Route definition model:**

```typescript
interface Route {
  icon?: string;
  name?: string;
  route?: string;
  isVisible?: boolean;            // Show in sidebar
  element?: JSX.Element;
  children?: Route[];             // Nested submenu routes
  sectionHeading?: string;        // Sidebar section label
  permissions?: string[];         // Required permissions (all must match)
  hiddenForSuperAdmin?: boolean;  // Suppress for TRUST_ADMIN users
}
```

**Route table (4 sections):**

| Section | Route | Permission | Hidden for Super Admin |
|---|---|---|---|
| **Main** | `/` (Dashboard) | — | No |
| | `/organizations` | `org:retrieve` | No |
| | `/device-enrollment` | `device:retrieve` | Yes |
| | `/authenticated-devices` | `device:retrieve` | Yes |
| | `/active-devices` | `device:retrieve` | Yes |
| | `/inactive-devices` | `device:retrieve` | Yes |
| | `/device-hierarchy` | `device_hierarchy:retrieve` | Yes |
| **Master Data** | `/device-group` | `device-group:retrieve` | Yes |
| | `/device-profile` | `device-profile:retrieve` | Yes |
| | `/master-data/categories` | `master-data:retrieve` | Yes |
| | `/master-data/sub-categories` | `master-data:retrieve` | Yes |
| | `/master-data/tags` | `master-data:retrieve` | Yes |
| **Monitoring** | `/auth-events` | `auth_events:retrieve` | No |
| | `/comm-events` | `comm_events:retrieve` | No |
| | `/audit-logs` | — | Yes |
| **Administration** | `/users` | `user:retrieve` | No |
| | `/roles-and-permissions` | `role:retrieve` | No |
| | `/settings` | `setting:retrieve` | No |
| **Hidden** | `/profile` | — | No |

**Public routes (no auth):** `/login`, `/forgot-password`, `/reset-password`.

**Access filtering:** On render, routes are filtered by comparing the user's `permissions` array (from `/api/auth/me`) against each route's `permissions` field. Routes whose permissions are not fully satisfied are excluded from both the sidebar and the router.

### 3.4 Layout System

```
┌──────────────────────────────────────────┐
│              Navbar (58px, sticky)        │
├────────────┬─────────────────────────────┤
│  Sidebar   │       Content Area          │
│  80–280px  │       (scrollable)          │
│  collapsible│                            │
│  0.25s ease │                            │
└────────────┴─────────────────────────────┘
```

- **Sidebar** collapses to 80–100px on small viewports, expands to 280px. Controlled via `LayoutContext`.
- **Navbar** contains user avatar, notification icon, profile/logout dropdown.
- **Credential prompt modal**: If `initInfo.credentialsConfigured === false` and user has an `ou_id`, a modal prompts credential configuration on every authenticated session until resolved.

### 3.5 HTTP Client & Interceptors

**Axios instance** (`src/lib/Axios.ts`):

- Base URL: `import.meta.env.VITE_APP_ENDPOINT`
- Default header: `Content-Type: application/json`

**Request interceptor:**

| Header | Source | Purpose |
|---|---|---|
| `Authorization` | `Bearer {access_token}` from cookie | JWT authentication |
| `X-Time` | `moment().format()` | Request timestamp |
| `X-Timezone` | `Intl.DateTimeFormat().resolvedOptions().timeZone` | Client timezone |

**Response interceptor (401 handling):**

1. On 401 (not a login request, not already retried):
2. Read `refresh_token` from cookie.
3. If expired or missing → `TokenService.logout()` → redirect to `/login`.
4. Otherwise call refresh endpoint with a **plain Axios instance** (no interceptors, to avoid infinite retry loops).
5. On success: update `access_token` cookie, retry original request.
6. On failure: logout and redirect.

### 3.6 State Management

| Concern | Mechanism |
|---|---|
| Server state (API data) | React Query — `useQuery` / `useMutation` hooks per feature |
| Form state | react-hook-form with Yup schema validation |
| Modal state | URL search parameters (`?type=edit&id=123`) via `useModalSearchParams` hook |
| Layout state | `LayoutContext` (sidebar width, collapsed flag) |
| Auth state | Cookie-stored JWT, decoded client-side for expiry checks |
| Pagination/filters | URL search parameters |

**Modal URL parameter schema:**

| Param | Usage |
|---|---|
| `type` | Modal variant: `add`, `edit`, `view`, `delete`, etc. |
| `id` | Entity ID for edit/view operations |
| `deleteId` | Entity ID for delete confirmation |
| `start_date`, `end_date` | Date range filters |

### 3.7 Token Management

**Storage:** The `access_token` is stored as a browser cookie via `js-cookie`. The frontend also provisions a `refresh_token` cookie slot; however, the backend does not currently implement a token refresh endpoint. The Axios 401-retry interceptor references a refresh flow — in practice, an expired token results in a redirect to the login page.

**Expiry check:** JWT `exp` claim is decoded client-side (Base64 payload decode, no signature verification) and compared to `Date.now() / 1000`.

**Logout:** Removes both cookies, sets `localStorage.logout = Date.now()` (cross-tab detection), clears React Query cache, redirects to `/login`.

**Init flow:** On every authenticated page load, `useInitInfo()` calls `GET /api/auth/me`, which returns the full user context: `user_id`, `username`, `email`, `ou_id`, `org`, `roles[]`, `permissions[]`, `tenant_ids[]`, `credentialsConfigured`, `needsInitialization`, `mustChangePassword`.

---

## 4. Database Design

### 4.1 Schema Overview

The database uses MySQL 5.7+ with TypeORM 0.3 as the ORM layer. Schema synchronisation (`synchronize: true`) is enabled in development; production deployments use explicit migrations.

**Tables (16 total):**

| Table | Entity | Type |
|---|---|---|
| `tb_organization_unit` | OrganizationUnit | Primary |
| `cr_tenant` | Tenant | Primary |
| `cr_tenant_user_credential` | TenantUserCredential | Primary |
| `tb_user` | User | Primary |
| `roles` | Role | Primary |
| `permissions` | Permission | Primary |
| `tenant_user_roles` | UserRole | Junction (User ↔ Role) |
| `role_permissions` | RolePermission | Junction (Role ↔ Permission) |
| `tb_device` | Device | Primary |
| `tb_device_group` | DeviceGroup | Primary |
| `tb_device_log` | DeviceLog | Audit (append-only) |
| `tb_device_profile` | DeviceProfile | Primary |
| `tb_profile_default_param` | ProfileDefaultParam | Primary |
| `tb_system_activity` | SystemActivity | Audit (append-only) |
| `tb_category` | Category | Master Data |
| `tb_sub_category` | SubCategory | Master Data |
| `tb_tag` | Tag | Master Data |
| `tb_profile_tag` | — | Junction (DeviceProfile ↔ Tag) |

### 4.2 Entity-Relationship Diagram

```
tb_organization_unit (ou_id PK)
  │
  ├──< tb_user (ou_id FK, nullable)
  │      │
  │      └──< tenant_user_roles ──> roles
  │             (user_id, role_id)     │
  │                                    └──< role_permissions ──> permissions
  │                                          (role_id, permission_id)
  │
  ├──< cr_tenant (ou_id FK)
  │      │
  │      ├──< cr_tenant_user_credential (tenant_id FK)
  │      │
  │      ├──< tb_device (tenant_id FK, SET NULL on delete)
  │      │      │
  │      │      ├── tb_device_group (device_group_id FK)
  │      │      ├── tb_device_profile (profile_id FK, SET NULL on delete)
  │      │      └──< tb_device_log (device_id FK)
  │      │
  │      └──< tb_device_group (tenant_id FK)
  │
  ├──< tb_device_profile (ou_id FK)
  │      │
  │      ├── tb_category (category_id FK, CASCADE on delete)
  │      ├── tb_sub_category (sub_category_id FK, CASCADE on delete)
  │      ├──< tb_profile_tag ──> tb_tag
  │      └── tb_profile_default_param (profile_param_id FK, SET NULL on delete)
  │
  ├──< tb_category (ou_id)
  │      └──< tb_sub_category (category_id FK, CASCADE on delete)
  │
  └──< tb_tag (ou_id)

tb_system_activity
  ├── device_id FK → tb_device (nullable)
  └── device_group_id FK → tb_device_group (nullable)
```

### 4.3 Entity Definitions

*(Full field-level definitions are provided in TB-FDD-001 Section 2.2. This section documents the technical ORM implementation.)*

**Key implementation details:**

| Entity | Table | PK | PK Type | Unique Constraints | Soft Delete |
|---|---|---|---|---|---|
| OrganizationUnit | `tb_organization_unit` | `ou_id` | auto-int | — | Yes |
| User | `tb_user` | `user_id` | auto-int | `username`, `email` | Yes |
| Tenant | `cr_tenant` | `tenant_id` | string | — | Yes |
| TenantUserCredential | `cr_tenant_user_credential` | `id` | auto-int | — | No |
| Role | `roles` | `id` | auto-int | — | Yes |
| Permission | `permissions` | `id` | auto-int | — | Yes |
| Device | `tb_device` | `device_id` | auto-int | — | Yes |
| DeviceGroup | `tb_device_group` | `device_group_id` | auto-int | — | Yes |
| DeviceLog | `tb_device_log` | `log_id` | auto-int | — | No (immutable) |
| DeviceProfile | `tb_device_profile` | `profile_id` | auto-int | — | Yes |
| SystemActivity | `tb_system_activity` | `activity_id` | auto-int | — | No (immutable) |
| Category | `tb_category` | `category_id` | auto-int | — | Yes |
| SubCategory | `tb_sub_category` | `sub_category_id` | auto-int | — | Yes |
| Tag | `tb_tag` | `tag_id` | auto-int | — | Yes |

### 4.4 Junction Tables

| Junction Table | Column A | Column B | Cascade |
|---|---|---|---|
| `tenant_user_roles` | `user_id` → `tb_user` | `role_id` → `roles` | Both CASCADE on delete |
| `role_permissions` | `role_id` → `roles` | `permission_id` → `permissions` | Both CASCADE on delete |
| `tb_profile_tag` | `profile_id` → `tb_device_profile` | `tag_id` → `tb_tag` | Auto-managed by TypeORM `@JoinTable` |

### 4.5 Cascade & Deletion Rules

| FK Relationship | On Delete |
|---|---|
| Device → Tenant | SET NULL |
| Device → DeviceProfile | SET NULL |
| DeviceProfile → Category | CASCADE |
| DeviceProfile → SubCategory | CASCADE |
| DeviceProfile → ProfileDefaultParam | SET NULL |
| SubCategory → Category | CASCADE |
| UserRole → User | CASCADE |
| UserRole → Role | CASCADE |
| RolePermission → Role | CASCADE |
| RolePermission → Permission | CASCADE |

### 4.6 Schema Management Strategy

**Development:** `synchronize: true` in TypeORM config. Schema changes are auto-applied on application startup.

**Migration files (for reference):**

| Migration | Purpose |
|---|---|
| `20260204AddDeviceTenantFk` | Adds FK constraint `tb_device.tenant_id → cr_tenant.tenant_id` with `ON DELETE SET NULL` |
| `20260204AddUserNameCompanyTitle` | Adds `name` and `company_title` VARCHAR columns to `tb_user` |
| `20260225ModifyDeviceProfileColumn` | Adds `profile_id` INT FK column to `tb_device`, links to `tb_device_profile`, drops legacy `profile` VARCHAR column |

---

## 5. Authentication & Authorisation Architecture

### 5.1 JWT Strategy

**Passport JWT configuration:**

| Setting | Value |
|---|---|
| Extraction | `fromAuthHeaderAsBearerToken()` |
| Expiry | Enforced (`ignoreExpiration: false`) |
| Secret | `process.env.JWT_SECRET` |

**JWT payload:** `{ sub: user_id, username, email, ou_id, token_version }`

**Validation (`JwtStrategy.validate`):**

1. Fetch user by `payload.sub`.
2. Assert `user_status === 'ACTIVE'`.
3. Assert `acc_locked_until` is null or in the past.
4. Assert `token_version` in JWT matches DB value.
5. Load ACTIVE roles via `UserRole` → `Role`.
6. Load all permissions via `RolePermission` → `Permission`.
7. Resolve `tenant_ids` from `Tenant` table where `ou_id` matches.
8. Check `credentials_configured` on the user's tenant.
9. Attach enriched user to `request.user`.

**Enriched request user:**

```typescript
{
  user_id, username, email, ou_id, org,
  tenant_ids: string[],
  roles: string[],
  permissions: string[],
  credentialsConfigured: boolean,
  needsInitialization: boolean,
  mustChangePassword: boolean,
}
```

### 5.2 Guard Pipeline

| Guard | Registration | Logic |
|---|---|---|
| `JwtAuthGuard` | Global `APP_GUARD` | Validates JWT. Skipped on `@Public()` routes. |
| `RolesGuard` | Per-route via `@Roles()` | OR: user needs at least one of the declared roles. |
| `PermissionsGuard` | Per-route via `@Permissions()` | AND: user needs all declared permissions. |

### 5.3 Session Lifecycle

| Event | `token_version` incremented? | Sessions invalidated? |
|---|---|---|
| Successful login | Yes | All prior sessions for that user |
| Admin resets another user's password | Yes | All sessions for the target user |
| User changes own password | No | Current session remains valid |

### 5.4 Seeded Roles & Permissions

**Roles (3):**

| Name | Label | Permissions Count |
|---|---|---|
| `TRUST_ADMIN` | Trust Admin | 36 (all) |
| `ADMINISTRATOR` | Administrator | 24 |
| `OPERATOR` | Operator | 20 |

**Permission modules (9):** `org`, `role`, `permission`, `user`, `device`, `device-group`, `master-data`, `profile-param`, `device-profile`. Each module has `create`, `update`, `retrieve`, `delete` actions (plus `user:assign-role`).

**Default user:** `TrustAdmin` / `trustadmin@system.local` / `TRUST_ADMIN` role / `must_change_password: true`.

**Seeding is idempotent** (uses `INSERT IGNORE`) and runs manually via `npm run seed`.

---

## 6. API Design

### 6.1 Response Envelope

All API responses are wrapped by the global `ResponseInterceptor`:

```json
{
  "data": <payload>,
  "message": "Success"
}
```

Controllers may return pre-wrapped responses (the interceptor detects and passes through) or raw data (auto-wrapped). Error responses follow standard NestJS exception format:

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid credentials"
}
```

### 6.2 Validation Pipeline

**Global `ValidationPipe` settings:**

| Setting | Value | Effect |
|---|---|---|
| `whitelist` | `true` | Strips properties not declared in the DTO |
| `forbidNonWhitelisted` | `true` | Rejects requests containing undeclared properties |
| `transform` | `true` | Auto-converts types (string → number for path params) |

DTOs are validated using `class-validator` decorators. `class-transformer` handles type conversion.

### 6.3 API Documentation

Swagger UI is available at `/docs` in non-production environments. All endpoints are annotated with `@ApiTags`, `@ApiBearerAuth('JWT-auth')`, and response type decorators.

### 6.4 Endpoint Inventory

*(Full endpoint list is provided in TB-REQ-001 Section 3. The following summarises the module-to-prefix mapping.)*

| Module | Base Path | Public Endpoints |
|---|---|---|
| Auth | `/api/auth` | `POST /login`, `POST /forgot-password`, `POST /reset-password`, `POST /set-password`. Protected: `POST /initialize` (TRUST_ADMIN only) |
| Users | `/api/users` | — |
| Roles | `/api/roles` | — |
| Permissions | `/api/permissions` | — |
| Organizations | `/api/organizations` | — |
| Devices | `/api/devices` | `GET /credentials-by-tid`, `GET /whitelist` |
| Device Groups | `/api/device-groups` | — |
| Device Profiles | `/api/device-profiles` | — |
| Profile Params | `/api/profile-params` | — |
| Tenant API | `/api/tenant-api` | — |
| System Activity | `/api/system-activity` | — |
| Dashboard | `/api/dashboard` | — |
| Master Data | `/api/master-data/{categories,sub-categories,tags}` | — |

---

## 7. MQTT & Hardware Integration

### 7.1 Broker Configuration

```typescript
const host = process.env.MQTT_HOST || 'localhost';
const port = process.env.MQTT_PORT || '1883';
// Connection: mqtt://{host}:{port}
```

The `MqttService` connects on module initialisation and maintains a persistent connection.

### 7.2 Topic Subscriptions

| Topic Pattern | Purpose | Handler |
|---|---|---|
| `sandgrain/v1/+/status` | Device presence (online/offline) | `handlePresenceMessage()` |
| `sandgrain/v1/+/gw_log` | Gateway authentication progress logs | `handleGwLogMessage()` |
| `sandgrain/v1/+/auth_result` | Terminal auth result (fault injection path) | `handleAuthResultMessage()` |

The `+` wildcard matches any TID. TIDs are extracted from the topic and normalised to lowercase.

### 7.3 Request-Response Pattern

For all outbound MQTT communication (TrustBridge → Cloud App or Gateway), the service follows a **subscribe-first** pattern:

1. Subscribe to `sandgrain/v1/{tid}/rsp/{action}`.
2. Publish to `sandgrain/v1/{tid}/req/{action}`.
3. Wait for response on the subscribed topic (timeout: 60 seconds).
4. On response: resolve promise, unsubscribe.
5. On timeout: reject promise, unsubscribe.

### 7.4 Message Type Registry

| Type | Action | Target | Direction |
|---|---|---|---|
| 0 | `requestCW` | Cloud App | TB → Cloud App → CyberRock |
| 1 | `replyRW` | Cloud App | TB → Cloud App → CyberRock |
| 2 | `requestRW` | Cloud App | TB → Cloud App → CyberRock |
| 3 | `checkAuthStatusCloud` | Cloud App | TB → Cloud App (fire-and-forget) |
| 4 | `computeRW` | Gateway | TB → Gateway (device chip computes RW) |
| 5 | `computeFWVerification` | Gateway | TB → Gateway (FW hash + RW) |
| 6 | `computeInstallation` | Gateway | TB → Gateway (installation CW/RW) |

*(Full protocol details, including message envelopes, CRC validation, and the Cloud SDK architecture, are documented in TB-TDD-001.)*

---

## 8. Email Service

**Transport:** Nodemailer with SMTP (`smtp.gmail.com:587` default, STARTTLS).

**Templates (3):**

| Email | Trigger | Token Expiry | Content |
|---|---|---|---|
| Invitation | User creation | 7 days | HTML with gradient header, CTA button linking to `{FRONTEND_URL}/set-password?token={token}` |
| Password Reset | Forgot password | 1 hour | HTML with reset link and password best practices |
| Default Credentials | Admin password reset / system init | — | HTML showing username + temporary password with change-on-first-login warning |

**Dispatch pattern:** All emails are sent asynchronously. Errors are caught, logged, and return `false`. No email failure ever blocks or rolls back the triggering operation.

---

## 9. Export Engine

The backend supports data export in three formats via `ExcelJS`:

| Format | MIME Type | Method |
|---|---|---|
| XLSX | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | ExcelJS workbook with styled headers |
| CSV | `text/csv` | ExcelJS CSV serialisation |
| JSON | `application/json` | Direct array serialisation |

**Supported exports:** Users (`GET /api/users/export`) and Devices (`GET /api/devices/export`). Both respect tenant isolation via `ou_id` filtering.

---

## 10. Observability & Audit

### System Activity Service

Logs every significant business event to `tb_system_activity`. All logging is asynchronous and non-blocking.

**Logged event types:**

| Event Type | Trigger | Severity |
|---|---|---|
| `device_created` | Device registered | `info` |
| `device_auth_in_progress` | Auth workflow started | `info` |
| `device_authenticated` | AUTH_OK received | `success` |
| `device_approved` | Device moved to claimed | `success` |
| `device_failed` | Max retries exhausted | `error` |
| `device_rejected` | Device moved to rejected | `warning` |
| `device_deleted` | Device soft-deleted | `info` |
| `device_group_created` | Group registered | `info` |
| `device_group_password_changed` | Group password updated | `warning` |

**Generic CRUD logging:** `logCreated()`, `logUpdated()`, `logDeleted()` are used by User, Role, Permission, Category, SubCategory, and Tag services for standardised activity tracking.

### Dashboard Aggregations

| Metric | Query Logic |
|---|---|
| Device counts by status | `GROUP BY status WHERE tenant_id IN (tenant_ids)` |
| Active vs inactive | `WHERE status = 'authenticated' AND is_active = 1/0` |
| Auth success rate | `(success auth_result logs / total auth_result logs) * 100` |
| Authentication trend | `GROUP BY DATE(created_at) WHERE step = 'auth_result'`, last N days |
| Recent events | `WHERE created_at > NOW() - 24 HOURS` |

All dashboard queries respect multi-tenant isolation via `tenant_id IN (:...tenantIds)`.

---

## 11. Security Architecture

| Layer | Mechanism | Detail |
|---|---|---|
| **Password storage** | bcrypt | Default salt rounds |
| **Token signing** | JWT (HS256) | Secret from `JWT_SECRET` env var |
| **Token versioning** | `token_version` column | Incremented on login and admin password reset; all prior tokens invalidated |
| **Account lockout** | 5 attempts / 30 min | `failed_logins` counter, `acc_locked_until` timestamp |
| **Input validation** | `class-validator` + whitelist pipe | Rejects unknown fields; type-safe DTOs |
| **Sensitive field masking** | Service-layer stripping | `password_hash`, reset tokens, invitation tokens never returned in API responses |
| **Tenant isolation** | JWT → `tenant_ids` | Every query for tenant-scoped data includes `WHERE tenant_id IN (...)` |
| **CORS** | Origin: true, credentials: true | Restrict to explicit origins in production |
| **Cloudflare Access** | `CF-Access-Client-Id/Secret` headers | Injected on all outbound CyberRock API calls |
| **Soft deletion** | `@DeleteDateColumn()` | All primary entities; preserves audit trail |
| **Audit immutability** | No update/delete paths | `DeviceLog` and `SystemActivity` are append-only |

---

## 12. Development & Build Pipeline

### 12.1 Backend

| Command | Purpose |
|---|---|
| `npm run start:dev` | Watch mode with hot reload |
| `npm run build` | `nest build` → `dist/` |
| `npm run start:prod` | `node dist/main` |
| `npm run seed` | Idempotent database seed (roles, permissions, default user) |
| `npm run seed:clean` | Remove all seeded data |
| `npm run test` | Jest test suite |
| `npm run lint` | ESLint with auto-fix |

### 12.2 Frontend

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run preview` | Serve production build locally |
| `npm run lint` | ESLint with auto-fix |
| `npm run format` | Prettier formatting |

**Frontend TypeScript:** Strict mode enabled (`strict: true`, `noUnusedLocals`, `noUnusedParameters`).

**Frontend ESLint rules:**

| Rule | Value | Rationale |
|---|---|---|
| `no-console` | `error` | No console.log in production code |
| `react-hooks/exhaustive-deps` | `off` | Flexibility for custom hook patterns |
| `prettier/prettier` | `error` | Formatting enforced as lint errors |

### 12.3 Git Hooks & Commit Conventions

**Husky pre-commit hook (frontend):**

1. `lint-staged` — runs ESLint + Prettier on staged `.ts`/`.tsx` files.
2. `npm run build` — full TypeScript check + Vite bundle.

**Commit message convention:**

```
^(feat|fix|chore|docs|test|style|refactor|perf|build|ci|revert|merge|wip)(\(.+?\))?: .{1,}$
```

Max length: 120 characters. Enforced by Husky `commit-msg` hook.

**Prettier settings:**
- Single quotes, semicolons, trailing commas (all), 80-char line width, 2-space indent.

---

## 13. Deployment Configuration

### Required Environment Variables

| Variable | Layer | Purpose |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` | Backend | MySQL connection |
| `PORT` | Backend | HTTP server port (default: 3000) |
| `JWT_SECRET` | Backend | JWT signing secret |
| `MQTT_HOST`, `MQTT_PORT` | Backend | MQTT broker address |
| `SMTP_HOST`, `SMTP_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | Backend | Email relay |
| `FRONTEND_URL` | Backend | Used in email links |
| `TENANT_API_BASE_URL` | Backend | SandGrain CyberRock API base URL |
| `SEED_SUPERADMIN_PASSWORD` | Backend | Seed password for TrustAdmin user |
| `VITE_APP_ENDPOINT` | Frontend | Backend API URL for Axios |

### Infrastructure Dependencies

| Service | Minimum Version | Default Port |
|---|---|---|
| MySQL | 5.7 | 3306 |
| MQTT Broker (Mosquitto/EMQX) | Any with MQTT 3.1.1+ | 1883 |
| SMTP Relay | Any SMTP-compatible | 587 |
| Node.js | 18.x LTS | — |
| Python (Cloud App) | 3.10+ | — |

### Build Outputs

| Component | Build Command | Output Directory |
|---|---|---|
| Backend | `npm run build` | `dist/` |
| Frontend | `npm run build` | `dist/` |

---

*End of Document — TB-TDD-002 Rev 1.0*
