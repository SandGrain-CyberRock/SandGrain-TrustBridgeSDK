import { ApiProperty } from '@nestjs/swagger';

import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'TrustAdmin', description: 'Username' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @ApiProperty({ example: 'TrustAdmin', description: 'Password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  password: string;
}
