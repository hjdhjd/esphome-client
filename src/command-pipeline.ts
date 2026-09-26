/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * command-pipeline.ts: Schema-driven command encoder for outbound entity commands.
 */

import type { EntitySchema, FieldSpec, HasPatternField, ValueType } from "./schemas/index.ts";
import { encodePackedSint32, encodeProtoFields, zigzagEncode } from "./protocol/codec.ts";
import { Buffer } from "node:buffer";
import type { EntityId } from "./entity-id.ts";
import type { EspHomeLogging } from "./types.ts";
import { FIXED32_FIELD_BYTES } from "./protocol/field-extractors.ts";
import type { ProtoField } from "./protocol/codec.ts";
import { WireType } from "./protocol/index.ts";

/**
 * Schema-driven command encoder.
 *
 * @remarks Pure encoders that turn a typed `command<T>` input into the wire-shaped `ProtoField[]` for the matching entity command. The host owns the dispatch seam:
 * it resolves the entity key, looks up its device_id, encodes via these helpers, then frames and sends the resulting payload.
 *
 * @module command-pipeline
 */

/**
 * Build the canonical fixed32 entity-key field for a command. The field number is sourced from the schema's `command.keyFieldNumber` slot so wire layouts that put the
 * key past field 1 (the IR/RF transmit request at id 136 uses field 2 because field 1 is `device_id`) encode correctly. Every other command schema keys the entity at
 * field 1, so the parameter default of `1` keeps call sites for those schemas simple.
 *
 * @param key - The numeric entity key resolved from the discovery registry.
 * @param fieldNumber - The protobuf field number the schema declares for the key. Defaults to `1`.
 * @returns A {@link ProtoField} ready to splice into a command field list.
 */
export function buildKeyField(key: number, fieldNumber = 1): ProtoField {

  return { fieldNumber, value: key, wireType: WireType.FIXED32 };
}

// The inclusive protobuf integer domains the command encoder writes. Varint, enum, and fixed32 fields carry uint32 values; scalar and packed sint32 fields carry int32
// values.
const INT32_MAX = 0x7FFFFFFF;
const INT32_MIN = -0x80000000;
const UINT32_MAX = 0xFFFFFFFF;

/**
 * Test whether a value is a safe integer within an inclusive range.
 *
 * @param value - The raw value supplied by the caller.
 * @param min - The inclusive lower bound.
 * @param max - The inclusive upper bound.
 * @returns `true` when `value` is a safe integer in `[min, max]`.
 */
function isIntegerInRange(value: unknown, min: number, max: number): boolean {

  return (typeof value === "number") && Number.isSafeInteger(value) && (value >= min) && (value <= max);
}

/**
 * Test whether a value is a safe integer in the int32 range, the domain of a scalar sint32 field and of every element in a packed sint32 array.
 *
 * @param value - The raw value supplied by the caller.
 * @returns `true` when `value` is a safe integer in the int32 range.
 */
function isInt32(value: unknown): boolean {

  return isIntegerInRange(value, INT32_MIN, INT32_MAX);
}

/**
 * Test whether a command value fits the integer domain its schema value type encodes. {@link encodeEntityCommand} consults this for every field before encoding it, so
 * a value the wire cannot carry is refused as `value_out_of_range` rather than wrapped by the 32-bit varint and zigzag encoders or thrown by the fixed32 writer.
 *
 * @remarks Varint, enum, and fixed32 values must be safe integers in the uint32 range; scalar sint32 values must be safe integers in the int32 range; a packed sint32
 * array must hold only such values. Booleans, floats, and strings carry no integer domain and always pass.
 *
 * @param valueType - The schema value type of the field being encoded.
 * @param value - The raw value supplied by the caller.
 * @returns `true` when the value is encodable for its value type.
 * @internal
 */
export function isValueInRange(valueType: ValueType, value: unknown): boolean {

  switch(valueType) {

    case "enum":
    case "fixed32":
    case "varint":

      return isIntegerInRange(value, 0, UINT32_MAX);

    case "sint32":

      return isInt32(value);

    case "sint32-packed":

      return Array.isArray(value) && value.every((element: unknown): boolean => isInt32(element));

    case "bool":
    case "float":
    case "string":

      return true;
  }
}

/**
 * Encode a single scalar/buffer value for a command field according to its schema spec. Returns either a number (for varint shapes) or a Buffer (for length-delimited
 * and fixed32 shapes), matching the {@link ProtoField.value} tag.
 *
 * @remarks Integer value types expect a value {@link isValueInRange} accepts. {@link encodeEntityCommand} validates every field through that predicate before calling
 * here, so this encoder never sees an integer the wire cannot carry and does not throw for validated input.
 *
 * @param value - The raw value supplied by the caller.
 * @param spec - The schema spec ({@link FieldSpec} or {@link HasPatternField}) used to pick the encoder.
 * @returns The encoded value.
 */
