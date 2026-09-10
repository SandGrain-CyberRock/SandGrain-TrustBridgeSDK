import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'MANAGER_UPDATED' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Manager Updated' })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiPropertyOptional({ example: 'user-shield' })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({ example: '#00FF00' })
  @IsString()
  @IsOptional()
  icon_color?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: [1, 2, 3] })
  @IsArray()
  @IsOptional()
  permission_ids?: number[];

  @ApiPropertyOptional({ description: 'ACTIVE or INACTIVE', example: 'ACTIVE' })
  @IsString()
  @IsOptional()
  status?: string;
}
