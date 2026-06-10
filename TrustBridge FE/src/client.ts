import { openSession, DeviceIdentity, Session } from "../../SDK/src/index";
import { promptBiometric } from "../../SDK/src/auth";

export class TrustBridgeClient {
  private session: Session | null = null;

  async enroll(device: DeviceIdentity): Promise<Session> {
    const bio = await promptBiometric();
    if (!bio.approved) throw new Error("biometric enrolment rejected");
    this.session = openSession({ ...device, biometricBound: true });
    return this.session;
  }

  publish(payload: Record<string, unknown>): void {
    if (!this.session) throw new Error("client not enrolled");
    // wire payload onto the Sandgrain backbone
  }
}