export function encodeFieldValue(value: unknown, spec: FieldSpec | HasPatternField): number | Buffer {

  switch(spec.valueType) {

    case "bool":

      return (value as boolean) ? 1 : 0;

    case "enum":
    case "varint":

      return value as number;

    case "sint32":

      // A scalar sint32 field is a signed number; protobuf encodes it via zigzag so small-magnitude negatives stay compact on the wire. We must zigzag-encode here rather
      // than pass the raw signed number through, or the value would be written as a 10-byte two's-complement varint and decode wrong. Mirror of the decode path and the
      // packed sibling (sint32-packed), both of which already zigzag.
      return zigzagEncode(value as number);

    case "float": {

      const buf = Buffer.alloc(FIXED32_FIELD_BYTES);

      buf.writeFloatLE(value as number, 0);

      return buf;
    }

    case "fixed32": {

      const buf = Buffer.alloc(FIXED32_FIELD_BYTES);

      buf.writeUInt32LE(value as number, 0);

      return buf;
    }

    case "sint32-packed":

      // Packed `repeated sint32 [packed = true]` fields write the entire array as one LENGTH_DELIMITED body of back-to-back zigzag-encoded varints. Mirror of the decoder
      // path; consumers supply a plain `number[]` and the encoder hides the wire-format detail.
      return encodePackedSint32(value as readonly number[]);

    case "string":

      return Buffer.from(value as string, "utf8");

    default:

      return value as number;
  }
}

/**
 * Result of a successful schema-driven command encode. The host writes `payload` into the `messageType` framing slot.
 */
export interface EncodedCommand {

  readonly messageType: number;
  readonly payload: Buffer;
}

/**
 * Reasons {@link encodeEntityCommand} can refuse to encode. The host translates these into log lines + drop semantics.
 */
export type EncodeFailureReason = "command_unsupported" | "enum_value_unknown" | "key_not_found" | "schema_unknown" | "value_out_of_range";

/**
 * Result tag: a successful encode carries the framed payload; a failure carries a structured reason that the host decodes into a debug-level log line. The
 * optional `detail` carries human-readable context for reasons that need it (the offending field + value for `enum_value_unknown` and `value_out_of_range`, plus the
 * element index when the rejected value is a packed array).
 */
export type EncodeResult =
  | { readonly ok: true; readonly value: EncodedCommand; readonly processedKeys: ReadonlySet<string>; readonly entityType: string } |
  { readonly ok: false; readonly reason: EncodeFailureReason; readonly detail?: string };

/**
 * Inputs for {@link encodeEntityCommand}. The host supplies its discovery-time lookups (entity key, device_id) and a per-instance schema resolver so the encoder
 * remains pure - extras-registered entity types resolve through the same code path as built-ins.
 */
export interface EncodeEntityCommandInput {

  readonly deviceId: number | undefined;
  readonly id: EntityId;
  readonly key: number | undefined;
  readonly options: Record<string, unknown>;

  /**
   * Per-instance entity-type to schema resolver. The host wires this to {@link getSchemaIn} closed over its per-instance
   * {@link SchemasTable} so an extras-registered entity type's command shape resolves correctly. Returns `undefined` when the entity-type
   * string is not a key of the table; the encoder translates that into a `schema_unknown` failure.
   */
  readonly resolveSchema: (entityType: string) => EntitySchema | undefined;
}

/**
 * Inputs for {@link valueOutOfRange}.
 */
interface ValueOutOfRangeInput {

  /**
   * The option name of the offending field.
   */
  readonly fieldName: string;

  /**
   * The value {@link isValueInRange} rejected.
   */
  readonly value: unknown;

  /**
   * The schema value type of the offending field, which decides whether the detail names a single packed element.
   */
  readonly valueType: ValueType;
}

/**
 * Build the `value_out_of_range` refusal for a field whose value {@link isValueInRange} rejected, in the detail voice of the `enum_value_unknown` refusal.
 *
 * @remarks A packed sint32 array is described by its first offending element and that element's index rather than by the whole array, so a long timings list keeps
 * the warn line short and points at the value to correct. Every other value is quoted whole.
 *
 * @param input - The {@link ValueOutOfRangeInput} bag.
 * @returns The failure record {@link encodeEntityCommand} returns.
 */
