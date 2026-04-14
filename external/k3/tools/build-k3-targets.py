#!/usr/bin/env python3

"""
Build K3 scanner target artifacts from a newline-delimited Bitcoin address list.

Outputs:
  - prefix.bin        2^32-bit sparse prefix bitmap (512 MiB)
  - bloom.bin         exact-mode bloom filter bitset
  - seeds.bin         little-endian uint32 murmur3 seeds
  - targets.exact     flat concatenation of raw 20-byte HASH160 records
  - stats.json        conversion statistics

Only legacy base58 P2PKH addresses are currently supported because the K3
runtime computes HASH160(pubkey) and compares directly against legacy address
payloads. P2SH / bech32 / other script or witness address types are skipped.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import mmap
import struct
from pathlib import Path


BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
BASE58_INDEX = {c: i for i, c in enumerate(BASE58_ALPHABET)}


def b58decode_check(addr: str) -> bytes:
    num = 0
    for ch in addr:
        try:
            num = num * 58 + BASE58_INDEX[ch]
        except KeyError as exc:
            raise ValueError(f"invalid base58 character: {ch!r}") from exc

    raw = num.to_bytes((num.bit_length() + 7) // 8, "big") if num else b""
    pad = len(addr) - len(addr.lstrip("1"))
    raw = b"\x00" * pad + raw

    if len(raw) < 5:
        raise ValueError("decoded payload too short")
    payload, checksum = raw[:-4], raw[-4:]
    want = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
    if checksum != want:
        raise ValueError("checksum mismatch")
    return payload


def murmur3_32(key: bytes, seed: int) -> int:
    c1 = 0xCC9E2D51
    c2 = 0x1B873593
    h1 = seed & 0xFFFFFFFF

    nblocks = len(key) // 4
    for i in range(nblocks):
        k1 = int.from_bytes(key[i * 4:(i + 1) * 4], "little")
        k1 = (k1 * c1) & 0xFFFFFFFF
        k1 = ((k1 << 15) | (k1 >> 17)) & 0xFFFFFFFF
        k1 = (k1 * c2) & 0xFFFFFFFF
        h1 ^= k1
        h1 = ((h1 << 13) | (h1 >> 19)) & 0xFFFFFFFF
        h1 = (h1 * 5 + 0xE6546B64) & 0xFFFFFFFF

    tail = key[nblocks * 4:]
    k1 = 0
    if len(tail) == 3:
        k1 ^= tail[2] << 16
    if len(tail) >= 2:
        k1 ^= tail[1] << 8
    if len(tail) >= 1:
        k1 ^= tail[0]
        k1 = (k1 * c1) & 0xFFFFFFFF
        k1 = ((k1 << 15) | (k1 >> 17)) & 0xFFFFFFFF
        k1 = (k1 * c2) & 0xFFFFFFFF
        h1 ^= k1

    h1 ^= len(key)
    h1 ^= h1 >> 16
    h1 = (h1 * 0x85EBCA6B) & 0xFFFFFFFF
    h1 ^= h1 >> 13
    h1 = (h1 * 0xC2B2AE35) & 0xFFFFFFFF
    h1 ^= h1 >> 16
    return h1 & 0xFFFFFFFF


def set_prefix_bit(mm: mmap.mmap, hash160: bytes) -> None:
    prefix32 = int.from_bytes(hash160[:4], "big")
    byte_idx = prefix32 >> 3
    bit_idx = prefix32 & 7
    current = mm[byte_idx]
    mm[byte_idx] = current | (1 << bit_idx)


def set_bloom_bit(bloom: bytearray, bits: int, hash160: bytes, seeds: list[int]) -> None:
    for seed in seeds:
        bit = murmur3_32(hash160, seed) % bits
        bloom[bit >> 3] |= 1 << (bit & 7)


def open_lines(path: Path):
    if path.suffix == ".gz":
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return path.open("rt", encoding="utf-8", errors="replace")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Address list (.txt or .txt.gz)")
    parser.add_argument("output_dir", type=Path, help="Directory for generated K3 artifacts")
    parser.add_argument("--bits", type=int, default=1 << 30, help="Bloom bit count (exact-mode, max 2^32)")
    parser.add_argument("--hashes", type=int, default=8, help="Number of Murmur3 bloom hashes")
    parser.add_argument("--seed-start", type=int, default=1, help="Starting integer seed value")
    args = parser.parse_args()

    if args.bits <= 0 or args.bits > (1 << 32):
        raise SystemExit("--bits must be in the range [1, 2^32]")
    if args.hashes <= 0:
        raise SystemExit("--hashes must be > 0")

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    seeds = list(range(args.seed_start, args.seed_start + args.hashes))
    seeds_path = output_dir / "seeds.bin"
    seeds_path.write_bytes(struct.pack(f"<{len(seeds)}I", *seeds))

    prefix_path = output_dir / "prefix.bin"
    prefix_size = 1 << 29  # 2^32 bits / 8
    with prefix_path.open("wb") as f:
        f.truncate(prefix_size)

    bloom = bytearray((args.bits + 7) // 8)
    exact_records: list[bytes] = []

    stats = {
        "total_lines": 0,
        "valid_p2pkh": 0,
        "skipped_non_p2pkh": 0,
        "invalid_lines": 0,
        "duplicate_hash160": 0,
        "bloom_bits": args.bits,
        "hash_count": args.hashes,
    }

    seen = set()

    with prefix_path.open("r+b") as prefix_file:
        with mmap.mmap(prefix_file.fileno(), prefix_size, access=mmap.ACCESS_WRITE) as mm:
            with open_lines(args.input) as infile:
                for raw_line in infile:
                    line = raw_line.strip()
                    if not line:
                        continue
                    stats["total_lines"] += 1
                    try:
                        payload = b58decode_check(line)
                    except ValueError:
                        stats["invalid_lines"] += 1
                        continue

                    # Legacy base58 P2PKH mainnet only: version 0x00 + 20-byte HASH160
                    if len(payload) != 21 or payload[0] != 0x00:
                        stats["skipped_non_p2pkh"] += 1
                        continue

                    h160 = payload[1:]
                    if h160 in seen:
                        stats["duplicate_hash160"] += 1
                        continue
                    seen.add(h160)
                    stats["valid_p2pkh"] += 1

                    exact_records.append(h160)
                    set_prefix_bit(mm, h160)
                    set_bloom_bit(bloom, args.bits, h160, seeds)

    (output_dir / "targets.exact").write_bytes(b"".join(exact_records))
    (output_dir / "bloom.bin").write_bytes(bloom)
    (output_dir / "stats.json").write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "output_dir": str(output_dir),
        "targets_exact": len(exact_records),
        "bits": args.bits,
        "hashes": args.hashes,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
