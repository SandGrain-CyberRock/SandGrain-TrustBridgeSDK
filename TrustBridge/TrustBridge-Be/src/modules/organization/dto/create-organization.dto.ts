import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Corp', description: 'Organization name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ou_name: string;

  @ApiPropertyOptional({ example: 'Technology company', description: 'Organization description' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  ou_description?: string;
}
