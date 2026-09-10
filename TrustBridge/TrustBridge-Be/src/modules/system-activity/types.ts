export interface CreateActivityDto {
    activity_type: string;
    entity_type: string;
    entity_id?: number;
    device_id?: number;
    device_group_id?: number;
    title: string;
    description?: string;
    severity?: "info" | "success" | "warning" | "error";
    icon?: string;
    metadata?: any;
}