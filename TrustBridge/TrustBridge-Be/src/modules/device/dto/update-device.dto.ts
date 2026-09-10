import { ApiPropertyOptional } from "@nestjs/swagger";

import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class UpdateDeviceDto {
  @ApiPropertyOptional({
    example: "Temperature Sensor B2",
    description: "Name of the device",
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  device_name?: string;

  @ApiPropertyOptional({
    example: "tok_def456",
    description: "Token ID for the device",
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  token_id?: string;

  @ApiPropertyOptional({
    example: "actuator",
    description: "Type of the device",
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  device_type?: string;

  @ApiPropertyOptional({ example: 1, description: "Device Group ID" })
  @IsNumber()
  @IsOptional()
  device_group_id?: number;

  @ApiPropertyOptional({
    example: "7c8d7ea7-882e-4427-ab93-c010ffc809db",
    description: "Tenant ID for API credentials",
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  tenant_id?: string;

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

  @ApiPropertyOptional({ example: "BATCH-SAMPLE-001", description: "Batch number" })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  batch_no?: string;

  @ApiPropertyOptional({
    example: "claimed",
    description: "Device status",
    enum: ["idle", "inprogress", "claimed", "rejected"],
  })
  @IsString()
  @IsOptional()
  @IsIn(["idle", "inprogress", "claimed", "rejected"])
  @MaxLength(20)
  status?: string;

  @ApiPropertyOptional({
    example: true,
    description: "Whether the device is active",
  })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
