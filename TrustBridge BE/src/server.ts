import { Session, DeviceIdentity, openSession } from "../../SDK/src/index";

const sessions = new Map<string, Session>();

export function acceptHandshake(device: DeviceIdentity): Session {
  if (!device.biometricBound) {
    throw new Error("v3.2 handshake requires biometric-bound device");
  }
  const session = openSession(device);
  sessions.set(session.sessionId, session);
  return session;
}

export function dropSession(sessionId: string): void {
  sessions.delete(sessionId);
}
