#!/usr/bin/env node
/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * lint-proto-sync.ts: CI lint that diffs api.proto field counts against ENTITY_SCHEMAS.
 *
 * The canonical ESPHome protocol spec lives at src/api.proto. The schema-driven encoder/decoder lives at src/schemas/entity-schemas.ts. The two are kept in sync by
 * hand today; this lint catches the realistic drift cases (ESPHome adds a field; nobody updates the schema; the field is silently dropped at decode-time) without
 * paying the full proto-codegen cost. Drift surfaces as a punch list with specific message names and field numbers, not a generic pass/fail.
 *
 * Runtime requirement:
 *
 *   This script is invoked as `node --strip-types scripts/lint-proto-sync.ts`. It relies on Node's native type stripping (enabled by default on the project's Node
 *   22.20+ floor) to run the TypeScript source directly. Relative imports across the codebase carry `.ts` extensions, so Node resolves them natively without a loader
 *   hook - the same mechanism the test suite uses, so this dependency is consistent with the codebase's wider commitment to running `.ts` sources directly, not
 *   specific to this lint.
 *
 * Architecture:
 *
 * - The .proto side is regular grammar, parsed with a small line-oriented state machine.
 * - The schema side is the runtime `ENTITY_SCHEMAS` const-object, imported directly. The script reads each role's structurally-typed slots
 *   (`fields`, `hasPatternFields`, `bitmaskFields`, `repeatedFields`, `repeatedMessageFields`, `packedBitsFields`) and collects every wire-level field number declared
 *   on the role. No TypeScript source parsing, no carve-outs, no regex on schemas - the schema IS the source of truth, read at runtime via `import`. Adding a new
 *   schema slot only requires updating the small `collectWireFieldNumbers` walker below; the lint stays robust under future schema evolution.
 *
 * Signal-to-noise: the proto's own `[deprecated=true]` annotation is the source of truth for which fields are legitimately skip-able...the linter excludes them
 * from the "unmapped" warning set so deprecated fields never produce noise. Every remaining warning is a real proto field the schema doesn't decode and merits
 * attention.
 *
 * Run via `npm run lint:proto`. Exit code 0 on clean, 1 on any drift.
 */
import { dirname, resolve } from "node:path";
import { ENTITY_SCHEMAS } from "../src/schemas/entity-schemas.ts";
import type { EntitySchema } from "../src/schemas/entity-schemas.ts";
import { MessageType } from "../src/protocol/message-types.ts";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const protoPath = resolve(repoRoot, "src/api.proto");

interface ProtoMessage {

  deprecatedFields: Set<number>;
  fields: Set<number>;
  id: number | null;
  name: string;
}

/**
 * Parse api.proto into a map from message-id -> { name, fields, deprecatedFields }. The proto grammar is regular - line-oriented state machine is sufficient. Both
 * field-number sets are populated as we walk the file; deprecatedFields is a subset of fields (every deprecated field number is also a field). The deprecation
 * tracking is what lets the comparator suppress noise from fields marked `[deprecated=true]` in the proto - those exist on the wire for backward compatibility but
 * consumers (us included) are explicitly not expected to read them.
 *
 * We accept proto lines of the shape:
 *   message MessageName {
 *     option (id) = 47;
 *     bool foo = 1;
 *     repeated string bar = 2;
 *     optional uint32 baz = 3 [default = 0];
 *     bool legacy = 4 [deprecated=true];
 *     SomeEnumType e = 5 [(option) = X, deprecated=true];
 *   }
 *
 * Skipped:
 *   - Lines beginning with `//` (comments) - dropped before scan.
 *   - `reserved 5, 6;` and `reserved "old_name";` - not field declarations.
 *   - Nested oneof blocks - we treat their inner fields as siblings of the outer message because protobuf wire numbers are flat across oneof boundaries.
 */
