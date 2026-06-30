// admin-reset-password.dto.ts
import { IsString, MinLength, MaxLength } from "class-validator";

export class AdminResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  tempPassword: string;
}
