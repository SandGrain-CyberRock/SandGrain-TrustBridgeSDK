import { IsString, IsOptional, IsIn, IsNumber, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateUserDto {
  @ApiPropertyOptional({ example: "John Doe", description: "Full name" })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: "CTO", description: "Company title" })
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: "Company title must be at most 100 characters" })
  company_title?: string;

  @ApiPropertyOptional({ enum: ["ACTIVE", "INACTIVE"], example: "ACTIVE" })
  @IsString()
  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  @MaxLength(20)
  user_status?: string;

  @ApiPropertyOptional({ example: 1, description: "Role ID to assign" })
  @IsNumber()
  @IsOptional()
  role_id?: number;
}
