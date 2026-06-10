import { Session, DeviceIdentity, openSession } from "../../SDK/src/index";

const sessions = new Map<string, Session>();

export function acceptHandshake(device: DeviceIdentity): Session {
  const session = openSession(device);
  sessions.set(session.sessionId, session);
  return session;
}

export function dropSession(sessionId: string): void {
  sessions.delete(sessionId);
}
