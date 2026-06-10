import { DeviceIdentity, openSession } from "./index";

export interface WasmHost {
  postMessage(payload: ArrayBuffer): void;
  onMessage(handler: (payload: ArrayBuffer) => void): void;
}

export function bootstrapWasmClient(host: WasmHost, device: DeviceIdentity): void {
  const session = openSession(device, "wasm-trace", "v4");
  host.onMessage((buf) => {
    // route inbound control-channel messages
    void buf;
    void session;
  });
}
