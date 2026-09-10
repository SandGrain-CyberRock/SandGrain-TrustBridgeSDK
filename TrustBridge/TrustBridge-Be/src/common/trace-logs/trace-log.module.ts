import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { TraceLog } from "src/entities/trace-log.entity";

import { TraceLogController } from "./trace-log.controller";
import { TraceLogService } from "./trace-log.service";
import { TRACE_LOG_QUEUE } from "../queue/tracelogs/constants";
import { TraceLogFlushProcessor } from "../queue/tracelogs/processors/trace-log-flush.processor";
import { TraceLogSchedulerService } from "../queue/tracelogs/schedular/trace-log-scheduler.service";



@Module({
    imports: [
        TypeOrmModule.forFeature([TraceLog]),
        BullModule.registerQueue({ name: TRACE_LOG_QUEUE }),
    ],
    controllers: [TraceLogController],
    providers: [TraceLogService, TraceLogSchedulerService, TraceLogFlushProcessor],
    exports: [TraceLogService],
})
export class TraceLogModule { }