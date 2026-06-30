import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty({ example: 'report:generate', description: 'Unique permission key' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 'report', description: 'Module name' })
  @IsString()
  @IsNotEmpty()
  module: string;

  @ApiProperty({ example: 'generate', description: 'Action name' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiPropertyOptional({ example: 'Generate reports', description: 'Permission description' })
  @IsString()
  @IsOptional()
  description?: string;
}
