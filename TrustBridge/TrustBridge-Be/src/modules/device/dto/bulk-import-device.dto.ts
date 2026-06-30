import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class BulkImportDeviceDto {
  @ApiProperty({
    type: "string",
    format: "binary",
    description:
      "JSON file with batch_no, batch_description, and devices array. See TrustBridge Device Import JSON V1.0 spec.",
  })
  file: Express.Multer.File;
}

export class BulkImportResponseDto {
  @ApiProperty({ example: "5 devices imported successfully" })
  message: string;

  @ApiProperty({ example: 5 })
  count: number;

  @ApiPropertyOptional({ example: "f6fb72166df86c69ddf7" })
  batch_no?: string;

  @ApiPropertyOptional({ example: "This is a sample device import file" })
  batch_description?: string;

  @ApiPropertyOptional({
    example: ["Device 3: group 'unknown_group' not found"],
    description: "Per-device validation warnings (devices that were skipped)",
  })
  errors?: string[];
}
