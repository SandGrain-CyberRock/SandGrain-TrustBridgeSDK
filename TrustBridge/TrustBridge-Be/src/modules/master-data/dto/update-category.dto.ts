import { ApiPropertyOptional } from "@nestjs/swagger";

import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: "Sensors", description: "Category name" })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  category_name?: string;
}
