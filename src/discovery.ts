/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * discovery.ts: Pure decoders for entity-discovery payloads.
 */

import type { Entity, EntitySchema, EntityType, FieldSpec, InboundPackedBitsField, RepeatedFieldSpec, RepeatedMessageFieldSpec } from "./schemas/index.ts";
import type { EspHomeLogging, ServiceArgType, ServiceArgument, ServiceEntity } from "./types.ts";
import {
  FIXED32_FIELD_BYTES, extractFixed32Field, extractNumberField, extractStringField, extractTelemetryValue
} from "./protocol/field-extractors.ts";
import { decodePackedSint32, zigzagDecode } from "./protocol/codec.ts";
import { Buffer } from "node:buffer";
import { ConfigurationError } from "./errors.ts";
import type { FieldValue } from "./protocol/codec.ts";
import { deriveObjectId } from "./entity-id.ts";
import { messageTypeName } from "./protocol/index.ts";

/**
 * Entity discovery.
 *
 * @remarks Pure decoders for `LIST_ENTITIES_*_RESPONSE` payloads + `DEVICE_INFO_RESPONSE`. Each function takes its dependencies (logger, decoded fields, schema)
 * explicitly so the module is testable in isolation. The host class owns the state-mutation seam: it calls these decoders, then writes the results into its
 * discovery maps and emits the appropriate events.
 *
 * @module discovery
 */

/**
 * Convert a `LIST_ENTITIES_*_RESPONSE` message type into the canonical lower-cased entity-type tag. Strips the `LIST_ENTITIES_` prefix and the `_RESPONSE`
 * (or `_STATE`) suffix, then lowercases. Used both during discovery (to pick the right schema) and during telemetry (to resolve entity-type for fallback paths).
 *
 * @param type - The numeric message type.
 * @returns The lower-cased entity-type tag (e.g. `"sensor"`, `"light"`).
 */
export function getEntityTypeLabel(type: number): EntityType {

  return messageTypeName(type).replace(/^LIST_ENTITIES_/, "").replace(/_RESPONSE$/, "").replace(/_STATE$/, "").toLowerCase() as EntityType;
}

/**
 * Extract a single scalar field from a decoded payload according to its schema spec. Dispatches to the right concrete extractor based on `fieldSpec.valueType` and
 * coerces each value to its canonical TypeScript type so consumers see the type declared in `WireFieldOutput<F>` (bool->boolean, enum/varint/sint32/fixed32->number,
 * float->number, string->string, sint32-packed->number[]).
 *
 * @param fields - The decoded protobuf field map.
 * @param fieldSpec - The schema-defined field spec.
 * @returns The extracted, coerced value, or `undefined` if the field is absent.
 */
export function extractFieldBySpec(fields: Record<number, FieldValue[]>, fieldSpec: FieldSpec): boolean | number | number[] | string | undefined {

  switch(fieldSpec.valueType) {

    case "bool": {

      // Protobuf encodes bool as 0/1 varint on the wire. We coerce here so every caller (discovery decoder, state decoder) sees a true boolean and the schema-derived
      // `WireFieldOutput<bool>` mapping to `boolean` holds at runtime.
      const raw = extractNumberField(fields, fieldSpec.fieldNumber);

      return (raw === undefined) ? undefined : (raw !== 0);
    }

    case "float":

      return extractTelemetryValue(fields, fieldSpec.fieldNumber);

    case "string":

      return extractStringField(fields, fieldSpec.fieldNumber);

    case "enum":
    case "varint":

      return extractNumberField(fields, fieldSpec.fieldNumber);

    case "sint32": {

      // A scalar sint32 field is a signed number encoded on the wire as a zigzag varint. We must zigzag-decode the raw varint or negative values would surface as large
      // positive integers, contradicting the signed-number type the schema declares. This mirrors the packed sibling (sint32-packed) and the bluetooth rssi path, so
      // every signed-int path zigzag-decodes uniformly.
      const raw = extractNumberField(fields, fieldSpec.fieldNumber);

      return (raw === undefined) ? undefined : zigzagDecode(raw);
    }

    case "fixed32":

      return extractFixed32Field(fields, fieldSpec.fieldNumber);

    case "sint32-packed": {

      // Packed `repeated sint32 [packed = true]` fields arrive as a single LENGTH_DELIMITED buffer. The codec emits the raw bytes; we run them through the zigzag-aware
      // packed decoder so consumers see the schema-declared `number[]` shape directly. An absent field returns `undefined` so downstream walkers can `continue` without
      // synthesizing an empty array.
      const raw = fields[fieldSpec.fieldNumber]?.[0];

      if(!Buffer.isBuffer(raw)) {

        return undefined;
      }

      return decodePackedSint32(raw);
    }

    default:

      return extractNumberField(fields, fieldSpec.fieldNumber);
  }
}

