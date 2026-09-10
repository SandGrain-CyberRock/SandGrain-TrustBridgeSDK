import { ApiProperty } from '@nestjs/swagger';

import { IsArray, IsNumber } from 'class-validator';

export class AssignPermissionsDto {
  @ApiProperty({ example: [1, 2, 3], description: 'Permission IDs to assign' })
  @IsArray()
  @IsNumber({}, { each: true })
  permission_ids: number[];
}
