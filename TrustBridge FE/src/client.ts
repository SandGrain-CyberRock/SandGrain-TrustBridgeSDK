import { openSession, DeviceIdentity, Session, ProtocolVersion } from "../../SDK/src/index";
import { promptBiometric } from "../../SDK/src/auth";

export class TrustBridgeClient {
  private session: Session | null = null;

  async enroll(
    device: DeviceIdentity,
    traceId: string,
    protocol: ProtocolVersion = "v4",
  ): Promise<Session> {
    const bio = await promptBiometric();
    if (!bio.approved) throw new Error("biometric enrolment rejected");
    this.session = openSession({ ...device, biometricBound: true }, traceId, protocol);
    return this.session;
  }

  async publish(payload: Record<string, unknown>): Promise<void> {
    if (!this.session) throw new Error("client not enrolled");
    // streaming send with backpressure handled by the transport layer
  }

  onControlMessage(handler: (msg: ArrayBuffer) => void): void {
    // v4 bidirectional control channel — BE → FE commands
    void handler;
  }
}
