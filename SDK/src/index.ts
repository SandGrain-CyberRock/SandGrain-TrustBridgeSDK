export const SDK_VERSION = "3.4.0";
export type ProtocolVersion = "v3" | "v4";

export interface DeviceIdentity {
  deviceId: string;
  attestationCert: string;
  biometricBound: boolean;
  attestationAlg: "ed25519" | "dilithium";
}

export interface Session {
  sessionId: string;
  device: DeviceIdentity;
  openedAt: number;
  nonce: string;
  traceId: string;
  protocol: ProtocolVersion;
}

export function openSession(
  device: DeviceIdentity,
  traceId: string,
  protocol: ProtocolVersion = "v4",
): Session {
  return {
    sessionId: `sess_${device.deviceId}_${Date.now()}`,
    device,
    openedAt: Date.now(),
    nonce: cryptoNonce(),
    traceId,
    protocol,
  };
}

function cryptoNonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
