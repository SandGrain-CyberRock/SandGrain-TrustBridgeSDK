import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'MANAGER', description: 'Role name (unique)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Manager', description: 'Display label' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiPropertyOptional({ example: 'user-cog', description: 'Icon identifier' })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({ example: '#FF5500', description: 'Icon color code' })
  @IsString()
  @IsOptional()
  icon_color?: string;

  @ApiPropertyOptional({ example: 'Manages team members', description: 'Role description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: [1, 2, 3], description: 'Permission IDs to assign' })
  @IsArray()
  @IsOptional()
  permission_ids?: number[];
}
