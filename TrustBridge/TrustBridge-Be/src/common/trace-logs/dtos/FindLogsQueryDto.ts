import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

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
    @IsIn(["in_progress", "success", "failed", "info"])
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
}