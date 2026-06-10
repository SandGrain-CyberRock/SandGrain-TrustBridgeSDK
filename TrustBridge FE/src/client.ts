import { openSession, DeviceIdentity, Session } from "../../SDK/src/index";
import { promptBiometric } from "../../SDK/src/auth";

export class TrustBridgeClient {
  private session: Session | null = null;

  async enroll(device: DeviceIdentity, traceId: string): Promise<Session> {
    const bio = await promptBiometric();
    if (!bio.approved) throw new Error("biometric enrolment rejected");
    this.session = openSession({ ...device, biometricBound: true }, traceId);
    return this.session;
  }

  async publish(payload: Record<string, unknown>): Promise<void> {
    if (!this.session) throw new Error("client not enrolled");
    // streaming send with backpressure handled by the transport layer
  }
}
