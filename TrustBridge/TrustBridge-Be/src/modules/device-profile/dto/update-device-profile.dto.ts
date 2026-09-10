import { ApiPropertyOptional } from "@nestjs/swagger";

import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateDeviceProfileDto {
  @ApiPropertyOptional({
    example: "Industrial Sensor Profile",
    description: "Profile name",
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  profile_name?: string;

  @ApiPropertyOptional({ example: 1, description: "Category ID" })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  category_id?: number;

  @ApiPropertyOptional({ example: 2, description: "Sub-category ID" })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  sub_category_id?: number;

  @ApiPropertyOptional({
    example: [1, 2],
    description: "Array of Tag IDs (replaces existing tags)",
    type: [Number],
  })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsOptional()
  tag_ids?: number[];

  @ApiPropertyOptional({
    example: "ACTIVE",
    description: "Profile status",
    enum: ["ACTIVE", "INACTIVE"],
  })
  @IsIn(["ACTIVE", "INACTIVE"])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 1, description: "Profile default param ID" })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  profile_param_id?: number;

  @ApiPropertyOptional({
    example: false,
    description:
      "Set this profile as the default for devices with no profile assigned",
  })
  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  // Profile Params - now merged directly into device profile
  @ApiPropertyOptional({
    example: "mqtt://broker.example.com",
    description: "MQTT Server URL",
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  mqtt_server?: string;

  @ApiPropertyOptional({ example: "device_user", description: "MQTT Username" })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  mqtt_username?: string;

  @ApiPropertyOptional({ example: "password123", description: "MQTT Password" })
  @IsString()
  @IsOptional()
  @MinLength(8)
  @MaxLength(72)
  mqtt_password?: string;

  @ApiPropertyOptional({
    example: "1",
    description: "QoS Level",
    enum: ["0", "1", "2"],
  })
  @IsIn(["0", "1", "2"])
  @IsOptional()
  qos_level?: string;

  @ApiPropertyOptional({
    example: "TLS 1.2",
    description: "TLS Type",
    enum: ["TLS 1.2", "TLS 1.3"],
  })
  @IsIn(["TLS 1.2", "TLS 1.3"])
  @IsOptional()
  tls_type?: string;

  @ApiPropertyOptional({
    example: "auto",
    description: "Claim Type",
    enum: ["auto", "manual"],
  })
  @IsIn(["auto", "manual"])
  @IsOptional()
  claim_type?: string;

  @ApiPropertyOptional({
    example: 60,
    description: "Auth Frequency in seconds",
  })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  auth_frequency?: number;

  @ApiPropertyOptional({
    example: 5,
    description: "Max Failed Auth Attempts before lockout",
  })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  max_failed_auth_attempts?: number;
}
