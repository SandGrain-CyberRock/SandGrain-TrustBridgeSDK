export const SWAGGER_CONSTANT = {
    TITLE: "TrustBridge API",
    DESCRIPTION: `## TrustBridge Backend API

    ### Overview
    TrustBridge is a Role-Based Access Control (RBAC) system with multi-tenant organization support.
    
    ### Authentication
    All protected endpoints require a valid JWT token in the Authorization header:
    \`\`\`
    Authorization: Bearer <your-jwt-token>
    \`\`\`
    
    ### Role Hierarchy
    | Role | Scope | Capabilities |
    |------|-------|--------------|
    | **TRUST_ADMIN** | System-wide | Full access to all resources. Manages organization, users, roles, and permissions. |
    | **ADMINISTRATOR** | Organization | Can manage users and assign roles within the organization. |
    | **OPERATOR** | Organization | Basic operational access (device management). |
    
    ### Default Credentials (Development)
    | Username | Password | Role |
    |----------|----------|------|
    | TrustAdmin | TrustAdmin | Trust Admin |
    
    ### Response Format
    All API responses follow a consistent format:
    \`\`\`json
    {
      "data": { ... },
      "message": "Success message"
    }
    \`\`\`
    `,
    VERSION: "1.0.0",
    CONTACT: "TrustBridge Team",
    CONTACT_EMAIL: "support@trustbridge.com",
    DOCS_PATH: "docs",
    SITE_TITLE: "TrustBridge API Documentation",
    BEARER_AUTH: {
        type: "http" as const,
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "Authorization",
        description: "Enter your JWT token",
        in: "header" as const,
    },
    BEARER_AUTH_NAME: "JWT-auth",
    OPTIONS: {
        persistAuthorization: true,
        docExpansion: "none" as const,
        filter: true,
        showRequestDuration: true,
    },
};

export const SWAGGER_TAG = {
    AUTH: {
        name: "Auth",
        description:
            "Authentication & Authorization - Login, password management, and profile endpoints",
    },
    ORGANIZATIONS: {
        name: "Organizations",
        description:
            "Organization Management - CRUD operations for organizations (Super Admin only for CUD)",
    },
    USERS: {
        name: "Users",
        description: "User Management - CRUD operations for users, role assignments",
    },
    ROLES: {
        name: "Roles",
        description:
            "Role Management - CRUD operations for roles and permission assignments",
    },
    PERMISSIONS: {
        name: "Permissions",
        description:
            "Permission Management - CRUD operations for permissions (Super Admin only)",
    },
    TENANT_API: {
        name: "Tenant API",
        description:
            "Tenant API Integration - Proxy endpoints to authenticate and interact with the external tenant API",
    },
    DEVICES: {
        name: "Devices",
        description:
            "Device Registration - CRUD operations for IoT device registration and status management",
    },
    DEVICE_GROUPS: {
        name: "Device Groups",
        description:
            "Device Group Management - Manage device groups with group credentials for device authentication",
    },
    DEVICE_PROFILES: {
        name: "Device Profiles",
        description: "Device Profile Management - Configure device profiles and parameters",
    },
    PROFILE_DEFAULT_PARAMS: {
        name: "Profile Default Params",
        description: "Profile Default Parameters - Default parameter values for device profiles",
    },
    DISCOVER: {
        name: "Discover",
        description: "Device Discovery - Endpoints for discovering and onboarding devices",
    },
    DASHBOARD: {
        name: "Dashboard",
        description: "Dashboard - Aggregated metrics and summary data",
    },
    SYSTEM_ACTIVITY: {
        name: "System Activity",
        description: "System Activity - Audit logs and system activity records",
    },
    MASTER_DATA_CATEGORIES: {
        name: "Master Data - Categories",
        description: "Master Data - Category lookup and management",
    },
    MASTER_DATA_SUB_CATEGORIES: {
        name: "Master Data - Sub-Categories",
        description: "Master Data - Sub-category lookup and management",
    },
    MASTER_DATA_TAGS: {
        name: "Master Data - Tags",
        description: "Master Data - Tag lookup and management",
    },
} as const;

export const SWAGGER_TAGS = Object.values(SWAGGER_TAG);