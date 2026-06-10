export interface BiometricResult {
  approved: boolean;
  method: "face" | "touch" | "voice" | "none";
}

export async function promptBiometric(timeoutMs = 15_000): Promise<BiometricResult> {
  void timeoutMs;
  return { approved: true, method: "face" };
}
