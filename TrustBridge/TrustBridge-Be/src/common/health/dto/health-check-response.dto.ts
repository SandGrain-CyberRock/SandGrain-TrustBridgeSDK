import { ApiProperty } from "@nestjs/swagger";

export class ServiceStatusDto {
    @ApiProperty({ enum: ["up", "down"], example: "up" })
    status: "up" | "down";

    @ApiProperty({ required: false, example: "Connection timeout" })
    message?: string;
}

export class HealthCheckResponseDto {
    @ApiProperty({ type: ServiceStatusDto })
    cache: ServiceStatusDto;

    @ApiProperty({ type: ServiceStatusDto })
    database: ServiceStatusDto;

    @ApiProperty({ type: ServiceStatusDto })
    mqtt: ServiceStatusDto;
}