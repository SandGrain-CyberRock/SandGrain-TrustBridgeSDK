import { ApiProperty } from "@nestjs/swagger";

import { IsString, IsNotEmpty, MinLength, MaxLength } from "class-validator";

export class ResetPasswordDto {
  @ApiProperty({ description: "Password reset token from email" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  token: string;

  @ApiProperty({
    example: "newpassword123",
    description: "New password (min 6 characters)",
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}