/**
 * Extract a repeated field as an array of scalars. Repeated fields appear multiple times with the same field number; this helper reads them in order.
 *
 * @param fields - The decoded protobuf field map.
 * @param fieldSpec - The schema-defined repeated-field spec.
 * @returns The array of extracted values, or `undefined` if the field is absent or yielded zero typed values.
 */
export function extractRepeatedField(fields: Record<number, FieldValue[]>, fieldSpec: RepeatedFieldSpec): (number | string)[] | undefined {

  const values = fields[fieldSpec.fieldNumber];

  if(!values || (values.length === 0)) {

    return undefined;
  }

  const results: (number | string)[] = [];

  for(const value of values) {

    if(fieldSpec.valueType === "string") {

      if(Buffer.isBuffer(value)) {

        results.push(value.toString("utf8"));
      }

    } else if(typeof value === "number") {

      results.push(value);
    }
  }

  return (results.length > 0) ? results : undefined;
}

/**
 * Extract a repeated nested-message field as an array of structured records. Each occurrence of the parent field number on the wire is a length-delimited buffer that
 * carries its own protobuf sub-message; we decode each via the supplied `decodeNested` closure and project the inner scalar fields through {@link extractFieldBySpec}.
 * Enum-typed inner fields surface as raw numbers; the schema-derived consumer-facing type narrows them via the spec's nested `enumMappings`.
 *
 * @param fields - The decoded protobuf field map of the outer message.
 * @param fieldSpec - The schema-defined repeated-message-field spec.
 * @param decodeNested - Callback that decodes a single nested message buffer into its own field map.
 * @returns The array of structured records, or `undefined` when the wire carries no occurrences of this field.
 */
export function extractRepeatedMessageField(fields: Record<number, FieldValue[]>, fieldSpec: RepeatedMessageFieldSpec,
  decodeNested: (buffer: Buffer) => Record<number, FieldValue[]>): Record<string, unknown>[] | undefined {

  const values = fields[fieldSpec.fieldNumber];

  if(!values || (values.length === 0)) {

    return undefined;
  }

  const results: Record<string, unknown>[] = [];

  for(const value of values) {

    if(!Buffer.isBuffer(value)) {

      continue;
    }

    const subFields = decodeNested(value);
    const record: Record<string, unknown> = {};

    for(const [ subFieldName, subFieldSpec ] of Object.entries(fieldSpec.fields)) {

      const subValue = extractFieldBySpec(subFields, subFieldSpec);

      if(subValue !== undefined) {

        record[subFieldName] = subValue;
      }
    }

    results.push(record);
  }

  return (results.length > 0) ? results : undefined;
}

/**
 * Options for {@link decodeEntityFromSchema}.
 *
 * @remarks Aggregated into a single options object so the call site reads as a named-argument invocation. `decodeNested` is structurally optional - schemas that do
 * not declare `repeatedMessageFields` work without it. When a schema declares `repeatedMessageFields` and the callback is absent, the decoder throws
 * {@link ConfigurationError} so misconfiguration surfaces loudly rather than silently dropping the field.
 */
export interface DecodeEntityOptions {

  /**
   * Optional callback that decodes a single nested protobuf message buffer into its own field map. Required at runtime if the schema declares
   * `repeatedMessageFields`; the host wires this through as a closure over its main `decodeProtobuf` so the bounded-fields cap propagates uniformly.
   */
  decodeNested?: (buffer: Buffer) => Record<number, FieldValue[]>;

  /**
   * The lower-cased entity-type tag (matches {@link getEntityTypeLabel}).
   */
  entityType: EntityType;

  /**
   * The decoded protobuf field map.
   */
  fields: Record<number, FieldValue[]>;

  /**
   * Logger used to surface missing-required-field warnings.
   */
  log: EspHomeLogging;

  /**
   * The {@link EntitySchema} for this entity type.
   */
  schema: EntitySchema;
}

/**
 * Decode a schema's `packedBitsFields` into the target record. For each declared packed field present on the wire, each named bit is set as a boolean property on the
 * target keyed by the bit's name. Absent packed fields are skipped entirely so any pre-existing values on the target (typically set by the `fields` decoder for the
 * deprecated boolean fallbacks) survive untouched.
 *
 * @param fields - The decoded protobuf field map.
 * @param packedBitsFields - The schema role's `packedBitsFields` record.
 * @param target - The mutable entity / state record being populated.
 */
