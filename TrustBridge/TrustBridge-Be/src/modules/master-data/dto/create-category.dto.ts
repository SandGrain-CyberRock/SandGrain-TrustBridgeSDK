import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCategoryDto {
  @ApiProperty({ example: "Sensors", description: "Category name" })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  category_name: string;
}
