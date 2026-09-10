import { TraceLog } from "src/entities/trace-log.entity";

export interface TraceLogInput {
    leaf_id?: string;
    edge_node_id?: string;
    event_scope?: "edge_node" | "leaf" | "cloud";
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


export interface FindLogsResult {
    data: TraceLog[];
    nextCursor: number | null;
    hasMore: boolean;
}


export interface CloudLogInput {
    status?: string;
    timestamp?: string;
    component?: string;
    level?: string;
    message?: string;
    request_originator?: string;
    gateway_id?: string;
    event_scope?: string;
    device_id?: string;
    app_seq_scope?: string;
    app_message_seq?: number;
    action?: string;
    http_status?: number;
    request_data?: any;
    dt_ms?: number;
}