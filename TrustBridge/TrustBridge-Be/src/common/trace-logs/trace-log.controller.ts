import { Controller, Get, Query, Res, ValidationPipe } from "@nestjs/common";

import { Response } from "express";

import { FindLogsQueryDto } from "./dtos/FindLogsQueryDto";
import { TraceLogService } from "./trace-log.service";
import { FindLogsResult } from "./types";

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

    @Get("download/all")
    async export(
        @Query()
        query: FindLogsQueryDto,
        @Res() res: Response,
    ): Promise<void> {
        await this.traceLogService.exportStream(query, res);
    }
}