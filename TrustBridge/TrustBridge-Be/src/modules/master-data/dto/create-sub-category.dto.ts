import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateSubCategoryDto {
  @ApiProperty({ example: "Temperature Sensors", description: "Sub-category name" })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  sub_category_name: string;

  @ApiProperty({ example: 1, description: "Parent category ID" })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  category_id: number;
}
