import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// ============================================
// Base Response Classes
// ============================================

export class MessageResponseDto {
  @ApiProperty({ example: "Operation completed successfully" })
  message: string;
}

// ============================================
// Auth Response DTOs
// ============================================

export class UserBasicDto {
  @ApiProperty({ example: 1 })
  user_id: number;

  @ApiProperty({ example: "johndoe" })
  username: string;

  @ApiProperty({ example: "john@example.com" })
  email: string;

  @ApiPropertyOptional({ example: 1, nullable: true })
  ou_id: number | null;

  @ApiPropertyOptional({ example: "Acme Corp", nullable: true })
  org_name: string | null;
}

export class LoginDataDto {
  @ApiProperty({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." })
  access_token: string;

  @ApiProperty({ type: UserBasicDto })
  user: UserBasicDto;
}

export class LoginResponseDto {
  @ApiProperty({ type: LoginDataDto })
  data: LoginDataDto;

  @ApiProperty({ example: "User logged in successfully" })
  message: string;
}

export class ProfileDataDto {
  @ApiProperty({ example: 1 })
  user_id: number;

  @ApiProperty({ example: "johndoe" })
  username: string;

  @ApiProperty({ example: "john@example.com" })
  email: string;

  @ApiPropertyOptional({ example: 1, nullable: true })
  ou_id: number | null;

  @ApiPropertyOptional({ example: "Acme Corp", nullable: true })
  org_name: string | null;

  @ApiPropertyOptional({ example: "2024-01-15T10:30:00.000Z", nullable: true })
  last_login_at: Date | null;
}

export class ProfileResponseDto {
  @ApiProperty({ type: ProfileDataDto })
  data: ProfileDataDto;

  @ApiProperty({ example: "Profile retrieved successfully" })
  message: string;
}

export class CurrentUserDto {
  @ApiProperty({ example: 1 })
  user_id: number;

  @ApiProperty({ example: "johndoe" })
  username: string;

  @ApiProperty({ example: "john@example.com" })
  email: string;

  @ApiPropertyOptional({ example: 1, nullable: true })
  ou_id: number | null;

  @ApiPropertyOptional({
    example: { ou_id: 1, ou_name: "Acme Corp" },
    nullable: true,
  })
  org: object | null;

  @ApiProperty({ example: ["ADMINISTRATOR"], type: [String] })
  roles: string[];

  @ApiProperty({
    example: ["user:create", "user:retrieve", "user:update"],
    type: [String],
  })
  permissions: string[];
}

// ============================================
// Organization Response DTOs
// ============================================

export class OrganizationDto {
  @ApiProperty({ example: 1 })
  ou_id: number;

  @ApiProperty({ example: "Acme Corp" })
  ou_name: string;

  @ApiPropertyOptional({ example: "Technology company" })
  ou_description: string;

  @ApiProperty({ example: "ACTIVE", enum: ["ACTIVE", "INACTIVE"] })
  ou_status: string;

  @ApiPropertyOptional({
    description: "Tenants belonging to this organization",
    type: () => [TenantDto],
  })
  tenants?: TenantDto[];

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  created_at: Date;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  updated_at: Date;
}

export class OrganizationResponseDto {
  @ApiProperty({ type: OrganizationDto })
  data: OrganizationDto;

  @ApiProperty({ example: "Organization retrieved successfully" })
  message: string;
}

export class OrganizationListResponseDto {
  @ApiProperty({ type: [OrganizationDto] })
  data: OrganizationDto[];

  @ApiProperty({ example: "Organizations retrieved successfully" })
  message: string;
}

// ============================================
// User Response DTOs
// ============================================

export class RoleBasicDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: "ADMINISTRATOR" })
  name: string;

  @ApiProperty({ example: "Administrator" })
  label: string;
}

export class UserRoleDto {
  @ApiProperty({ example: 1 })
  user_id: number;

  @ApiProperty({ example: 1 })
  role_id: number;

  @ApiProperty({ type: RoleBasicDto })
  role: RoleBasicDto;
}

export class UserDto {
  @ApiProperty({ example: 1 })
  user_id: number;

