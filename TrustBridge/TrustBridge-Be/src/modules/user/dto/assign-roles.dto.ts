import { IsArray, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignRolesDto {
  @ApiProperty({ example: [1, 2], description: 'Role IDs to assign' })
  @IsArray()
  @IsNumber({}, { each: true })
  role_ids: number[];
}
