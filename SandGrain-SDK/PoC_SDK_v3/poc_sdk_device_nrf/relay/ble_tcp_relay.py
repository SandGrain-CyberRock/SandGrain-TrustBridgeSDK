"""
ble_tcp_relay.py — transparent BLE <-> TCP bridge for the SandGrain device.

The nRF54L15 board runs the real device SDK and speaks the device<->gateway
JSON protocol over a BLE Nordic UART Service (NUS) link. This relay is a dumb
byte pipe between that BLE link and the gateway's TCP server (default
127.0.0.1:8080). The gateway and cloud run unmodified.

Board -> relay (NUS TX notifications, newline-framed):
    "OPEN\n"     -> open a TCP connection to the gateway
    "CLOSE\n"    -> close the TCP connection
    "<json>\n"   -> forward the raw JSON frame (no newline) to the gateway

Gateway -> board:
    the relay re-frames the gateway's TCP byte stream into complete JSON
    objects (brace counting) and writes each, newline-terminated, to the NUS
    RX characteristic.

Requires: bleak  (pip install bleak)

Usage:
    python ble_tcp_relay.py
    python ble_tcp_relay.py --name SandGrain-Dev --host 127.0.0.1 --port 8080
"""

import argparse
import asyncio
import sys

from bleak import BleakScanner, BleakClient

# Nordic UART Service characteristic UUIDs
NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  # write:  central -> peripheral
NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  # notify: peripheral -> central

DEVICE_NAME = "SandGrain-Dev"


class Relay:
    def __init__(self, client, host, port, loop):
        self.client = client
        self.host = host
        self.port = port
        self.loop = loop
        self.from_board = asyncio.Queue()
        self.gw_reader = None
        self.gw_writer = None
        self.gw_task = None
        self._board_buf = bytearray()

    # ---- BLE notification handler (runs in the event loop thread) ----
    def on_notify(self, _char, data):
        # Reassemble newline-framed messages coming from the board.
        self._board_buf.extend(data)
        while True:
            nl = self._board_buf.find(b"\n")
            if nl < 0:
                break
            line = bytes(self._board_buf[:nl])
            del self._board_buf[: nl + 1]
            self.from_board.put_nowait(line)

    # ---- board -> gateway pump ----
    async def pump_board(self):
        while True:
            line = await self.from_board.get()
            if line == b"OPEN":
                await self._gw_open()
            elif line == b"CLOSE":
                await self._gw_close()
            else:
                await self._gw_send(line)

    async def _gw_open(self):
        await self._gw_close()
        try:
            self.gw_reader, self.gw_writer = await asyncio.open_connection(
                self.host, self.port
            )
        except OSError as e:
            print(f"[relay] ERROR opening gateway {self.host}:{self.port}: {e}",
                  file=sys.stderr)
            return
        print(f"[relay] gateway TCP open ({self.host}:{self.port})")
        self.gw_task = asyncio.create_task(self.pump_gateway())

    async def _gw_close(self):
        if self.gw_task:
            self.gw_task.cancel()
            self.gw_task = None
        if self.gw_writer:
            try:
                self.gw_writer.close()
            except OSError:
                pass
            self.gw_writer = None
            self.gw_reader = None
            print("[relay] gateway TCP closed")

    async def _gw_send(self, json_bytes):
        if not self.gw_writer:
            print("[relay] WARN: frame from board but no gateway connection; "
                  "dropping", file=sys.stderr)
            return
        self.gw_writer.write(json_bytes)
        await self.gw_writer.drain()
        print(f"[board->gw] {json_bytes.decode('utf-8', 'replace')}")

    # ---- gateway -> board pump (brace-framed JSON) ----
    async def pump_gateway(self):
        buf = bytearray()
        depth = 0
        start = 0
        try:
            while True:
                chunk = await self.gw_reader.read(512)
                if not chunk:
                    print("[relay] gateway closed the connection")
                    return
                for b in chunk:
                    if b == 0x7B:  # '{'
                        if depth == 0:
                            start = len(buf)
                        depth += 1
                        buf.append(b)
                    elif b == 0x7D:  # '}'
                        buf.append(b)
                        if depth > 0:
                            depth -= 1
                            if depth == 0:
                                frame = bytes(buf[start:])
                                buf.clear()
                                await self._to_board(frame)
                    else:
                        if depth > 0:
                            buf.append(b)
                        # bytes outside an object (whitespace) are ignored
        except asyncio.CancelledError:
            return

    async def _to_board(self, frame):
        print(f"[gw->board] {frame.decode('utf-8', 'replace')}")
        await self.client.write_gatt_char(NUS_RX, frame + b"\n", response=False)


async def run(name, host, port):
    print(f"[relay] scanning for '{name}' ...")
    dev = await BleakScanner.find_device_by_name(name, timeout=20.0)
    if dev is None:
        print(f"[relay] device '{name}' not found — is the board advertising?",
              file=sys.stderr)
        return 1

    print(f"[relay] found {name} ({dev.address}); connecting ...")
    async with BleakClient(dev) as client:
        loop = asyncio.get_running_loop()
        relay = Relay(client, host, port, loop)
        await client.start_notify(NUS_TX, relay.on_notify)
        print("[relay] subscribed to NUS; bridging BLE <-> "
              f"{host}:{port}. Ctrl-C to stop.")
        try:
            await relay.pump_board()
        finally:
            await relay._gw_close()
            try:
                await client.stop_notify(NUS_TX)
            except Exception:
                pass
    return 0


def main():
    ap = argparse.ArgumentParser(description="BLE<->TCP relay for SandGrain device auth.")
    ap.add_argument("--name", default=DEVICE_NAME, help="advertised BLE device name")
    ap.add_argument("--host", default="127.0.0.1", help="gateway TCP host")
    ap.add_argument("--port", type=int, default=8080, help="gateway TCP port")
    args = ap.parse_args()
    try:
        return asyncio.run(run(args.name, args.host, args.port))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
