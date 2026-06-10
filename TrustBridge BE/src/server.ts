import { Session, DeviceIdentity, openSession } from "../../SDK/src/index";
import { SessionPool } from "../../SDK/src/pool";

const pool = new SessionPool(512);

export function acceptHandshake(device: DeviceIdentity, traceId: string): Session {
  if (!device.biometricBound) {
    throw new Error("v3.3 handshake requires biometric-bound device");
  }
  const slot = pool.acquire();
  if (slot === null) throw new Error("session pool exhausted");
  const session = openSession(device, traceId);
  pool.put(slot, session);
  return session;
}

export function dropSession(slot: number): void {
  pool.release(slot);
}
