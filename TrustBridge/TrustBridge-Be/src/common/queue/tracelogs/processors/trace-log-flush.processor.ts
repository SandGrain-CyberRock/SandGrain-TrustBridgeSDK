import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { InjectRedis } from "@nestjs-modules/ioredis";
import { Job } from "bullmq";
import Redis from "ioredis";
import { Repository } from "typeorm";

import { TraceLog } from "../../../../entities/trace-log.entity";
import { TRACE_LOG_QUEUE, TRACE_LOG_FLUSH_JOB, TRACE_LOG_BUFFER_KEY, TRACE_LOG_BATCH_SIZE } from "../constants";
import { POP_BATCH_SCRIPT } from "../constants";


@Processor(TRACE_LOG_QUEUE, {
    concurrency: 1,
    lockDuration: 30000,
})
export class TraceLogFlushProcessor extends WorkerHost {
    private readonly logger = new Logger(TraceLogFlushProcessor.name);

    constructor(
        @InjectRepository(TraceLog) private readonly repo: Repository<TraceLog>,
        @InjectRedis() private readonly redis: Redis,
    ) {
        super();
    }

    async process(job: Job): Promise<void> {
        if (job.name !== TRACE_LOG_FLUSH_JOB) {
            this.logger.warn(`Unexpected job name on trace-log queue: ${job.name}`);
            return;
        }

        await this.flushBatch();
    }

    private async flushBatch(): Promise<void> {
        const result = await this.redis.eval(
            POP_BATCH_SCRIPT,
            1,
            TRACE_LOG_BUFFER_KEY,
            TRACE_LOG_BATCH_SIZE,
        );

        const raw = result as unknown as string[];

        if (raw.length === 0) return;

        const rows = raw.map((r) => JSON.parse(r));

        try {
            await this.repo.createQueryBuilder().insert().into(TraceLog).values(rows).execute();
            this.logger.debug(`Flushed ${rows.length} trace log entries to MySQL`);
        } catch (err) {
            await this.redis.lpush(TRACE_LOG_BUFFER_KEY, ...raw.reverse());
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Bulk trace log insert failed (${rows.length} rows), requeued: ${msg}`);
        }
    }
}