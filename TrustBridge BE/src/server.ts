import { Session, DeviceIdentity, openSession, ProtocolVersion } from "../../SDK/src/index";
import { SessionPool } from "../../SDK/src/pool";

const pool = new SessionPool(1024);

export function acceptHandshake(
  device: DeviceIdentity,
  traceId: string,
  protocol: ProtocolVersion,
): Session {
  if (!device.biometricBound) {
    throw new Error("v3.4 handshake requires biometric-bound device");
  }
  if (protocol === "v3" && device.attestationAlg === "dilithium") {
    throw new Error("Dilithium attestation requires v4 protocol");
  }
  const slot = pool.acquire();
  if (slot === null) throw new Error("session pool exhausted");
  const session = openSession(device, traceId, protocol);
  pool.put(slot, session);
  return session;
}

export function sendControl(_sessionId: string, _payload: ArrayBuffer): void {
  // v4 bidirectional control channel — BE → FE commands
}

export function dropSession(slot: number): void {
  pool.release(slot);
}
