export interface DashboardStats {
    total_devices: number;
    new_devices: number;
    rejected_devices: number;
    claimed_devices: number;
    active_devices: number;
    inactive_devices: number;
    failed_authentications: number;
    recent_events: number;
    auth_success_rate: number;
}