import { ApiProperty } from "@nestjs/swagger";

import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class CreateTagDto {
  @ApiProperty({ example: "outdoor", description: "Tag name" })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(30)
  tag_name: string;
}
