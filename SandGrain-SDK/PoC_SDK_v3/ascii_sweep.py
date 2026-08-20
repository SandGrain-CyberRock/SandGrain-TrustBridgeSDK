#!/usr/bin/env python3
"""
ascii_sweep.py - force the portable SDK sources to plain 7-bit ASCII.

Why this exists
---------------
sdk_fw is compiled for the embedded targets (nRF54L15 over BLE, nRF9151 over
LTE) as well as the PC apps. Its MW_LOG/printf strings go out over a serial
console via printk, which is a byte pipe with no UTF-8 decoder on the other end:
a box-drawing rule or a checkmark arrives as mojibake and can push a line past
the log buffer. So the embedded branches keep sdk_fw ASCII-only.

The dev branch (trustbridge-0.4) does not have that constraint, so every merge
from it re-introduces non-ASCII and every merge conflicts on the same comment
lines. Run this after such a merge - and once on the dev branch itself - and the
churn stops.

Deterministic and idempotent: running it twice changes nothing, so both branches
converge on byte-identical text and future merges have nothing to fight over.
Line endings are preserved exactly (this repo's sdk_fw blobs are CRLF).

Usage
-----
    python PoC_SDK_v3/ascii_sweep.py            # sweep, report what changed
    python PoC_SDK_v3/ascii_sweep.py --check    # report only, exit 1 if dirty

Vendor files under src/utils/rs232/ are left alone: they are third-party
headers with Latin-1 Spanish comments, are only ever on an include path, and are
not compiled into any embedded target.
"""
import argparse
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
TREES = [
    os.path.join(HERE, "poc_sdk_device", "sdk_fw"),
    os.path.join(HERE, "poc_sdk_gateway", "sdk_fw"),
]
SKIP_DIRS = {"rs232"}
EXTS = (".c", ".h")

# Single-character substitutions. Chosen to match the sweep the embedded
# branches already applied, so this reproduces their text rather than inventing
# a new style.
CHAR_MAP = {
    "\u2014": "-",      # em dash
    "\u2013": "-",      # en dash
    "\u2212": "-",      # minus sign
    "\u2192": "->",     # rightwards arrow
    "\u2190": "<-",     # leftwards arrow
    "\u2194": "<->",    # left-right arrow
    "\u21d2": "=>",     # rightwards double arrow
    "\u2264": "<=",     # less-than or equal
    "\u2265": ">=",     # greater-than or equal
    "\u2260": "!=",     # not equal
    "\u2026": "...",    # ellipsis
    "\u00b7": "-",      # middle dot
    "\u2022": "*",      # bullet
    "\u00a0": " ",      # no-break space
    "\u00ab": "<<",
    "\u00bb": ">>",
    "\u201c": '"',
    "\u201d": '"',
    "\u201e": '"',
    "\u2018": "'",
    "\u2019": "'",
    "\u00b0": " deg",
    "\u00b5": "u",      # micro sign
    "\u00d7": "x",      # multiplication sign
    # Latin-1 letters that show up in vendor-derived comments.
    "\u00e1": "a", "\u00e9": "e", "\u00ed": "i", "\u00f3": "o", "\u00fa": "u",
    "\u00c1": "A", "\u00c9": "E", "\u00cd": "I", "\u00d3": "O", "\u00da": "U",
    "\u00f1": "n", "\u00d1": "N", "\u00fc": "u", "\u00dc": "U",
    "\u00e7": "c", "\u00c7": "C", "\u00e0": "a", "\u00e8": "e", "\u00ea": "e",
}

# Status glyphs are dropped outright rather than transliterated: the branches
# render "AUTH OK" not "AUTH OK [ok]". Any run of spaces left dangling before a
# closing quote or newline is cleaned up afterwards.
DROP_CHARS = "\u2714\u2713\u2716\u2718\u274c\u2705\u26a0\u2757\u2717\ufe0f\u200b\u00ad"

# Box drawing and block elements -> '-'. Applied per character so a run of N
# becomes N dashes, which keeps separator comments the same width.
BOX_RANGES = ((0x2500, 0x257F), (0x2580, 0x259F), (0x25A0, 0x25FF))


def is_box(ch):
    o = ord(ch)
    return any(lo <= o <= hi for lo, hi in BOX_RANGES)


