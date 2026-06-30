import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsOptional, IsNotEmpty } from "class-validator";

export class SaveTenantCredentialsDto {
  @ApiProperty({
    example: "5fd9e5d5-90a5-4cbb-93f9-80fe9c1f261a",
    description: "Tenant ID from Sandgrain / CyberRock",
  })
  @IsString()
  @IsNotEmpty()
  tenant_id: string;

  @ApiProperty({
    example: "8986693b-c852-487c-8c14-be96307fafe7",
    description: "Tenant user ID from Cloudflare",
  })
  @IsString()
  @IsNotEmpty()
  tenant_user_id: string;

  @ApiProperty({
    example: "admin@example.com",
    description: "Email for tenant user",
  })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: "SecureP@ss123",
    description: "Password for tenant user",
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    example: "cf_client_id_xxx",
    description: "Cloudflare Access Client ID",
  })
  @IsString()
  @IsNotEmpty()
  cf_access_client_id: string;

  @ApiProperty({
    example: "cf_client_secret_xxx",
    description: "Cloudflare Access Client Secret",
  })
  @IsString()
  @IsNotEmpty()
  cf_access_client_secret: string;
}