  @ApiPropertyOptional({ example: 1, nullable: true })
  ou_id: number | null;

  @ApiPropertyOptional({ example: "John Doe", nullable: true })
  name: string | null;

  @ApiPropertyOptional({ example: "CTO", nullable: true })
  company_title: string | null;

  @ApiProperty({ example: "johndoe" })
  username: string;

  @ApiProperty({ example: "john@example.com" })
  email: string;

  @ApiProperty({ example: "ACTIVE", enum: ["ACTIVE", "INACTIVE"] })
  user_status: string;

  @ApiPropertyOptional({ example: "2024-01-15T10:30:00.000Z", nullable: true })
  last_login_at: Date | null;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  created_at: Date;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  updated_at: Date;

  @ApiPropertyOptional({ type: OrganizationDto })
  org?: OrganizationDto;

  @ApiPropertyOptional({ type: [UserRoleDto] })
  userRoles?: UserRoleDto[];
}

export class UserResponseDto {
  @ApiProperty({ type: UserDto })
  data: UserDto;

  @ApiProperty({ example: "User retrieved successfully" })
  message: string;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserDto] })
  data: UserDto[];

  @ApiProperty({ example: "Users retrieved successfully" })
  message: string;
}

// ============================================
// Role Response DTOs
// ============================================

export class RoleDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: "ADMINISTRATOR" })
  name: string;

  @ApiProperty({ example: "Administrator" })
  label: string;

  @ApiPropertyOptional({ example: "shield" })
  icon: string;

  @ApiPropertyOptional({ example: "#FF0000" })
  icon_color: string;

  @ApiPropertyOptional({
    example: "Organization administrator with user management capabilities",
  })
  description: string;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  created_at: Date;
}

export class RoleResponseDto {
  @ApiProperty({ type: RoleDto })
  data: RoleDto;

  @ApiProperty({ example: "Role retrieved successfully" })
  message: string;
}

export class RoleListResponseDto {
  @ApiProperty({ type: [RoleDto] })
  data: RoleDto[];

  @ApiProperty({ example: "Roles retrieved successfully" })
  message: string;
}

// ============================================
// Permission Response DTOs
// ============================================

export class PermissionDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: "user:create" })
  key: string;

  @ApiProperty({ example: "user" })
  module: string;

  @ApiProperty({ example: "create" })
  action: string;

  @ApiPropertyOptional({ example: "Create new users" })
  description: string;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  created_at: Date;
}

export class PermissionResponseDto {
  @ApiProperty({ type: PermissionDto })
  data: PermissionDto;

  @ApiProperty({ example: "Permission retrieved successfully" })
  message: string;
}

export class PermissionListResponseDto {
  @ApiProperty({ type: [PermissionDto] })
  data: PermissionDto[];

  @ApiProperty({ example: "Permissions retrieved successfully" })
  message: string;
}

export class ModuleListResponseDto {
  @ApiProperty({
    example: ["user", "role", "permission", "org", "device"],
    type: [String],
  })
  data: string[];

  @ApiProperty({ example: "Modules retrieved successfully" })
  message: string;
}

// ============================================
// Tenant Response DTOs
// ============================================

export class TenantDto {
  @ApiProperty({ example: "7c8d7ea7-882e-4427-ab93-c010ffc809db" })
  tenant_id: string;

  @ApiProperty({ example: 1 })
  ou_id: number;

  @ApiProperty({ example: "ACTIVE", enum: ["ACTIVE", "INACTIVE"] })
  tenant_status: string;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  created_at: Date;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  updated_at: Date;
}

export class TenantShortDto {
  @ApiProperty({ example: "7c8d7ea7-882e-4427-ab93-c010ffc809db" })
  tenant_id: string;

  @ApiPropertyOptional({ example: "ACTIVE" })
  tenant_status?: string;
}

export class TenantResponseDto {
  @ApiProperty({ type: TenantDto })
  data: TenantDto;

  @ApiProperty({ example: "Tenant added successfully" })
  message: string;
}

