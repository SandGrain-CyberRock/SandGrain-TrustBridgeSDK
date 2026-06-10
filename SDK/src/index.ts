export const SDK_VERSION = "3.1.0";

export interface DeviceIdentity {
  deviceId: string;
  attestationCert: string;
}

export interface Session {
  sessionId: string;
  device: DeviceIdentity;
  openedAt: number;
}

export function openSession(device: DeviceIdentity): Session {
  return {
    sessionId: `sess_${device.deviceId}_${Date.now()}`,
    device,
    openedAt: Date.now(),
  };
}
