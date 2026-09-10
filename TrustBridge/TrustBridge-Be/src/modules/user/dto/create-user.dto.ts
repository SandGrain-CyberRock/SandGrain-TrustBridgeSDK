import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsNumber,
  IsOptional,
  MaxLength,
} from "class-validator";

export class CreateUserDto {
  @ApiPropertyOptional({ example: 1, description: "Organization ID (optional for Super Admin)" })
  @IsNumber()
  @IsOptional()
  ou_id?: number;

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

  @ApiProperty({ example: "johndoe", description: "Username" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: "Username must be at most 100 characters" })
  username: string;

  @ApiProperty({ example: "john@example.com", description: "Email address" })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: 1, description: "Role ID to assign" })
  @IsNumber()
  @IsOptional()
  role_id?: number;
}
