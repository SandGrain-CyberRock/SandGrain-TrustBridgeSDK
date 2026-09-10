import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsString, IsOptional } from 'class-validator';

export class UpdatePermissionDto {
  @ApiPropertyOptional({ example: 'report:export' })
  @IsString()
  @IsOptional()
  key?: string;

  @ApiPropertyOptional({ example: 'report' })
  @IsString()
  @IsOptional()
  module?: string;

  @ApiPropertyOptional({ example: 'export' })
  @IsString()
  @IsOptional()
  action?: string;

  @ApiPropertyOptional({ example: 'Export reports' })
  @IsString()
  @IsOptional()
  description?: string;
}
