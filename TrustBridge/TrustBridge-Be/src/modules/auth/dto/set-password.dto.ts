import { ApiProperty } from "@nestjs/swagger";

import { IsString, IsNotEmpty, MinLength, MaxLength } from "class-validator";

export class SetPasswordDto {
  @ApiProperty({ description: "Invitation token from email" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  token: string;

  @ApiProperty({
    example: "password123",
    description: "Password (min 6 characters)",
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}