function valueOutOfRange(input: ValueOutOfRangeInput): EncodeResult {

  const { fieldName, value, valueType } = input;
  const prefix = "field '" + fieldName + "' received out-of-range value '";

  if((valueType === "sint32-packed") && Array.isArray(value)) {

    const index = value.findIndex((element: unknown): boolean => !isInt32(element));

    return { detail: prefix + String(value[index]) + "' at index " + String(index), ok: false, reason: "value_out_of_range" };
  }

  return { detail: prefix + String(value) + "'", ok: false, reason: "value_out_of_range" };
}

/**
 * Schema-driven command encoder. Looks up the entity schema, applies the schema's enum mappings to translate string aliases into protocol numbers, encodes every
 * declared scalar and has-pattern field, attaches the optional device_id, and returns the framed payload paired with the command's wire message type.
 *
 * Returns a structured failure result when the entity type or key cannot be resolved, when the entity type does not declare a command schema, or when a field value is
 * an unknown enum alias or falls outside its value type's integer domain; the host's caller interprets failures into log lines without throwing.
 *
 * @param input - Encoder inputs (entity key, device_id, branded id, raw options).
 * @returns A success record carrying the framed payload + the key set the encoder consumed, or a failure record carrying the reason.
 */
export function encodeEntityCommand(input: EncodeEntityCommandInput): EncodeResult {

  const { deviceId, id, key, options, resolveSchema } = input;

  // Pull the entity type out of the branded id's prefix. Trust the brand because the type system enforced it upstream; malformed ids are caller-side bugs.
  const dash = id.indexOf("-");

  if(dash <= 0) {

    return { ok: false, reason: "schema_unknown" };
  }

  const entityType = id.slice(0, dash);
  const schema: EntitySchema | undefined = resolveSchema(entityType);

  if(!schema) {

    return { ok: false, reason: "schema_unknown" };
  }

  if(!schema.command) {

    return { ok: false, reason: "command_unsupported" };
  }

  if(key === undefined) {

    return { ok: false, reason: "key_not_found" };
  }

  const commandSchema = schema.command;

  // Apply enum mappings to transform string values to protocol enum numbers (so callers can write "heat" instead of `3`). The clone is lazy: only a handful of command
  // schemas declare enumMappings, so when none are present we read the caller's options directly rather than allocating a throwaway copy that is never written. The
  // remapping below writes only to the clone, so the caller's object is never mutated on either branch.
  let transformedOptions: Record<string, unknown> = options;

  if(commandSchema.enumMappings) {

    transformedOptions = { ...options };

    for(const [ fieldName, mapping ] of Object.entries(commandSchema.enumMappings)) {

      const value = transformedOptions[fieldName];

      if(typeof value === "string") {

        // A string supplied for an enum-mapped field MUST be a known alias. An unknown alias - a typo, or a runtime-derived / cast / widened string the typed API could
        // not reject at compile time - would otherwise fall through unmapped and be coerced to wire value 0 by encodeVarint. Because 0 is "off" for climate.mode and
        // water_heater.mode, the device would be silently commanded into the wrong (often OFF) state. The SSOT encoder fails closed here rather than corrupting the
        // command on the wire; a numeric value (the caller passed the protocol number directly) is left untouched.
        if(!(value in mapping)) {

          return { detail: "field '" + fieldName + "' received unknown enum value '" + value + "'", ok: false, reason: "enum_value_unknown" };
        }

        transformedOptions[fieldName] = mapping[value];
      }
    }
  }

  const fields: ProtoField[] = [buildKeyField(key, commandSchema.keyFieldNumber)];
  const processedKeys = new Set<string>();

  // Process regular fields (non-has-pattern).
  for(const [ optionName, fieldSpec ] of Object.entries(commandSchema.fields)) {

    const value = transformedOptions[optionName];

    if(value === undefined) {

      continue;
    }

    // An integer outside its value type's wire domain fails closed here, as an unknown enum alias does above, before it can reach the encoder. The has-pattern and
    // bitmask passes below apply the same check.
    if(!isValueInRange(fieldSpec.valueType, value)) {

      return valueOutOfRange({ fieldName: optionName, value, valueType: fieldSpec.valueType });
    }

    processedKeys.add(optionName);

    fields.push({

      fieldNumber: fieldSpec.fieldNumber,
      value: encodeFieldValue(value, fieldSpec),
      wireType: fieldSpec.wireType
    });
  }

  // Process has-pattern fields (the has_*/value pairs).
  for(const [ optionName, hasPatternSpec ] of Object.entries(commandSchema.hasPatternFields)) {

    const value = transformedOptions[optionName];

    if(value === undefined) {

      continue;
    }

    if(!isValueInRange(hasPatternSpec.valueType, value)) {

      return valueOutOfRange({ fieldName: optionName, value, valueType: hasPatternSpec.valueType });
    }

    processedKeys.add(optionName);

    fields.push({

      fieldNumber: hasPatternSpec.hasFieldNumber,
      value: 1,
      wireType: WireType.VARINT
    });

    fields.push({

      fieldNumber: hasPatternSpec.valueFieldNumber,
      value: encodeFieldValue(value, hasPatternSpec),
      wireType: hasPatternSpec.wireType
    });
  }

  // Process bitmask-aggregated has-flags and packed-bits fields. Both kinds contribute bits to the same has-bitmask carrier; the encoder accumulates a running mask
  // across both passes, then writes the mask once under the schema's bitmaskFieldNumber. Entities without bitmaskFields and without packedBitsFields with hasFieldBit
  // simply leave the mask at zero and skip the final emit.
  let bitmask = 0;

  if(commandSchema.bitmaskFields) {

    for(const [ optionName, bitmaskSpec ] of Object.entries(commandSchema.bitmaskFields)) {

      const value = transformedOptions[optionName];

      if(value === undefined) {

        continue;
      }

      if(!isValueInRange(bitmaskSpec.valueType, value)) {

        return valueOutOfRange({ fieldName: optionName, value, valueType: bitmaskSpec.valueType });
      }

      processedKeys.add(optionName);
      bitmask |= bitmaskSpec.bit;

      fields.push({

        fieldNumber: bitmaskSpec.fieldNumber,
        value: encodeFieldValue(value, bitmaskSpec),
        wireType: bitmaskSpec.wireType
      });
    }
  }

  // Process packed-bits fields. Each named bit within a packed-bits field is a consumer-facing boolean; touching any named bit (true OR false) ORs the bit into the
  // packed field's accumulator AND OR-s the bit's optional `hasFieldBit` into the role's has-bitmask carrier. `true` sets the bit in the packed field, `false` leaves
  // it clear, neither omits the field once any bit is touched - the firmware needs the packed field present to read the explicit-false bits.
  if(commandSchema.packedBitsFields) {

    for(const packedSpec of Object.values(commandSchema.packedBitsFields)) {

      let packedValue = 0;
      let touched = false;

      for(const [ bitName, bitSpec ] of Object.entries(packedSpec.bits)) {

        const value = transformedOptions[bitName];

        if(typeof value !== "boolean") {

          continue;
        }

        touched = true;
        processedKeys.add(bitName);

        if(value) {

          packedValue |= bitSpec.bit;
        }

        if(bitSpec.hasFieldBit !== undefined) {

          bitmask |= bitSpec.hasFieldBit;
        }
      }

      if(touched) {

        fields.push({

          fieldNumber: packedSpec.fieldNumber,
          value: packedValue,
          wireType: packedSpec.wireType
        });
      }
    }
  }

  // Emit the accumulated has-bitmask carrier once, after both bitmaskFields and packedBitsFields have contributed.
  if((commandSchema.bitmaskFieldNumber !== undefined) && (bitmask !== 0)) {

    fields.push({

      fieldNumber: commandSchema.bitmaskFieldNumber,
      value: bitmask,
      wireType: WireType.VARINT
    });
  }

  // Attach device_id when the host knows one for this entity. The schema declares the field number; absent device-id means a zero or `0` lookup, which we omit.
  if((deviceId !== undefined) && (commandSchema.deviceIdFieldNumber > 0)) {

    fields.push({

      fieldNumber: commandSchema.deviceIdFieldNumber,
      value: deviceId,
      wireType: WireType.VARINT
    });
  }

  return {

    entityType,
    ok: true,
    processedKeys,
    value: {

      messageType: commandSchema.messageType,
      payload: encodeProtoFields(fields)
    }
  };
}

/**
 * Options for {@link reportUnrecognizedOptions}.
 */
export interface ReportUnrecognizedOptionsInput {

  /**
   * The entity type label, used in the warn message.
   */
  entityType: string;

  /**
   * Logger used to emit the debug-level warning.
   */
  log: EspHomeLogging;

  /**
   * The original options object the caller passed to `command<T>`.
   */
  options: Record<string, unknown>;

  /**
   * The set of keys the encoder consumed.
   */
  processedKeys: ReadonlySet<string>;
}

/**
 * Helper that lets the host log unrecognized option keys after a successful encode. Walks the original option keys; anything not in the encoder's processedKeys set
 * is reported through the supplied logger at debug level.
 *
 * @param input - The {@link ReportUnrecognizedOptionsInput} bag.
 */
export function reportUnrecognizedOptions(input: ReportUnrecognizedOptionsInput): void {

  const { entityType, log, options, processedKeys } = input;

  for(const optionKey of Object.keys(options)) {

    if(!processedKeys.has(optionKey)) {

      log.debug("sendEntityCommand: unrecognized option '" + optionKey + "' for entity type '" + entityType + "' (ignored).");
    }
  }
}