def sweep_line(line):
    """Sweep one line. Called only for lines that actually contain non-ASCII, so
    a file with none is left byte-identical - no incidental whitespace churn."""
    out = []
    i, n = 0, len(line)
    while i < n:
        ch = line[i]
        i += 1
        if ord(ch) < 128:
            out.append(ch)
        elif ch in DROP_CHARS:
            # The glyph is gone; decide what happens to the space in front of it.
            if out and out[-1] == " ":
                nxt = line[i] if i < n else ""
                if nxt == " ":
                    # "OK <glyph> (note)" - two spaces would collapse into a
                    # gap, so swallow one and keep the other as the separator.
                    i += 1
                elif nxt in ",.;:!?)" or nxt == "":
                    # "Auth <glyph>, Claim <glyph>," - the glyph was hugging the
                    # punctuation, so the space in front of it goes too.
                    out.pop()
        elif ch in CHAR_MAP:
            out.append(CHAR_MAP[ch])
        elif is_box(ch):
            out.append("-")
        else:
            # Anything unforeseen: strip accents if we can, else '?'. Keeps the
            # function total so a stray glyph can never leave non-ASCII behind.
            d = unicodedata.normalize("NFKD", ch)
            a = "".join(c for c in d if ord(c) < 128)
            out.append(a if a else "?")
    line = "".join(out)

    return tidy_gaps("".join(out))


def tidy_gaps(line):
    """Close the gap a dropped glyph left behind.

    Dropping a checkmark from  MW_LOG("... done <glyph>")  leaves a space before
    the closing quote, so the space goes too. But the same space in prose like
    - type "6"  is meaningful, and there the quote OPENS a string rather than
    closing one. A regex cannot tell those apart, so track string state across
    the line and only strip before a quote that closes.

    Comment text is scanned the same way: in  type "6"  the opening quote is
    preceded by the space (left alone) and the closing quote by '6' (nothing to
    strip), so it survives either way.
    """
    # A glyph dropped just before a trailing newline escape leaves the space in
    # front of the \n, where the closing-quote scan below can't see it.
    line = re.sub(r"[ \t]+(?=\\n\")", "", line)

    out = []
    in_str = False
    i, n = 0, len(line)
    while i < n:
        ch = line[i]
        if ch == "\\" and in_str and i + 1 < n:
            out.append(ch)
            out.append(line[i + 1])     # escaped char can't close the string
            i += 2
            continue
        if ch == '"':
            if in_str:
                while out and out[-1] in " \t":
                    out.pop()           # whitespace before the closing quote
                in_str = False
            else:
                in_str = True
        out.append(ch)
        i += 1
    return re.sub(r"[ \t]+$", "", "".join(out))


def sweep_text(text):
    """Rewrite only the lines that need it, preserving every line ending."""
    parts = re.split(r"(\r\n|\n|\r)", text)
    for i in range(0, len(parts), 2):          # even indices are line bodies
        if any(ord(c) > 127 for c in parts[i]):
            parts[i] = sweep_line(parts[i])
    return "".join(parts)


def iter_files(trees=None):
    for tree in (trees or TREES):
        if not os.path.isdir(tree):
            continue
        for root, dirs, files in os.walk(tree):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for fn in sorted(files):
                if fn.endswith(EXTS):
                    yield os.path.join(root, fn)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="report only; exit 1 if any file would change")
    ap.add_argument("trees", nargs="*",
                    help="sdk_fw trees to sweep (default: device and gateway). "
                         "Branches that keep only one tree ASCII pass it here.")
    args = ap.parse_args()

    changed = []
    for path in iter_files(args.trees):
        with open(path, "rb") as fh:
            raw = fh.read()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("latin-1")
        swept = sweep_text(text)
        new = swept.encode("ascii")
        if new != raw:
            n = sum(1 for c in text if ord(c) > 127)
            changed.append((os.path.relpath(path, HERE).replace(os.sep, "/"), n))
            if not args.check:
                with open(path, "wb") as fh:
                    fh.write(new)

    if not changed:
        print("ascii_sweep: clean - all sdk_fw sources are already 7-bit ASCII")
        return 0

    verb = "would change" if args.check else "swept"
    print(f"ascii_sweep: {verb} {len(changed)} file(s)")
    for rel, n in changed:
        print(f"  {n:5d} non-ASCII chars  {rel}")
    return 1 if args.check else 0


if __name__ == "__main__":
    sys.exit(main())