export function decodePackedBitsFields(fields: Record<number, FieldValue[]>, packedBitsFields: Record<string, InboundPackedBitsField>, target: Record<string, unknown>):
void {

  for(const packedSpec of Object.values(packedBitsFields)) {

    const packed = extractNumberField(fields, packedSpec.fieldNumber);

    // Absent on the wire: leave any pre-existing target values alone. Present-but-zero on the wire: still iterate so each named bit gets an explicit `false` -
    // 1.14+ firmware that emits `feature_flags = 0` is the canonical signal that the device supports none of the named capabilities, and that should overwrite any
    // stale pre-deprecation boolean reads.
    if(packed === undefined) {

      continue;
    }

    for(const [ bitName, bitSpec ] of Object.entries(packedSpec.bits)) {

      target[bitName] = (packed & bitSpec.bit) !== 0;
    }
  }
}

/**
 * Decode a `LIST_ENTITIES_*_RESPONSE` payload into an {@link Entity} via the supplied schema. Extracts `key` and `name` (both required), resolves
 * `object_id` via wire-first-with-fallback (wire value when present; client-side derivation from `name` when absent), then walks every scalar and repeated-field spec
 * defined on the schema. Returns `undefined` and logs a warn line when any required field is missing.
 *
 * @remarks Wire-first-with-fallback is the right pattern across the full ESPHome version range. Pre-1.14 firmware sends `object_id` on field 1 and we use the wire
 * value; 1.14+ firmware omits the field for clients that advertise 1.14+ (saves bytes), and we derive `object_id` from `name` via {@link deriveObjectId}. Both
 * paths produce the same value on every ESPHome firmware that follows the upstream sanitize/snake-case algorithm, so the discovery decoder never branches on
 * version - the wire's presence-or-absence is the only signal we read, and the fallback is byte-identical to what the server would have sent.
 *
 * @param options - The {@link DecodeEntityOptions} bag.
 * @returns The fully populated {@link Entity}, or `undefined` if required fields are absent.
 */
export function decodeEntityFromSchema(options: DecodeEntityOptions): Entity | undefined {

  const { decodeNested, entityType, fields, log, schema } = options;
  const listSchema = schema.listEntities;
  const key = extractFixed32Field(fields, listSchema.keyFieldNumber);
  const name = extractStringField(fields, listSchema.nameFieldNumber);

  // Empty-string names are wire-present but functionally equivalent to missing - both produce an empty objectId (`deriveObjectId("")` returns ""), which would mint an
  // invalid entity id like "light-" that breaks every downstream lookup. We treat empty/whitespace-only names as missing so the failure surfaces at decode time with a
  // clear diagnostic rather than as an opaque empty-id collision later. Matches the wire reality: a device that sends an empty-string name is malformed regardless of
  // whether we read "missing" or "empty" from the wire.
  if((key === undefined) || (name === undefined) || (name.trim().length === 0)) {

    const missing = [
      key === undefined ? "key" : null,
      name === undefined ? "name" : ((name.trim().length === 0) ? "name (empty)" : null)
    ].filter((label) => label !== null).join(", ");

    log.warn("Received " + entityType + " entity missing required field(s): " + missing + ".");

    return undefined;
  }

  // Wire-first-with-fallback for object_id. Pre-1.14 ESPHome firmware sends the field at the schema's `objectIdFieldNumber`; 1.14+ omits it. Both versions compute
  // the same value via `sanitize(snake_case(name))`, so deriving client-side is byte-identical to what an older device would have sent. The wire value wins when
  // present in case any firmware ever ships a non-derivable object_id.
  const wireObjectId = extractStringField(fields, listSchema.objectIdFieldNumber);
  const objectId = (wireObjectId && (wireObjectId.length > 0)) ? wireObjectId : deriveObjectId(name);

  const entity: Record<string, unknown> = {

    key,
    name,
    objectId,
    type: entityType
  };

  const deviceId = extractNumberField(fields, listSchema.deviceIdFieldNumber);

  if(deviceId !== undefined) {

    entity["deviceId"] = deviceId;
  }

  for(const [ fieldName, fieldSpec ] of Object.entries(listSchema.fields)) {

    const value = extractFieldBySpec(fields, fieldSpec);

    if(value !== undefined) {

      entity[fieldName] = value;
    }
  }

  if(listSchema.repeatedFields) {

    for(const [ fieldName, fieldSpec ] of Object.entries(listSchema.repeatedFields)) {

      const values = extractRepeatedField(fields, fieldSpec);

      if(values !== undefined) {

        entity[fieldName] = values;
      }
    }
  }

  if(listSchema.repeatedMessageFields) {

    // The decoder needs the nested-message decode callback to walk sub-message buffers. The schema declares the requirement; the host wires the closure. A schema/host
    // mismatch is a misconfiguration the consumer must fix - we surface it with a typed error rather than silently dropping the field.
    if(!decodeNested) {

      throw new ConfigurationError("decodeEntityFromSchema: schema '" + entityType + "' declares repeatedMessageFields but no decodeNested callback was supplied.");
    }

    for(const [ fieldName, fieldSpec ] of Object.entries(listSchema.repeatedMessageFields)) {

      const values = extractRepeatedMessageField(fields, fieldSpec, decodeNested);

      if(values !== undefined) {

        entity[fieldName] = values;
      }
    }
  }

  // Packed-bits fields run after the scalar `fields` decoder so that newer wire data wins over deprecated boolean fallbacks. For climate, the proto's deprecated
  // per-capability booleans (proto fields 5/6/12/22/23) decode into the same named keys as the new feature_flags bits; if the device sends both, the bits overwrite
  // because they execute last. If the device sends only the boolean (pre-1.14 firmware), the value sticks because the packed field is absent and we skip the
  // overwrite entirely.
  if(listSchema.packedBitsFields) {

    decodePackedBitsFields(fields, listSchema.packedBitsFields, entity);
  }

  // Schema-driven decoder <-> static type boundary. The decoder constructs `entity` by walking listEntities.fields, repeatedFields, and repeatedMessageFields, which
  // is exactly what EntityFor<S> derives. The cast lives at this single named boundary.
  return entity as unknown as Entity;
}

