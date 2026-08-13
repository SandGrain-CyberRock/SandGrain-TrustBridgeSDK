import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { syslogLogger } from "./common/logger/syslog.logger";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { NestExpressApplication } from "@nestjs/platform-express";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: syslogLogger });
  app.useGlobalFilters(new AllExceptionsFilter());

  const corsOrigins = [
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()) : []),
    "http://localhost:5173",
  ];
  // Enable CORS
  app.enableCors({
    origin: [...new Set(corsOrigins)],
    credentials: true,
    methods: "*",
    allowedHeaders: "*",
  });
  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  // API prefix
  app.setGlobalPrefix("api");
  app.set('trust proxy', 1);


  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle("TrustBridge API")
    .setDescription(
      `## TrustBridge Backend API

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
    )
    .setVersion("1.0.0")
    .setContact("TrustBridge Team", "", "support@trustbridge.com")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "Authorization",
        description: "Enter your JWT token",
        in: "header",
      },
      "JWT-auth",
    )
    .addTag(
      "Auth",
      "Authentication & Authorization - Login, password management, and profile endpoints",
    )
    .addTag(
      "Organizations",
      "Organization Management - CRUD operations for organizations (Super Admin only for CUD)",
    )
    .addTag(
      "Users",
      "User Management - CRUD operations for users, role assignments",
    )
    .addTag(
      "Roles",
      "Role Management - CRUD operations for roles and permission assignments",
    )
    .addTag(
      "Permissions",
      "Permission Management - CRUD operations for permissions (Super Admin only)",
    )
    .addTag(
      "Tenant API",
      "Tenant API Integration - Proxy endpoints to authenticate and interact with the external tenant API",
    )
    .addTag(
      "Devices",
      "Device Registration - CRUD operations for IoT device registration and status management",
    )
    .addTag(
      "Device Groups",
      "Device Group Management - Manage device groups with group credentials for device authentication",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: "none",
      filter: true,
      showRequestDuration: true,
    },
    customSiteTitle: "TrustBridge API Documentation",
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  syslogLogger.log(`Application running on http://localhost:${port}/api`, 'Bootstrap');
  syslogLogger.log(`Swagger docs at http://localhost:${port}/docs`, 'Bootstrap');
}

bootstrap();
