import { ApiPropertyOptional } from "@nestjs/swagger";

import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateDeviceGroupDto {
  @ApiPropertyOptional({ example: "grp_xyz789", description: "Group ID from list-iot API" })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  group_id?: string;

  @ApiPropertyOptional({ example: "coseco-sirjan", description: "Group name (used as username for device login)" })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  group_name?: string;

  @ApiPropertyOptional({ example: "new_pass_456", description: "Group password for device login" })
  @IsString()
  @IsOptional()
  @MinLength(8)
  @MaxLength(48)
  password?: string;

  @ApiPropertyOptional({ example: "ACTIVE", enum: ["ACTIVE", "INACTIVE"], description: "Group status" })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;
}
