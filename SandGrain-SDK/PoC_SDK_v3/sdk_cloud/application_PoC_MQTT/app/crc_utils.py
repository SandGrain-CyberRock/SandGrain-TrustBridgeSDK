"""
crc_utils.py

CRC16 helper used by integrators that exchange CRC-protected fields.

Implementation:
- CRC-16/CCITT-FALSE
- Uses Python standard library (binascii.crc_hqx)
- CRC computed over UTF-8 bytes of the input string
"""

import binascii


class CRC16:
    INIT = 0xFFFF

    @staticmethod
    def calculate_bytes(data: bytes) -> int:
        return binascii.crc_hqx(data, CRC16.INIT) & 0xFFFF

    @staticmethod
    def calculate_str(value: str) -> int:
        return CRC16.calculate_bytes(value.encode("utf-8"))

    @staticmethod
    def hex_str(value: str) -> str:
        return f"{CRC16.calculate_str(value):04X}"

    @staticmethod
    def verify_str(value: str, expected_crc_hex: str) -> bool:
        exp = expected_crc_hex.strip().lower()
        if exp.startswith("0x"):
            exp = exp[2:]
        return CRC16.hex_str(value).lower() == exp
