import { Controller, Get, Query, ValidationPipe } from "@nestjs/common";
import { TraceLogService } from "./trace-log.service";
import { FindLogsResult } from "./types";
import { FindLogsQueryDto } from "./dtos/FindLogsQueryDto";

@Controller("trace-logs")
export class TraceLogController {
    constructor(private readonly traceLogService: TraceLogService) { }

    @Get()
    async findAll(
        @Query(new ValidationPipe({ transform: true, whitelist: true }))
        query: FindLogsQueryDto,
    ): Promise<FindLogsResult> {
        return this.traceLogService.findLogs(query);
    }
}