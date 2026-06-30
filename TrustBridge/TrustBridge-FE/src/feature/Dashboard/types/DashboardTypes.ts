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
