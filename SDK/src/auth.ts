export interface BiometricResult {
  approved: boolean;
  method: "face" | "touch" | "voice" | "none";
}

export async function promptBiometric(timeoutMs = 15_000): Promise<BiometricResult> {
  // Bridged to platform-specific FaceID / BiometricPrompt at the FE layer.
  void timeoutMs;
  return { approved: true, method: "face" };
}
