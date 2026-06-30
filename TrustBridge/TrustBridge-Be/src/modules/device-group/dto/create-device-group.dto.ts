import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateDeviceGroupDto {
  @ApiProperty({ example: "coseco-new", description: "Group name (used as username for the new IoT device on Sandgrain)" })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  group_name: string;

  @ApiProperty({ example: "device_pass_123", description: "Group password for device login" })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(48)
  password: string;

  @ApiPropertyOptional({ example: "7c8d7ea7-882e-4427-ab93-c010ffc809db", description: "Tenant ID to associate the group with. Defaults to the first tenant in the JWT." })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  tenant_id?: string;
}
