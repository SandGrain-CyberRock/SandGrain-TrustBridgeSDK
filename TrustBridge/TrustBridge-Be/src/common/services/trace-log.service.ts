import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { createWriteStream, WriteStream, mkdirSync } from "fs";
import { dirname } from "path";


interface TraceLogInput {
    leaf_id?: string;
    edge_node_id?: string;
    event_scope?: "edge_node" | "leaf";
    app_seq_scope?: "edge_node" | "leaf";
    app_message_seq?: number;
    tid?: string;
    process_type: "authentication" | "fw_verification" | "installation";
    step: string;
    status: "in_progress" | "success" | "failed" | string;
    message?: string;
    request_data?: any;
    response_data?: any;
    duration_ms?: number;
    attempt_number: number;
}

const LOG_PATH = process.env.TRACE_LOG_PATH || "logs/trustbridge-trace.log";

@Injectable()
export class TraceLogService implements OnModuleDestroy {
    private readonly logger = new Logger(TraceLogService.name);
    private stream: WriteStream;

    constructor() {
        mkdirSync(dirname(LOG_PATH), { recursive: true });
        this.stream = createWriteStream(LOG_PATH, { flags: "a" });
        this.stream.on("error", (err) => this.logger.error(`Trace log stream error: ${err.message}`));
    }

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

        this.stream.write(JSON.stringify(entry) + "\n");
    }

    onModuleDestroy(): void {
        this.stream.end();
    }
}