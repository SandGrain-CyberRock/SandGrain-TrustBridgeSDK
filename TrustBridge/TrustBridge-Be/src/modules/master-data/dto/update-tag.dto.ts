import { ApiPropertyOptional } from "@nestjs/swagger";

import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateTagDto {
  @ApiPropertyOptional({ example: "outdoor", description: "Tag name" })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(30)
  tag_name?: string;
}