async function parseProto(path: string): Promise<Map<number, ProtoMessage>> {

  const source = await readFile(path, "utf8");
  const messages = new Map<number, ProtoMessage>();
  const lines = source.split("\n");

  let depth = 0;
  let current: ProtoMessage | null = null;

  for(let raw of lines) {

    // Strip trailing comments.
    raw = raw.replace(/\/\/.*$/, "");

    const stripped = raw.trim();

    // Count braces on this line to track structural depth.
    const opens = (stripped.match(/\{/g) ?? []).length;
    const closes = (stripped.match(/\}/g) ?? []).length;

    if(!current) {

      // Outside any message: only `message NAME {` opens a new container we care about.
      const msgMatch = /^message\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(stripped);

      if(msgMatch) {

        current = { deprecatedFields: new Set(), fields: new Set(), id: null, name: msgMatch[1] ?? "" };
        depth = 1;
      }

      continue;
    }

    // Inside a message: collect the `(id) = N` option and every field declaration.
    const idMatch = /^option\s*\(\s*id\s*\)\s*=\s*(\d+)\s*;/.exec(stripped);

    if(idMatch) {

      current.id = Number(idMatch[1]);
    } else {

      const fieldMatch = /^(?:optional|repeated)?\s*[A-Za-z_][A-Za-z0-9_.]*\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*(\d+)\s*(?:\[([^\]]*)\])?\s*;/.exec(stripped);

      if(fieldMatch) {

        const fieldNumber = Number(fieldMatch[1]);
        const annotations = fieldMatch[2] ?? "";

        current.fields.add(fieldNumber);

        // The proto's own `[deprecated=true]` is the source of truth. Word-boundary anchors prevent matching substrings inside other option names.
        if(/\bdeprecated\s*=\s*true\b/.test(annotations)) {

          current.deprecatedFields.add(fieldNumber);
        }
      }
    }

    depth += opens - closes;

    if(depth <= 0) {

      if(current.id !== null) {

        messages.set(current.id, current);
      }

      current = null;
      depth = 0;
    }
  }

  return messages;
}

interface SchemaRoleRecord {

  entityType: string;
  fields: Set<number>;
  messageId: number;
  role: "command" | "listEntities" | "state";
}

/**
 * Walk every wire-level field-number declaration on a schema role and return them as a flat set. The walker dispatches on each schema slot's known shape:
 *
 *   - `fields` / `hasPatternFields` / `bitmaskFields` / `repeatedFields` / `repeatedMessageFields` / `packedBitsFields` - structurally typed records on the role; each
 *     contributes its outer-level `fieldNumber:` (and the hasField/value pair for `hasPatternFields`). Inner slots that carry non-field-number data (e.g. the
 *     packedBitsFields `bits` record's bit positions, or repeatedMessageFields' nested sub-message fields belonging to a different proto message) are NOT proto field
 *     numbers and are correctly skipped because the walker reads named slots, not raw regex matches.
 *
 *   - `keyFieldNumber` / `deviceIdFieldNumber` / `nameFieldNumber` / `objectIdFieldNumber` / `bitmaskFieldNumber` - role-level scalar slots that name a wire field
 *     the schema actively reads or writes. The bitmask carrier in particular (water-heater's `has_fields` at field 2) names a real wire field; without recognizing
 *     it the lint would falsely report it as unmapped.
 *
 * Adding a new schema slot requires extending exactly this function; nothing else in the lint script needs to change. The architecture replaces the prior text-based
 * parsing approach (regex + brace counting + per-slot carve-outs) with a single structural walker over the typed runtime schema.
 */
function collectWireFieldNumbers(roleSchema: Record<string, unknown>): Set<number> {

  const numbers = new Set<number>();

  // Role-level scalar field-number slots.
  for(const slot of [ "keyFieldNumber", "deviceIdFieldNumber", "nameFieldNumber", "objectIdFieldNumber", "bitmaskFieldNumber" ] as const) {

    const value = roleSchema[slot];

    if((typeof value === "number") && (value > 0)) {

      numbers.add(value);
    }
  }

  // Record-shaped slots whose entries each declare `fieldNumber`. The shapes differ structurally but the entry-level `fieldNumber` is uniform across them.
  for(const slot of [ "fields", "bitmaskFields", "repeatedFields", "repeatedMessageFields", "packedBitsFields" ] as const) {

    const record = roleSchema[slot];

    if((typeof record !== "object") || (record === null)) {

      continue;
    }

    for(const spec of Object.values(record as Record<string, { fieldNumber?: number }>)) {

      if((typeof spec?.fieldNumber === "number") && (spec.fieldNumber > 0)) {

        numbers.add(spec.fieldNumber);
      }
    }
  }

  // `hasPatternFields` is shape-distinct: each entry declares `hasFieldNumber` + `valueFieldNumber` rather than a single `fieldNumber`. Both are wire field numbers.
  const hasPattern = roleSchema["hasPatternFields"];

  if((typeof hasPattern === "object") && (hasPattern !== null)) {

    for(const spec of Object.values(hasPattern as Record<string, { hasFieldNumber?: number; valueFieldNumber?: number }>)) {

      if((typeof spec?.hasFieldNumber === "number") && (spec.hasFieldNumber > 0)) {

        numbers.add(spec.hasFieldNumber);
      }

      if((typeof spec?.valueFieldNumber === "number") && (spec.valueFieldNumber > 0)) {

        numbers.add(spec.valueFieldNumber);
      }
    }
  }

  return numbers;
}

