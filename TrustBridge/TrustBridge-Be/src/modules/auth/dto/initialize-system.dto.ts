import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  ValidateNested,
  MaxLength,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";

class TenantCredentialsDto {
  // @ApiProperty({
  //   example: "5fd9e5d5-90a5-4cbb-93f9-80fe9c1f261a",
  //   description: "CyberRock Tenant ID",
  // })
  // @IsString()
  // @IsNotEmpty()
  // @MaxLength(100)
  // tenant_id: string;

  // @ApiProperty({
  //   example: "8986693b-c852-487c-8c14-be96307fafe7",
  //   description: "Tenant User ID",
  // })
  // @IsString()
  // @IsNotEmpty()
  // @MaxLength(100)
  // tenant_user_id: string;

  @ApiProperty({
    example: "tenant@example.com",
    description: "Tenant access email",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  email: string;

  @ApiProperty({
    example: "SecureP@ss123",
    description: "Tenant access password",
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({
    example: "cf_client_id_xxx",
    description: "Cloudflare Access Client ID",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cf_access_client_id: string;

  @ApiProperty({
    example: "cf_client_secret_xxx",
    description: "Cloudflare Access Client Secret",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  cf_access_client_secret: string;
}

class AdminUserDto {
  @ApiProperty({ example: "John" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: "Smith" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: "john.smith@company.com" })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(100)
  email: string;
}

export class InitializeSystemDto {
  @ApiProperty({ example: "Coseco B.V." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  orgName: string;

  @ApiPropertyOptional({ example: "Brief description of your organisation" })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  orgDescription?: string;

  @ApiProperty({ example: "admin@coseco.com" })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(100)
  orgEmail: string;

  @ApiProperty({ type: TenantCredentialsDto })
  @ValidateNested()
  @Type(() => TenantCredentialsDto)
  tenantCredentials: TenantCredentialsDto;

  @ApiProperty({ type: AdminUserDto })
  @ValidateNested()
  @Type(() => AdminUserDto)
  adminUser: AdminUserDto;
}
