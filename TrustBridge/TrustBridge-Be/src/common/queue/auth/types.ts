export type AuthTimeoutJobData = {
    deviceId: number;
    attemptNumber: number;
}

export type MqttRequestJobData = {
    tid: string;
    action: string;
    msgType: number;
    payload: Record<string, any>;
    credentials: Record<string, string>;
}