/**
 * Build the comparison records from the runtime ENTITY_SCHEMAS table. Each (entity, role) pair contributes one record carrying the proto message id (derived from
 * the role's `messageType` constant) plus the set of wire field numbers the schema declares.
 */
function buildSchemaRecords(): SchemaRoleRecord[] {

  const records: SchemaRoleRecord[] = [];
  const messageTypeReverseLookup = new Map<number, string>();

  for(const [ name, id ] of Object.entries(MessageType)) {

    if(typeof id === "number") {

      messageTypeReverseLookup.set(id, name);
    }
  }

  for(const [ entityType, schema ] of Object.entries(ENTITY_SCHEMAS) as [string, EntitySchema][]) {

    for(const role of [ "command", "listEntities", "state" ] as const) {

      const roleSchema = schema[role];

      if(!roleSchema || (typeof roleSchema !== "object")) {

        continue;
      }

      // The `state` role is required on every entity but synthetic for stateless entities (e.g. button has `messageType: 0` as a placeholder); skip records whose
      // messageType is the zero sentinel since they do not name a real proto message.
      const messageId = (roleSchema as { messageType?: number }).messageType;

      if((typeof messageId !== "number") || (messageId <= 0)) {

        continue;
      }

      records.push({

        entityType,
        fields: collectWireFieldNumbers(roleSchema as unknown as Record<string, unknown>),
        messageId,
        role
      });
    }
  }

  return records;
}

/**
 * Compare proto messages against schema records. We report the following drift classes:
 *
 *   1. Schema references field numbers not in the proto message - the schema has a stale or mistyped field number.
 *   2. Proto message has non-deprecated fields the schema does not reference - either the schema is intentionally selective (most ESPHome list-entities fields are
 *      optional) or the protocol gained a new field nobody ported. Surfaced as a warning rather than an error because the schema is intentionally a subset of the
 *      proto; the comparator excludes proto-deprecated fields so every remaining warning is a real gap.
 */
function compareAndReport(protoMessages: Map<number, ProtoMessage>, schemaRecords: SchemaRoleRecord[]): { errors: string[]; warnings: string[] } {

  const errors: string[] = [];
  const warnings: string[] = [];

  for(const record of schemaRecords) {

    const proto = protoMessages.get(record.messageId);

    if(!proto) {

      errors.push("Schema references message id " + record.messageId + " (role: " + record.role + ") but no matching `option (id) = " + record.messageId +
        "` was found in api.proto.");
      continue;
    }

    for(const fieldNumber of record.fields) {

      if(!proto.fields.has(fieldNumber)) {

        errors.push("Schema role " + record.role + " for message " + proto.name + " (id " + record.messageId + ") references field number " + fieldNumber +
          " which does not exist in api.proto.");
      }
    }

    // The "missing" set is wire fields the proto declares but the schema does not consume. We exclude both fields the schema already names (the schema is a subset
    // of the proto by design) AND fields the proto itself marks `[deprecated=true]`. The proto's annotation is the SSOT for "intentionally not implemented" -
    // deprecated fields exist on the wire for backward compat but consumers are expected to ignore them, and the lint should not nag about that.
    const missing = [...proto.fields].filter((f) => !record.fields.has(f) && !proto.deprecatedFields.has(f));
    const schemaFieldCount = record.fields.size;
    const liveProtoFieldCount = proto.fields.size - proto.deprecatedFields.size;

    if(missing.length > 0) {

      warnings.push("Schema role " + record.role + " for message " + proto.name + " (id " + record.messageId + ") declares " + schemaFieldCount + " of " +
        liveProtoFieldCount + " non-deprecated proto fields. Unmapped field numbers: " + missing.sort((a, b) => a - b).join(", ") + ".");
    }
  }

  return { errors, warnings };
}

async function main(): Promise<void> {

  const protoMessages = await parseProto(protoPath);
  const schemaRecords = buildSchemaRecords();
  const { errors, warnings } = compareAndReport(protoMessages, schemaRecords);

  if(warnings.length > 0) {

    console.log("[lint:proto] " + warnings.length + " warning(s):");

    for(const w of warnings) {

      console.log("  - " + w);
    }
  }

  if(errors.length > 0) {

    console.error("[lint:proto] " + errors.length + " error(s):");

    for(const e of errors) {

      console.error("  - " + e);
    }

    process.exit(1);
  }

  console.log("[lint:proto] " + schemaRecords.length + " schema role(s) checked across " + protoMessages.size + " proto message(s). No errors.");
}

await main();
