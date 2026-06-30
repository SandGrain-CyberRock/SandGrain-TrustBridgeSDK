import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({
    example: '7c8d7ea7-882e-4427-ab93-c010ffc809db',
    description: 'Tenant UUID from the external tenant system',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tenant_id: string;

  @ApiPropertyOptional({
    example: 'ACTIVE',
    enum: ['ACTIVE', 'INACTIVE'],
    description: 'Tenant status (defaults to ACTIVE)',
  })
  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  @MaxLength(20)
  tenant_status?: string;

  @ApiProperty({
    example: '8986693b-c852-487c-8c14-be96307fafe7',
    description: 'Tenant user ID for API authentication',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tenant_user_id: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'Email for tenant API login',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  email: string;

  @ApiProperty({
    example: 'SecurePass123',
    description: 'Password for tenant API login',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({
    example: '81f5e86ddfe63d047dea7708ca0923da.access',
    description: 'Cloudflare Access Client ID',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cf_access_client_id: string;

  @ApiProperty({
    example: 'b91a56daac73f0d7cce37fb3858e1211cd1ebc18684bb723306225f567d104ad',
    description: 'Cloudflare Access Client Secret',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  cf_access_client_secret: string;
}
