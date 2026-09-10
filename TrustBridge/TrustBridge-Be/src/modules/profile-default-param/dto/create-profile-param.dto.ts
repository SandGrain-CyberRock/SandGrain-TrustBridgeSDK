import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { Type } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, IsEnum, IsInt, Min, MaxLength, MinLength } from "class-validator";

import { QosLevel, TlsType, ClaimType } from "../enums/profile-param.enum";

export class CreateProfileParamDto {
  @ApiProperty({
    example: "Default MQTT Config",
    description: "Parameter set name",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  param_name: string;

  @ApiPropertyOptional({
    example: "mqtt.example.com",
    description: "MQTT server host",
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  mqtt_server?: string;

  @ApiPropertyOptional({ example: "mqtt_user", description: "MQTT username" })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  mqtt_username?: string;

  @ApiPropertyOptional({ example: "mqtt_pass", description: "MQTT password" })
  @IsString()
  @IsOptional()
  @MinLength(8)
  @MaxLength(72)
  mqtt_password?: string;

  @ApiPropertyOptional({
    example: "0",
    description: "QoS level (0, 1 or 2)",
    enum: QosLevel,
  })
  @IsEnum(QosLevel)
  @IsOptional()
  qos_level?: QosLevel;

  @ApiPropertyOptional({
    example: "TLS 1.2",
    description: "TLS type",
    enum: TlsType,
  })
  @IsEnum(TlsType)
  @IsOptional()
  tls_type?: TlsType;

  @ApiPropertyOptional({
    example: "auto",
    description: "Claim type",
    enum: ClaimType,
  })
  @IsEnum(ClaimType)
  @IsOptional()
  claim_type?: ClaimType;

  @ApiPropertyOptional({
    example: 60,
    description: "Authentication frequency in seconds",
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  auth_frequency?: number;

  @ApiPropertyOptional({
    example: 5,
    description: "Maximum number of failed authentication attempts",
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  max_failed_auth_attempts?: number;
}
