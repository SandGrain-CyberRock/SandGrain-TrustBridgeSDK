import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Acme Corp Updated' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  ou_name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  ou_description?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], example: 'ACTIVE' })
  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  @MaxLength(20)
  ou_status?: string;
}
