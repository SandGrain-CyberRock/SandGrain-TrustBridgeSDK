import { IsString, MinLength, MaxLength } from "class-validator";

export class ChangePasswordDto {
  @IsString()
  @MaxLength(72)
  oldPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