/**
 * Re-export {@link FIXED32_FIELD_BYTES}, whose canonical definition lives in `protocol/field-extractors.ts`.
 */
export { FIXED32_FIELD_BYTES };

/**
 * Options for {@link decodeServiceEntity}. Aggregated into a single options object for parity with {@link DecodeEntityOptions} - both decoders take the same shape at
 * the call site (fields + log + nested-decoder).
 */
export interface DecodeServiceEntityOptions {

  /**
   * Callback that decodes a single nested protobuf message buffer into its own field map. The service entity always carries nested `ServiceArgument` sub-messages, so
   * this callback is required (unlike {@link DecodeEntityOptions.decodeNested} which is optional).
   */
  decodeNested: (buffer: Buffer) => Record<number, FieldValue[]>;

  /**
   * The decoded protobuf field map for the outer service entity.
   */
  fields: Record<number, FieldValue[]>;

  /**
   * Logger for the missing-required-field warn lines.
   */
  log: EspHomeLogging;
}

/**
 * Decode a `LIST_ENTITIES_SERVICES_RESPONSE` payload into a {@link ServiceEntity}. Returns `undefined` (with a warn log) when required name/key fields are missing.
 *
 * @param options - The {@link DecodeServiceEntityOptions} bag.
 * @returns The decoded {@link ServiceEntity}, or `undefined` if required fields are absent.
 */
export function decodeServiceEntity(options: DecodeServiceEntityOptions): ServiceEntity | undefined {

  const { decodeNested, fields, log } = options;

  // Service entities are not entity types in the ENTITY_SCHEMAS registry (they are remotely-callable user services, not stateful entities), so this decoder reads the
  // LIST_ENTITIES_SERVICES_RESPONSE layout by literal protobuf field number rather than threading named schema constants the way decodeEntityFromSchema does. The outer
  // message carries the name on field 1, the key on field 2, and the repeated args sub-message on field 3; within each arg sub-message the name is field 1 and the
  // type is field 2.
  const name = extractStringField(fields, 1);

  if(name === undefined) {

    log.warn("Received service entity without a name.");

    return undefined;
  }

  const key = extractFixed32Field(fields, 2);

  if(key === undefined) {

    log.warn("Received service entity without a key.");

    return undefined;
  }

  const args: ServiceArgument[] = [];
  const argsFields = fields[3];

  if(argsFields && Array.isArray(argsFields)) {

    for(const argBuffer of argsFields) {

      if(Buffer.isBuffer(argBuffer)) {

        const argFields = decodeNested(argBuffer);
        const argName = extractStringField(argFields, 1);
        const argType = extractNumberField(argFields, 2);

        if((argName !== undefined) && (argType !== undefined)) {

          // The wire byte is asserted into the ServiceArgType union here. The decoder does not validate the value against the union at decode time, since the
          // ESPHome protocol does not promise field-value validation; an out-of-range value is passed through as-is and is the consumer's responsibility to handle.
          args.push({ name: argName, type: argType as ServiceArgType });
        }
      }
    }
  }

  return { args, key, name };
}
