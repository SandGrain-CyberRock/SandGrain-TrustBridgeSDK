import { Type } from "class-transformer";
import { IsDate, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

export class FindLogsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    cursor?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number;

    @IsOptional()
    @IsString()
    process_type?: string;

    @IsOptional()
    @IsString()
    eventScope?: string;

    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsString()
    leaf_id?: string;

    @IsOptional()
    @IsString()
    edge_node_id?: string;

    @IsOptional()
    @IsString()
    tid?: string;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    fromDate?: Date;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    toDate?: Date;
}