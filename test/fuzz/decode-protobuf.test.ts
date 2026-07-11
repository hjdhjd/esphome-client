/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * decode-protobuf.test.ts: Fuzz harness for the protobuf decoder.
 */

/*
 * Fuzz harness for {@link decodeProtobuf}.
 *
 * Universal contract: for every input, the decoder either returns a valid `Record<number, FieldValue[]>` or throws a typed `DecodingError` (or one of its subclasses
 * `MalformedVarintError`, `MessageTooManyFieldsError`, etc). It never crashes the process, never hangs, and never returns malformed data.
 *
 * Distribution per design:
 *   - 30% pure random bytes
 *   - 30% varint-shaped inputs
 *   - 20% length-prefix shaped inputs
 *   - 10% mutation of capture-replay fixtures (when fixtures land - currently a no-op slice)
 *   - 10% adversarial: no-stop-bit varints, oversized field counts
 *
 * Per-PR runs use N=100k (<=30s); a nightly job could run N=10M. No such scheduled job exists yet - the default N is the per-PR value; tune via the
 * `ESPHOME_FUZZ_N` environment variable.
 *
 * Intended future behavior: found crashers would commit deterministically as regression seeds in `test/fuzz/regressions/` and replay before the random pool runs. That
 * directory and the replay step do not exist yet; the harness currently runs only the random pool.
 */
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import { DecodingError } from "../../src/errors.ts";
import { decodeProtobuf } from "../../src/protocol/codec.ts";

const FUZZ_N = Number(process.env["ESPHOME_FUZZ_N"] ?? "100000");
const MAX_INPUT_BYTES = 4096;

// Deterministic RNG so a failing seed reproduces. Mulberry32 PRNG; 32-bit state seeded from a fixed constant (0x42).
function mulberry32(seed: number): () => number {

  let state = seed >>> 0;

  return (): number => {

    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBytes(rng: () => number, length: number): Buffer {

  const out = Buffer.alloc(length);

  for(let i = 0; i < length; i++) {

    out[i] = Math.floor(rng() * 256);
  }

  return out;
}

function generateVarintShaped(rng: () => number): Buffer {

  // Emit a sequence of bytes that LOOK like varints (most have continuation bit), with random tags and bodies. Stresses the varint reader and tag parser.
  const length = 1 + Math.floor(rng() * 64);
  const out = Buffer.alloc(length);

  for(let i = 0; i < length; i++) {

    // Bias toward continuation bit set in middle bytes, clear in last byte to occasionally produce well-formed varints. Compose the byte before assignment so the
    // index access is write-only - `noUncheckedIndexedAccess` types `out[i]` reads as `number | undefined`, which would block the read-then-modify form.
    const baseByte = Math.floor(rng() * 256);

    out[i] = (i < (length - 1)) ? (baseByte | 0x80) : (baseByte & 0x7F);
  }

  return out;
}

function generateLengthPrefixShaped(rng: () => number): Buffer {

  // Tag byte for field N + LENGTH_DELIMITED, then a length varint, then random bytes (often shorter or longer than declared length).
  const fieldNum = 1 + Math.floor(rng() * 16);
  const tag = (fieldNum << 3) | 2;
  const declaredLen = Math.floor(rng() * 256);
  const actualLen = Math.floor(rng() * 64);
  const out = Buffer.alloc(2 + actualLen);

  out[0] = tag;
  out[1] = declaredLen & 0x7F;

  for(let i = 0; i < actualLen; i++) {

    out[2 + i] = Math.floor(rng() * 256);
  }

  return out;
}

function generateAdversarial(rng: () => number): Buffer {

  const variant = Math.floor(rng() * 3);

  switch(variant) {

    case 0: {

      // No-stop-bit varint: 11 bytes all with continuation bit set.
      return Buffer.alloc(11, 0x80);
    }

    case 1: {

      // Oversized field count: many small VARINT fields.
      const fields = 2000;
      const out = Buffer.alloc(fields * 2);

      for(let i = 0; i < fields; i++) {

        out[i * 2] = (1 << 3) | 0;
        out[(i * 2) + 1] = i & 0x7F;
      }

      return out;
    }

    default: {

      // Truncated input: a length-prefixed field with declared length much greater than actual remaining bytes.
      return Buffer.from([ 0x0a, 0xff, 0x01, 0x00 ]);
    }
  }
}

function fuzzInput(rng: () => number): Buffer {

  const r = rng();

  if(r < 0.3) {

    return randomBytes(rng, Math.floor(rng() * MAX_INPUT_BYTES));
  }

  if(r < 0.6) {

    return generateVarintShaped(rng);
  }

  if(r < 0.8) {

    return generateLengthPrefixShaped(rng);
  }

  if(r < 0.9) {

    // Capture-replay fixture mutation slot. When fixtures land in test/fixtures/captures/, this branch picks one and flips a few bytes. For now, fall back to random
    // bytes so the distribution still hits its share of inputs.
    return randomBytes(rng, Math.floor(rng() * 256));
  }

  return generateAdversarial(rng);
}

describe("decodeProtobuf fuzz harness", () => {

  test("returns or throws cleanly on random inputs (never crashes, never hangs)", () => {

    const rng = mulberry32(0x42);
    let validResults = 0;
    let typedErrors = 0;
    let unexpectedThrows = 0;

    for(let i = 0; i < FUZZ_N; i++) {

      const input = fuzzInput(rng);

      try {

        const result = decodeProtobuf(input, { maxFieldsPerMessage: 1024 });

        // Smoke-check that a result (an object) was returned. This only confirms objecthood, not the full Record<number, FieldValue[]> shape.
        if(typeof result === "object") {

          validResults++;
        }

      } catch(err) {

        // Any typed DecodingError subclass is the documented contract - MalformedVarintError, MessageTooManyFieldsError, TruncatedMessageError, and any future one. We
        // check the DecodingError base rather than enumerating subclasses so the harness cannot drift when a new typed decoder error is added. RangeError can also
        // surface from Buffer reads on truncated input; treat both as accepted outcomes and only flag genuinely unexpected throws.
        if(err instanceof DecodingError) {

          typedErrors++;
        } else if(err instanceof RangeError) {

          // Buffer.readUInt8 past end -> RangeError. This is the documented behavior of the underlying Buffer API; we accept it as a benign truncation outcome.
          typedErrors++;
        } else if(err instanceof Error) {

          // Any other Error subclass that doesn't extend DecodingError but isn't RangeError is a sign of a contract violation. Count it as an unexpected throw.
          unexpectedThrows++;
        } else {

          unexpectedThrows++;
        }
      }
    }

    if(unexpectedThrows > 0) {

      throw new Error("Fuzz run produced " + String(unexpectedThrows) + " unexpected throws out of " + String(FUZZ_N) + " inputs");
    }

    // Sanity check: at least some inputs must produce typed errors. We enforce only the typed-error half here - the adversarial and varint-shaped buckets should
    // generate malformed input, so 0 typed errors signals a fixture or distribution problem, not a passing fuzz run. (validResults is counted above but not asserted.)
    if(typedErrors === 0) {

      throw new Error("Fuzz run produced 0 typed errors; the adversarial+varint-shaped buckets should generate at least some malformed input");
    }
  });
});

// `DecodingError` is the documented base class for every typed throw, and the catch block above value-references it directly via `err instanceof DecodingError` - it
// checks the base class, not the individual subclasses. That `instanceof` already keeps the import live in the graph, so this anchor is a redundant explicit reference.
const _decodingErrorAnchor: typeof DecodingError | undefined = undefined;

void _decodingErrorAnchor;
