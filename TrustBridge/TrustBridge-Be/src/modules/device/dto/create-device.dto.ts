import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateDeviceDto {
  @ApiProperty({
    example: "Temperature Sensor A1",
    description: "Name of the device",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  device_name: string;

  @ApiProperty({
    example: "tok_abc123",
    description: "Token ID for the device",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  token_id: string;

  @ApiPropertyOptional({ example: "sensor", description: "Type of the device (defaults to 'device')" })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  device_type?: string;

  @ApiProperty({ example: 1, description: "Device Group ID" })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  device_group_id: number;

  @ApiProperty({
    example: "7c8d7ea7-882e-4427-ab93-c010ffc809db",
    description: "Tenant ID for API credentials",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tenant_id: string;

  @ApiPropertyOptional({ example: 1, description: "Device profile ID" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  profile_id?: number;

  @ApiPropertyOptional({ example: "DEV-001-2025", description: "Device serial number" })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  device_serial?: string;

  @ApiPropertyOptional({ example: "BATCH-SAMPLE-001", description: "Batch number for device import" })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  batch_no?: string;

  @ApiPropertyOptional({ description: "Pre-computed Challenge Word from factory (offline onboarding)" })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  offline_cw?: string;

  @ApiPropertyOptional({ description: "Pre-computed Response Word from factory (offline onboarding)" })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  offline_rw?: string;
}
