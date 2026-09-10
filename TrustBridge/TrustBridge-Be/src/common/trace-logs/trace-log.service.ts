import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { InjectRedis } from "@nestjs-modules/ioredis";
import { Response } from "express";
import Redis from "ioredis";
import { TraceLog } from "src/entities/trace-log.entity";
import { Repository, SelectQueryBuilder } from "typeorm";

import { TRACE_LOG_BUFFER_KEY } from "../queue";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./constant";
import { FindLogsQueryDto } from "./dtos/FindLogsQueryDto";
import { FindLogsResult, TraceLogInput } from "./types";

const EXPORT_BATCH_SIZE = 500;

@Injectable()
export class TraceLogService {
    private readonly logger = new Logger(TraceLogService.name);

    constructor(
        @InjectRedis() private readonly redis: Redis,
        @InjectRepository(TraceLog) private readonly repo: Repository<TraceLog>,
    ) { }

    log(input: TraceLogInput): void {
        let leaf_id = input.leaf_id ?? null;
        let edge_node_id = input.edge_node_id ?? null;
        let event_scope = input.event_scope ?? null;

        if (!leaf_id && !edge_node_id && input.tid) {
            if (input.tid === "gateway") {
                edge_node_id = input.tid;
                event_scope = event_scope ?? "edge_node";
            } else {
                leaf_id = input.tid;
                event_scope = event_scope ?? "leaf";
            }
        }

        if (!event_scope && input.step?.startsWith("gw:")) {
            event_scope = "edge_node";
        }

        const entry = {
            edge_node_id,
            event_scope,
            leaf_id,
            app_seq_scope: input.app_seq_scope ?? null,
            app_message_seq: input.app_message_seq ?? null,
            process_type: input.process_type,
            step: input.step,
            status: input.status,
            message: input.message ?? null,
            request_data: input.request_data ?? null,
            response_data: input.response_data ?? null,
            duration_ms: input.duration_ms ?? null,
            attempt_number: input.attempt_number,
            local_timestamp: new Date().toISOString(),
        };

        this.redis.rpush(TRACE_LOG_BUFFER_KEY, JSON.stringify(entry)).catch((err) =>
            this.logger.error(`Failed to buffer trace log: ${this.errMsg(err)}`),
        );
    }

    async findLogs(options: FindLogsQueryDto = {}): Promise<FindLogsResult> {
        const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

        const qb = this.buildFilteredQuery(options).take(limit + 1); // fetch one extra to know if there's a next page

        if (options.cursor !== undefined) {
            qb.andWhere("log.id < :cursor", { cursor: options.cursor });
        }

        const rows = await qb.getMany();

        const hasMore = rows.length > limit;
        const data = hasMore ? rows.slice(0, limit) : rows;
        const nextCursor = hasMore ? data[data.length - 1].id : null;

        return { data, nextCursor, hasMore };
    }

    /**
     * Streams ALL rows matching the filters as a downloadable JSON file.
     * Fetches in batches internally so we never hold the full result set
     * in memory, regardless of how large the trace_log table gets.
     */
    async exportStream(options: FindLogsQueryDto, res: Response): Promise<void> {
        const filename = `trace-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        let cursor = options.cursor;
        let isFirstRow = true;

        res.write("[");

        try {
            while (true) {
                const qb = this.buildFilteredQuery(options).take(EXPORT_BATCH_SIZE);

                if (cursor !== undefined) {
                    qb.andWhere("log.id < :cursor", { cursor });
                }

                const rows = await qb.getMany();

                if (rows.length === 0) break;

                for (const row of rows) {
                    if (!isFirstRow) res.write(",");
                    res.write(JSON.stringify(row));
                    isFirstRow = false;
                }

                if (rows.length < EXPORT_BATCH_SIZE) break;

                cursor = rows[rows.length - 1].id;
            }

            res.write("]");
            res.end();
        } catch (err) {
            this.logger.error(`Export stream failed: ${this.errMsg(err)}`);
            // Headers are already sent by this point in most cases, so we
            // can't send a clean error response — just terminate the stream.
            res.end();
        }
    }

    private buildFilteredQuery(options: FindLogsQueryDto): SelectQueryBuilder<TraceLog> {
        const qb = this.repo.createQueryBuilder("log").orderBy("log.id", "DESC");

        if (options.process_type) {
            qb.andWhere("log.process_type = :process_type", { process_type: options.process_type });
        }
        if (options.eventScope) {
            qb.andWhere("log.event_scope = :event_scope", { event_scope: options.eventScope });
        }
        if (options.status) {
            qb.andWhere("log.status = :status", { status: options.status });
        }
        if (options.leaf_id) {
            qb.andWhere("log.leaf_id = :leaf_id", { leaf_id: options.leaf_id });
        }
        if (options.edge_node_id) {
            qb.andWhere("log.edge_node_id = :edge_node_id", { edge_node_id: options.edge_node_id });
        }
        if (options.tid) {
            qb.andWhere("(log.leaf_id = :tid OR log.edge_node_id = :tid)", { tid: options.tid });
        }
        if (options.fromDate) {
            qb.andWhere("log.created_at >= :fromDate", { fromDate: options.fromDate });
        }
        if (options.toDate) {
            qb.andWhere("log.created_at <= :toDate", { toDate: options.toDate });
        }

        return qb;
    }

    private errMsg(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
}