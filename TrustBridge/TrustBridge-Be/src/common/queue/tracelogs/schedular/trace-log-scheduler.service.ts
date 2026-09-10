import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";

import { Queue } from "bullmq";

import {
    TRACE_LOG_QUEUE,
    TRACE_LOG_FLUSH_JOB,
    TRACE_LOG_SCHEDULER_JOB_ID,
    TRACE_LOG_FLUSH_INTERVAL_MS,
} from "../constants";

@Injectable()
export class TraceLogSchedulerService implements OnApplicationBootstrap {
    private readonly logger = new Logger(TraceLogSchedulerService.name);

    constructor(@InjectQueue(TRACE_LOG_QUEUE) private readonly queue: Queue) { }

    async onApplicationBootstrap(): Promise<void> {
        await this.ensureScheduleRegistered();
    }

    private async ensureScheduleRegistered(): Promise<void> {
        await this.queue.upsertJobScheduler(
            TRACE_LOG_SCHEDULER_JOB_ID,
            { every: TRACE_LOG_FLUSH_INTERVAL_MS },
            {
                name: TRACE_LOG_FLUSH_JOB,
                data: {},
                opts: {
                    removeOnComplete: true,
                    removeOnFail: true,
                },
            },
        );

        this.logger.log(`Trace log flush scheduler registered (every ${TRACE_LOG_FLUSH_INTERVAL_MS}ms)`);
    }
}