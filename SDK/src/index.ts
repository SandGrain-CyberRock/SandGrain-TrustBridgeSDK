export const SDK_VERSION = "3.3.0";

export interface DeviceIdentity {
  deviceId: string;
  attestationCert: string;
  biometricBound: boolean;
}

export interface Session {
  sessionId: string;
  device: DeviceIdentity;
  openedAt: number;
  nonce: string;
  traceId: string;
}

export function openSession(device: DeviceIdentity, traceId: string): Session {
  return {
    sessionId: `sess_${device.deviceId}_${Date.now()}`,
    device,
    openedAt: Date.now(),
    nonce: cryptoNonce(),
    traceId,
  };
}

function cryptoNonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
