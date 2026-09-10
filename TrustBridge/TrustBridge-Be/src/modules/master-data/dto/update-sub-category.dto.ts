import { ApiPropertyOptional } from "@nestjs/swagger";

import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateSubCategoryDto {
  @ApiPropertyOptional({ example: "Temperature Sensors", description: "Sub-category name" })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  sub_category_name?: string;

  @ApiPropertyOptional({ example: 1, description: "Parent category ID" })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  category_id?: number;
}
