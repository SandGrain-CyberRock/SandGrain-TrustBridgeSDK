import { openSession, DeviceIdentity, Session } from "../../SDK/src/index";

export class TrustBridgeClient {
  private session: Session | null = null;

  enroll(device: DeviceIdentity): Session {
    this.session = openSession(device);
    return this.session;
  }

  publish(payload: Record<string, unknown>): void {
    if (!this.session) throw new Error("client not enrolled");
    // wire payload onto the Sandgrain backbone
  }
}
