export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
  }>;
}

export interface SystemActivity {
  activity_id: number;
  activity_type: string;
  entity_type: string;
  entity_id?: number;
  device_id?: number;
  device_group_id?: number;
  title: string;
  description?: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  icon?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  device?: {
    device_id: number;
    device_name: string;
  };
  deviceGroup?: {
    device_group_id: number;
    group_name: string;
  };
}

export type EventScope = 'edge_node' | 'leaf' | 'device' | 'cloud';
export type AppSeqScope = 'edge_node' | 'leaf';
export type ProcessType = 'authentication' | 'fw_verification' | 'installation';
export type TraceLogStatus = 'in_progress' | 'success' | 'failed' | string;

export interface TraceLog {
  id: number;
  edge_node_id: string | null;
  event_scope: EventScope | null;
  leaf_id: string | null;
  app_seq_scope: AppSeqScope | null;
  app_message_seq: number | null;
  process_type: ProcessType;
  step: string;
  status: TraceLogStatus;
  message: string | null;
  request_data: unknown;
  response_data: unknown;
  duration_ms: number | null;
  attempt_number: number;
  local_timestamp: string;
  created_at: string;
}

export interface FindLogsResult {
  data: TraceLog[];
  nextCursor: number | null;
  hasMore: boolean;
}