export class TenantListResponseDto {
  @ApiProperty({ type: [TenantDto] })
  data: TenantDto[];

  @ApiProperty({ example: "Tenants retrieved successfully" })
  message: string;
}

// ============================================
// Device Group Response DTOs
// ============================================

export class DeviceGroupDto {
  @ApiProperty({ example: 1 })
  device_group_id: number;

  @ApiProperty({ example: "grp_xyz789" })
  group_id: string;

  @ApiProperty({ example: "coseco-sirjan" })
  group_name: string;

  @ApiProperty({ example: "device_pass_123" })
  password: string;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  created_at: Date;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  updated_at: Date;
}

export class DeviceProfileShortDto {
  @ApiProperty({ example: 1 })
  profile_id: number;

  @ApiProperty({ example: "default" })
  profile_name: string;
}

export class DeviceGroupResponseDto {
  @ApiProperty({ type: DeviceGroupDto })
  data: DeviceGroupDto;

  @ApiProperty({ example: "Device group retrieved successfully" })
  message: string;
}

export class DeviceGroupListResponseDto {
  @ApiProperty({ type: [DeviceGroupDto] })
  data: DeviceGroupDto[];

  @ApiProperty({ example: "Device groups retrieved successfully" })
  message: string;
}

// ============================================
// Device Response DTOs
// ============================================

export class DeviceDto {
  @ApiProperty({ example: 1 })
  device_id: number;

  @ApiProperty({ example: "Temperature Sensor A1" })
  device_name: string;

  @ApiProperty({ example: "tok_abc123" })
  token_id: string;

  @ApiProperty({ example: "sensor" })
  device_type: string;

  @ApiProperty({ example: 1 })
  device_group_id: number;

  @ApiPropertyOptional({ example: 1 })
  profile_id?: number;

  @ApiPropertyOptional({
    description: "Device profile details",
    type: () => DeviceProfileShortDto,
  })
  deviceProfile?: DeviceProfileShortDto;

  @ApiProperty({
    example: "idle",
    enum: [
      "idle",
      "approved",
      "rejected",
      "claimed",
      "not_claimed",
      "not_approved",
    ],
  })
  status: string;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  created_at: Date;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  updated_at: Date;

  @ApiPropertyOptional({
    description: "Tenant information",
    type: () => TenantShortDto,
  })
  tenant?: TenantShortDto;

  @ApiPropertyOptional({
    description: "Device group information",
    type: () => DeviceGroupDto,
  })
  deviceGroup?: DeviceGroupDto;
}

export class DeviceResponseDto {
  @ApiProperty({ type: DeviceDto })
  data: DeviceDto;

  @ApiProperty({ example: "Device retrieved successfully" })
  message: string;
}

export class DeviceListResponseDto {
  @ApiProperty({ type: [DeviceDto] })
  data: DeviceDto[];

  @ApiProperty({ example: "Devices retrieved successfully" })
  message: string;
}

// ============================================
// Error Response DTOs
// ============================================

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: "Bad Request" })
  error: string;

  @ApiProperty({ example: "Validation failed" })
  message: string;
}

export class UnauthorizedResponseDto {
  @ApiProperty({ example: 401 })
  statusCode: number;

  @ApiProperty({ example: "Unauthorized" })
  error: string;

  @ApiProperty({ example: "Invalid credentials" })
  message: string;
}

export class ForbiddenResponseDto {
  @ApiProperty({ example: 403 })
  statusCode: number;

  @ApiProperty({ example: "Forbidden" })
  error: string;

  @ApiProperty({
    example: "You do not have permission to access this resource",
  })
  message: string;
}

export class NotFoundResponseDto {
  @ApiProperty({ example: 404 })
  statusCode: number;

  @ApiProperty({ example: "Not Found" })
  error: string;

  @ApiProperty({ example: "Resource not found" })
  message: string;
}

export class ConflictResponseDto {
  @ApiProperty({ example: 409 })
  statusCode: number;

  @ApiProperty({ example: "Conflict" })
  error: string;

  @ApiProperty({ example: "Resource already exists" })
  message: string;
}
