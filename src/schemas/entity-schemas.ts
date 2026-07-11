/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * entity-schemas.ts: Centralized entity schema definitions for ESPHome protocol.
 */

/**
 * Centralized schema definitions for every supported ESPHome entity type.
 *
 * @remarks This module provides the message type IDs, field numbers, and wire types needed to encode commands and decode state responses. By centralizing these
 * definitions, we eliminate magic numbers scattered throughout the codebase and provide a single source of truth for protocol field mappings. The canonical count
 * and identity of the supported entity types is pinned by the registry-guarantee test in `entity-schemas.test.ts`, not duplicated in narrative comments here.
 *
 * @module schemas/entity-schemas
 */

import { AlarmControlPanelState, CLIMATE_FEATURE_BITS, ClimateAction, ClimateFanMode, ClimateMode, ClimatePreset, ClimateSwingMode, ColorMode, CoverOperation,
  EntityCategory, FanDirection, LockState, MediaPlayerFormatPurpose, MediaPlayerState, NumberMode, SensorStateClass, TemperatureUnit, TextMode, ValveOperation,
  WATER_HEATER_STATE_COMMAND_BITS, WATER_HEATER_STATE_INBOUND_BITS, WaterHeaterCommandHasField, WaterHeaterMode } from "../api-constants.ts";
import { MessageType, WireType } from "../protocol/index.ts";

// Re-export WireType so consumers can import it from this module.
export { WireType };

/**
 * Value types that describe how to interpret and encode/decode field data.
 *
 * @remarks The scalar value types collapse a wire-encoded field to a single TypeScript value (number, boolean, or string). The `"sint32-packed"` variant is the lone
 * outlier - it surfaces a length-delimited body containing back-to-back zigzag-encoded varints as a `number[]` to consumers. Today only the infrared and radio-frequency
 * schemas use it (for their `timings` arrays), so the projection only needs to support `WireType.LENGTH_DELIMITED`; future packed-repeated additions slot in alongside.
 */
export type ValueType = "bool" | "enum" | "fixed32" | "float" | "sint32" | "sint32-packed" | "string" | "varint";

/**
 * Defines the wire format for a single protobuf field.
 */
export interface FieldSpec {

  fieldNumber: number;
  valueType: ValueType;
  wireType: WireType;
}

/**
 * Defines a field that uses the has_* pattern common in ESPHome commands. These fields have a boolean "has" field followed by the actual value field.
 */
export interface HasPatternField {

  hasFieldNumber: number;
  valueFieldNumber: number;
  valueType: ValueType;
  wireType: WireType;
}

/**
 * Defines a field that participates in a bitmask-aggregated has-pattern. Used by entity types where the wire format collapses every per-field "has" indicator into a
 * single uint32 bitmask field instead of emitting one boolean per option (compare {@link HasPatternField}). The encoder ORs each present option's `bit` into a running
 * mask, emits the value fields, then writes the aggregated mask under the schema's `bitmaskFieldNumber`.
 *
 * Currently used by water heater commands; reusable for any future entity that adopts the same bitmask shape.
 */
export interface BitmaskField {

  bit: number;
  fieldNumber: number;
  valueType: ValueType;
  wireType: WireType;
}

/**
 * Defines a mapping from user-friendly string values to protocol enum numbers. Used to transform string options into numeric values before encoding.
 */
export type EnumMapping = Record<string, number>;

/**
 * One named bit within an {@link InboundPackedBitsField} (state or listEntities role). Carries the bit position only; the encoder's `hasFieldBit` contribution is
 * not meaningful on inbound roles, so the type structurally excludes it.
 */
export interface InboundPackedBitSpec {

  bit: number;
}

/**
 * One named bit within a {@link CommandPackedBitsField} (command role). Adds the optional `hasFieldBit` that the encoder ORs into the role's has-bitmask carrier
 * when the consumer touches this named bit. Inbound `PackedBitSpec` deliberately omits this field so a misconfigured state/listEntities schema fails to compile
 * rather than carrying a silently-ignored slot.
 */
export interface CommandPackedBitSpec {

  bit: number;
  hasFieldBit?: number;
}

/**
 * Inbound (state / listEntities) packed-bits field. Defines a single proto uint32 wire field that packs multiple consumer-facing booleans into its bits. The decoder
 * reads the packed field and surfaces each named bit as a boolean on the entity/state object. The interface intentionally constrains its `bits` record to
 * {@link InboundPackedBitSpec} so a misplaced `hasFieldBit` (command-only) on a state or listEntities schema is a compile error rather than dead code.
 *
 * Bit semantics are sourced from the firmware enum (e.g. ESPHome's `ClimateFeatures` in `climate_mode.h`) when the proto does not enumerate them. The matching
 * named-constant in `api-constants.ts` is the SSOT for consumer-facing label names; the schema's `bits` record maps each named label to its bit position.
 */
export interface InboundPackedBitsField {

  bits: Record<string, InboundPackedBitSpec>;
  fieldNumber: number;
  wireType: WireType;
}

/**
 * Command-side packed-bits field. Mirrors {@link InboundPackedBitsField} but allows each named bit to carry an optional `hasFieldBit` that the encoder ORs into the
 * role's `bitmaskFieldNumber` (the has-bitmask carrier) when the consumer supplies the named boolean - signaling the firmware that the corresponding packed bit is
 * meaningful regardless of whether the consumer set it true or false.
 *
 * Used by the water-heater command schema today, where `awayState`/`onState` map both to bits in the packed `state` wire field (field 6) AND to the
 * `HAS_AWAY_STATE`/`HAS_ON_STATE` bits in the `has_fields` carrier (field 2).
 */
export interface CommandPackedBitsField {

  bits: Record<string, CommandPackedBitSpec>;
  fieldNumber: number;
  wireType: WireType;
}

/**
 * Defines the command message structure for an entity type.
 *
 * @remarks Three encoding pathways coexist on the same schema, picked per entity type:
 *
 * - {@link CommandSchema.fields} - plain protobuf fields, written when the consumer supplies the matching key.
 * - {@link CommandSchema.hasPatternFields} - per-field `has_*`/value pairs (climate, fan, light, cover, ...).
 * - {@link CommandSchema.bitmaskFields} + {@link CommandSchema.bitmaskFieldNumber} - bitmask-aggregated has-flags written as a single uint32 plus value fields (water
 *   heater).
 *
 * An entity type uses whichever subset of the three matches its proto definition; the schema-driven encoder in `command-pipeline.ts` walks all three on every command.
 */
export interface CommandSchema {

  bitmaskFieldNumber?: number;
  bitmaskFields?: Record<string, BitmaskField>;
  deviceIdFieldNumber: number;
  enumMappings?: Record<string, EnumMapping>;
  fields: Record<string, FieldSpec>;
  hasPatternFields: Record<string, HasPatternField>;
  keyFieldNumber: number;
  messageType: number;
  packedBitsFields?: Record<string, CommandPackedBitsField>;
}

/**
 * Defines the state response message structure for an entity type.
 *
 * @remarks `enumMappings` mirrors the {@link CommandSchema} slot of the same name on the state side. When declared, each entry maps a state-field name to a record
 * of named labels and their wire-numeric values; the schema-derived {@link StateEventFor} type narrows that field from plain `number` to the
 * literal-union of the mapping's values. Drift between the schema's mapping and the corresponding named constant in `api-constants.ts` is a type bug; the dual-write
 * is the architectural cost of the refinement and is verified by per-entity-type consistency tests in `entity-schemas.test.ts`. Forward-compat is preserved at
 * runtime - the decoder does not validate against the mapping, so wire-enum members that ESPHome adds in future releases pass through as raw numbers.
 */
export interface StateSchema {

  deviceIdFieldNumber: number;
  enumMappings?: Record<string, EnumMapping>;
  fields: Record<string, FieldSpec>;
  keyFieldNumber: number;
  messageType: number;
  packedBitsFields?: Record<string, InboundPackedBitsField>;
}

/**
 * Defines the wire format for a repeated protobuf field containing multiple values of the same type.
 */
export interface RepeatedFieldSpec {

  fieldNumber: number;
  valueType: "enum" | "string" | "varint";
  wireType: WireType;
}

/**
 * Defines the wire format for a repeated protobuf field containing multiple sub-messages of the same shape. The wire bytes for each occurrence are decoded as their own
 * protobuf message using {@link RepeatedMessageFieldSpec.fields}, and the resulting structured record is appended to the entity's surfaced array. Use this slot for
 * fields like `MediaPlayerSupportedFormat` where the proto declares `repeated <NestedMessage>` and consumers need every nested scalar exposed without re-parsing raw
 * bytes.
 *
 * `enumMappings` mirrors the same slot on the parent role: when an inner field key appears here, the schema-derived type narrows that key from plain `number` to the
 * literal-union of the mapping's numeric values, exactly as the parent-level `enumMappings` does for the outer message.
 */
export interface RepeatedMessageFieldSpec {

  enumMappings?: Record<string, EnumMapping>;
  fieldNumber: number;
  fields: Record<string, FieldSpec>;
  wireType: WireType;
}

/**
 * Defines the list entities response message structure for an entity type.
 *
 * @remarks `enumMappings` mirrors the {@link StateSchema} slot of the same name on the discovery side. When declared, each entry maps a listEntities-field name to
 * a record of named labels and their wire-numeric values; the schema-derived {@link EntityFor} type narrows that field from plain `number` (or
 * `number[]` for repeated fields) to the literal-union of the mapping's numeric values. This brings listEntities enum narrowing into parity with state-side
 * narrowing - both
 * inbound schemas now produce numeric-literal-union types for enum fields, and consumers gain compile-time exhaustiveness on discovery-side enum comparisons just
 * as they already have on state-side. Drift between a listEntities-side mapping and the corresponding named constant in `api-constants.ts` is a type bug; the
 * dual-write is verified by per-entity-type consistency tests in `entity-schemas.test.ts`. Forward-compat is preserved at runtime - the decoder reads raw numeric
 * wire values, so members ESPHome adds in future releases pass through as plain numbers.
 */
export interface ListEntitiesSchema {

  deviceIdFieldNumber: number;
  enumMappings?: Record<string, EnumMapping>;
  fields: Record<string, FieldSpec>;
  keyFieldNumber: number;
  messageType: number;
  nameFieldNumber: number;
  objectIdFieldNumber: number;
  packedBitsFields?: Record<string, InboundPackedBitsField>;
  repeatedFields?: Record<string, RepeatedFieldSpec>;
  repeatedMessageFields?: Record<string, RepeatedMessageFieldSpec>;
}

/**
 * Complete schema definition for a single entity type.
 */
export interface EntitySchema {

  command?: CommandSchema;
  listEntities: ListEntitiesSchema;
  state: StateSchema;
  type: string;
}

/**
 * Schema definitions for every supported ESPHome entity type. Each schema provides the complete field mapping for encoding commands and decoding state responses.
 *
 * The `as const satisfies` pattern serves two purposes simultaneously: `satisfies Record<string, EntitySchema>` validates at compile time that every schema conforms to
 * the EntitySchema shape, while `as const` preserves the literal types of every key, message ID, and enum mapping. This enables consumers to derive narrower types from
 * the schema (for example, `keyof typeof ENTITY_SCHEMAS` is the canonical EntityType union) without a parallel hand-maintained list that could drift.
 */
/* eslint-disable camelcase */
export const ENTITY_SCHEMAS = {

  alarm_control_panel: {

    command: {

      deviceIdFieldNumber: 4,
      enumMappings: {

        command: { arm_away: 1, arm_custom_bypass: 5, arm_home: 2, arm_night: 3, arm_vacation: 4, disarm: 0, trigger: 6 }
      },
      fields: {

        code: { fieldNumber: 3, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        command: { fieldNumber: 2, valueType: "enum", wireType: WireType.VARINT }
      },
      hasPatternFields: {},
      keyFieldNumber: 1,
      messageType: MessageType.ALARM_CONTROL_PANEL_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 11,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        requiresCode: { fieldNumber: 9, valueType: "bool", wireType: WireType.VARINT },
        requiresCodeToArm: { fieldNumber: 10, valueType: "bool", wireType: WireType.VARINT },
        supportedFeatures: { fieldNumber: 8, valueType: "varint", wireType: WireType.VARINT }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_ALARM_CONTROL_PANEL_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 3,
      enumMappings: {

        state: AlarmControlPanelState
      },
      fields: {

        state: { fieldNumber: 2, valueType: "enum", wireType: WireType.VARINT }
      },
      keyFieldNumber: 1,
      messageType: MessageType.ALARM_CONTROL_PANEL_STATE_RESPONSE
    },
    type: "alarm_control_panel"
  },

  binary_sensor: {

    listEntities: {

      deviceIdFieldNumber: 10,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        deviceClass: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        disabledByDefault: { fieldNumber: 7, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 9, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 8, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        isStatusBinarySensor: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_BINARY_SENSOR_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 4,
      fields: {

        missingState: { fieldNumber: 3, valueType: "bool", wireType: WireType.VARINT },
        state: { fieldNumber: 2, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 1,
      messageType: MessageType.BINARY_SENSOR_STATE_RESPONSE
    },
    type: "binary_sensor"
  },

  button: {

    command: {

      deviceIdFieldNumber: 2,
      fields: {},
      hasPatternFields: {},
      keyFieldNumber: 1,
      messageType: MessageType.BUTTON_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 9,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        deviceClass: { fieldNumber: 8, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_BUTTON_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      // Button has no state response - it's a stateless trigger. We use a placeholder.
      deviceIdFieldNumber: 0,
      fields: {},
      keyFieldNumber: 1,
      messageType: 0
    },
    type: "button"
  },

  camera: {

    listEntities: {

      deviceIdFieldNumber: 8,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        disabledByDefault: { fieldNumber: 5, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 6, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_CAMERA_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 4,
      fields: {

        data: { fieldNumber: 2, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        done: { fieldNumber: 3, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 1,
      messageType: MessageType.CAMERA_IMAGE_RESPONSE
    },
    type: "camera"
  },

  climate: {

    command: {

      deviceIdFieldNumber: 24,
      enumMappings: {

        fanMode: { auto: 2, diffuse: 8, focus: 7, high: 5, low: 3, medium: 4, middle: 6, off: 1, on: 0, quiet: 9 },
        mode: { auto: 6, cool: 2, dry: 5, fan_only: 4, heat: 3, heat_cool: 1, off: 0 },
        preset: { activity: 7, away: 2, boost: 3, comfort: 4, eco: 5, home: 1, none: 0, sleep: 6 },
        swingMode: { both: 1, horizontal: 3, off: 0, vertical: 2 }
      },
      fields: {},
      hasPatternFields: {

        customFanMode: { hasFieldNumber: 16, valueFieldNumber: 17, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        customPreset: { hasFieldNumber: 20, valueFieldNumber: 21, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        fanMode: { hasFieldNumber: 12, valueFieldNumber: 13, valueType: "enum", wireType: WireType.VARINT },
        mode: { hasFieldNumber: 2, valueFieldNumber: 3, valueType: "enum", wireType: WireType.VARINT },
        preset: { hasFieldNumber: 18, valueFieldNumber: 19, valueType: "enum", wireType: WireType.VARINT },
        swingMode: { hasFieldNumber: 14, valueFieldNumber: 15, valueType: "enum", wireType: WireType.VARINT },
        targetHumidity: { hasFieldNumber: 22, valueFieldNumber: 23, valueType: "float", wireType: WireType.FIXED32 },
        targetTemperature: { hasFieldNumber: 4, valueFieldNumber: 5, valueType: "float", wireType: WireType.FIXED32 },
        targetTemperatureHigh: { hasFieldNumber: 8, valueFieldNumber: 9, valueType: "float", wireType: WireType.FIXED32 },
        targetTemperatureLow: { hasFieldNumber: 6, valueFieldNumber: 7, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.CLIMATE_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 26,
      enumMappings: {

        entityCategory: EntityCategory,
        supportedFanModes: ClimateFanMode,
        supportedModes: ClimateMode,
        supportedPresets: ClimatePreset,
        supportedSwingModes: ClimateSwingMode,
        temperatureUnit: TemperatureUnit
      },
      fields: {

        disabledByDefault: { fieldNumber: 18, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 20, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 19, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        // The five per-capability deprecated booleans (proto fields 5, 6, 12, 22, 23) act as fallbacks when pre-1.14 firmware does not emit feature_flags. They share
        // their consumer-facing names with the bits declared in `packedBitsFields.featureFlags.bits` so a single typed key surfaces to consumers regardless of which
        // wire source the firmware used. The packed-bits decoder runs AFTER the fields decoder, so 1.14+ firmware that emits feature_flags wins; older firmware that
        // emits only the booleans keeps its values.
        supportsAction: { fieldNumber: 12, valueType: "bool", wireType: WireType.VARINT },
        supportsCurrentHumidity: { fieldNumber: 22, valueType: "bool", wireType: WireType.VARINT },
        supportsCurrentTemperature: { fieldNumber: 5, valueType: "bool", wireType: WireType.VARINT },
        supportsTargetHumidity: { fieldNumber: 23, valueType: "bool", wireType: WireType.VARINT },
        supportsTwoPointTargetTemperature: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        temperatureUnit: { fieldNumber: 28, valueType: "enum", wireType: WireType.VARINT },
        visualCurrentTemperatureStep: { fieldNumber: 21, valueType: "float", wireType: WireType.FIXED32 },
        visualMaxHumidity: { fieldNumber: 25, valueType: "float", wireType: WireType.FIXED32 },
        visualMaxTemperature: { fieldNumber: 9, valueType: "float", wireType: WireType.FIXED32 },
        visualMinHumidity: { fieldNumber: 24, valueType: "float", wireType: WireType.FIXED32 },
        visualMinTemperature: { fieldNumber: 8, valueType: "float", wireType: WireType.FIXED32 },
        visualTargetTemperatureStep: { fieldNumber: 10, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_CLIMATE_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1,
      // ESPHome 1.14+ packs every per-capability boolean into a single uint32 `feature_flags` field (proto field 27). The bit positions mirror the upstream firmware
      // enum `ClimateFeatures` in `esphome/components/climate/climate_mode.h`. The five deprecated boolean fields above act as fallbacks for pre-1.14 firmware; the
      // packed-bits decoder runs AFTER the scalar fields decoder, so when both sources are present (the firmware's back-compat path) the bits overwrite the
      // booleans. REQUIRES_TWO_POINT_TARGET_TEMPERATURE has no pre-1.14 boolean counterpart and only surfaces when feature_flags is present.
      packedBitsFields: {

        featureFlags: {

          bits: CLIMATE_FEATURE_BITS,
          fieldNumber: 27,
          wireType: WireType.VARINT
        }
      },
      repeatedFields: {

        supportedCustomFanModes: { fieldNumber: 15, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        supportedCustomPresets: { fieldNumber: 17, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        supportedFanModes: { fieldNumber: 13, valueType: "enum", wireType: WireType.VARINT },
        supportedModes: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        supportedPresets: { fieldNumber: 16, valueType: "enum", wireType: WireType.VARINT },
        supportedSwingModes: { fieldNumber: 14, valueType: "enum", wireType: WireType.VARINT }
      }
    },
    state: {

      deviceIdFieldNumber: 16,
      enumMappings: {

        action: ClimateAction,
        fanMode: ClimateFanMode,
        mode: ClimateMode,
        preset: ClimatePreset,
        swingMode: ClimateSwingMode
      },
      fields: {

        action: { fieldNumber: 8, valueType: "enum", wireType: WireType.VARINT },
        currentHumidity: { fieldNumber: 14, valueType: "float", wireType: WireType.FIXED32 },
        currentTemperature: { fieldNumber: 3, valueType: "float", wireType: WireType.FIXED32 },
        customFanMode: { fieldNumber: 11, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        customPreset: { fieldNumber: 13, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        fanMode: { fieldNumber: 9, valueType: "enum", wireType: WireType.VARINT },
        mode: { fieldNumber: 2, valueType: "enum", wireType: WireType.VARINT },
        preset: { fieldNumber: 12, valueType: "enum", wireType: WireType.VARINT },
        swingMode: { fieldNumber: 10, valueType: "enum", wireType: WireType.VARINT },
        targetHumidity: { fieldNumber: 15, valueType: "float", wireType: WireType.FIXED32 },
        targetTemperature: { fieldNumber: 4, valueType: "float", wireType: WireType.FIXED32 },
        targetTemperatureHigh: { fieldNumber: 6, valueType: "float", wireType: WireType.FIXED32 },
        targetTemperatureLow: { fieldNumber: 5, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.CLIMATE_STATE_RESPONSE
    },
    type: "climate"
  },

  cover: {

    command: {

      deviceIdFieldNumber: 9,
      fields: {

        stop: { fieldNumber: 8, valueType: "bool", wireType: WireType.VARINT }
      },
      hasPatternFields: {

        position: { hasFieldNumber: 4, valueFieldNumber: 5, valueType: "float", wireType: WireType.FIXED32 },
        tilt: { hasFieldNumber: 6, valueFieldNumber: 7, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.COVER_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 13,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        assumedState: { fieldNumber: 5, valueType: "bool", wireType: WireType.VARINT },
        deviceClass: { fieldNumber: 8, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        disabledByDefault: { fieldNumber: 9, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 11, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 10, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        supportsPosition: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        supportsStop: { fieldNumber: 12, valueType: "bool", wireType: WireType.VARINT },
        supportsTilt: { fieldNumber: 7, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_COVER_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 6,
      enumMappings: {

        currentOperation: CoverOperation
      },
      fields: {

        currentOperation: { fieldNumber: 5, valueType: "enum", wireType: WireType.VARINT },
        position: { fieldNumber: 3, valueType: "float", wireType: WireType.FIXED32 },
        tilt: { fieldNumber: 4, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.COVER_STATE_RESPONSE
    },
    type: "cover"
  },

  date: {

    command: {

      deviceIdFieldNumber: 5,
      fields: {

        day: { fieldNumber: 4, valueType: "varint", wireType: WireType.VARINT },
        month: { fieldNumber: 3, valueType: "varint", wireType: WireType.VARINT },
        year: { fieldNumber: 2, valueType: "varint", wireType: WireType.VARINT }
      },
      hasPatternFields: {},
      keyFieldNumber: 1,
      messageType: MessageType.DATE_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 8,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_DATE_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 6,
      fields: {

        day: { fieldNumber: 5, valueType: "varint", wireType: WireType.VARINT },
        missingState: { fieldNumber: 2, valueType: "bool", wireType: WireType.VARINT },
        month: { fieldNumber: 4, valueType: "varint", wireType: WireType.VARINT },
        year: { fieldNumber: 3, valueType: "varint", wireType: WireType.VARINT }
      },
      keyFieldNumber: 1,
      messageType: MessageType.DATE_STATE_RESPONSE
    },
    type: "date"
  },

  datetime: {

    command: {

      deviceIdFieldNumber: 3,
      fields: {

        epochSeconds: { fieldNumber: 2, valueType: "fixed32", wireType: WireType.FIXED32 }
      },
      hasPatternFields: {},
      keyFieldNumber: 1,
      messageType: MessageType.DATETIME_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 8,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_DATETIME_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 4,
      fields: {

        epochSeconds: { fieldNumber: 3, valueType: "fixed32", wireType: WireType.FIXED32 },
        missingState: { fieldNumber: 2, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 1,
      messageType: MessageType.DATETIME_STATE_RESPONSE
    },
    type: "datetime"
  },

  event: {

    listEntities: {

      deviceIdFieldNumber: 10,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        deviceClass: { fieldNumber: 8, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_EVENT_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1,
      repeatedFields: {

        eventTypes: { fieldNumber: 9, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      }
    },
    state: {

      deviceIdFieldNumber: 3,
      fields: {

        eventType: { fieldNumber: 2, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 1,
      messageType: MessageType.EVENT_RESPONSE
    },
    type: "event"
  },

  fan: {

    command: {

      deviceIdFieldNumber: 14,
      enumMappings: {

        direction: { forward: 0, reverse: 1 }
      },
      fields: {},
      hasPatternFields: {

        direction: { hasFieldNumber: 8, valueFieldNumber: 9, valueType: "enum", wireType: WireType.VARINT },
        oscillating: { hasFieldNumber: 6, valueFieldNumber: 7, valueType: "bool", wireType: WireType.VARINT },
        presetMode: { hasFieldNumber: 12, valueFieldNumber: 13, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        speedLevel: { hasFieldNumber: 10, valueFieldNumber: 11, valueType: "varint", wireType: WireType.VARINT },
        state: { hasFieldNumber: 2, valueFieldNumber: 3, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 1,
      messageType: MessageType.FAN_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 13,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        disabledByDefault: { fieldNumber: 9, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 11, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 10, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        supportedSpeedCount: { fieldNumber: 8, valueType: "varint", wireType: WireType.VARINT },
        supportsDirection: { fieldNumber: 7, valueType: "bool", wireType: WireType.VARINT },
        supportsOscillation: { fieldNumber: 5, valueType: "bool", wireType: WireType.VARINT },
        supportsSpeed: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_FAN_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1,
      repeatedFields: {

        supportedPresetModes: { fieldNumber: 12, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      }
    },
    state: {

      deviceIdFieldNumber: 8,
      enumMappings: {

        direction: FanDirection
      },
      fields: {

        direction: { fieldNumber: 5, valueType: "enum", wireType: WireType.VARINT },
        oscillating: { fieldNumber: 3, valueType: "bool", wireType: WireType.VARINT },
        presetMode: { fieldNumber: 7, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        speedLevel: { fieldNumber: 6, valueType: "varint", wireType: WireType.VARINT },
        state: { fieldNumber: 2, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 1,
      messageType: MessageType.FAN_STATE_RESPONSE
    },
    type: "fan"
  },

  infrared: {

    command: {

      // Shared with radio_frequency - the wire message (id 136 InfraredRFTransmitRawTimingsRequest) is reused for both physical layers. The schema's `type` tag
      // ("infrared" vs "radio_frequency") carries the consumer-facing distinction; the wire bytes are identical.
      deviceIdFieldNumber: 1,
      fields: {

        carrierFrequency: { fieldNumber: 3, valueType: "varint", wireType: WireType.VARINT },
        modulation:       { fieldNumber: 6, valueType: "varint", wireType: WireType.VARINT },
        repeatCount:      { fieldNumber: 4, valueType: "varint", wireType: WireType.VARINT },
        timings:          { fieldNumber: 5, valueType: "sint32-packed", wireType: WireType.LENGTH_DELIMITED }
      },
      hasPatternFields: {},
      keyFieldNumber: 2,
      messageType: MessageType.INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 7,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        capabilities:      { fieldNumber: 8, valueType: "varint", wireType: WireType.VARINT },
        disabledByDefault: { fieldNumber: 5, valueType: "bool",   wireType: WireType.VARINT },
        entityCategory:    { fieldNumber: 6, valueType: "enum",   wireType: WireType.VARINT },
        icon:              { fieldNumber: 4, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        receiverFrequency: { fieldNumber: 9, valueType: "varint", wireType: WireType.VARINT }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_INFRARED_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      // Shared receive event (id 137 InfraredRFReceiveEvent) - same wire shape for infrared and radio_frequency. handleTelemetry disambiguates the consumer-facing event
      // by consulting the registered entity's type rather than the wire message-type alone.
      deviceIdFieldNumber: 1,
      fields: {

        timings: { fieldNumber: 3, valueType: "sint32-packed", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.INFRARED_RF_RECEIVE_EVENT
    },
    type: "infrared"
  },

  light: {

    command: {

      deviceIdFieldNumber: 28,
      fields: {

        // RGB fields are handled specially - has_rgb (6) is followed by three separate value fields (r=7, g=8, b=9). The wrapper expands rgb: { r, g, b } into these
        // flat fields for encoding.
        blue: { fieldNumber: 9, valueType: "float", wireType: WireType.FIXED32 },
        green: { fieldNumber: 8, valueType: "float", wireType: WireType.FIXED32 },
        hasRgb: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        red: { fieldNumber: 7, valueType: "float", wireType: WireType.FIXED32 }
      },
      hasPatternFields: {

        brightness: { hasFieldNumber: 4, valueFieldNumber: 5, valueType: "float", wireType: WireType.FIXED32 },
        coldWhite: { hasFieldNumber: 24, valueFieldNumber: 25, valueType: "float", wireType: WireType.FIXED32 },
        colorBrightness: { hasFieldNumber: 20, valueFieldNumber: 21, valueType: "float", wireType: WireType.FIXED32 },
        colorMode: { hasFieldNumber: 22, valueFieldNumber: 23, valueType: "enum", wireType: WireType.VARINT },
        colorTemperature: { hasFieldNumber: 12, valueFieldNumber: 13, valueType: "float", wireType: WireType.FIXED32 },
        effect: { hasFieldNumber: 18, valueFieldNumber: 19, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        flashLength: { hasFieldNumber: 16, valueFieldNumber: 17, valueType: "varint", wireType: WireType.VARINT },
        state: { hasFieldNumber: 2, valueFieldNumber: 3, valueType: "bool", wireType: WireType.VARINT },
        transitionLength: { hasFieldNumber: 14, valueFieldNumber: 15, valueType: "varint", wireType: WireType.VARINT },
        warmWhite: { hasFieldNumber: 26, valueFieldNumber: 27, valueType: "float", wireType: WireType.FIXED32 },
        white: { hasFieldNumber: 10, valueFieldNumber: 11, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.LIGHT_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 16,
      enumMappings: {

        entityCategory: EntityCategory,
        supportedColorModes: ColorMode
      },
      fields: {

        disabledByDefault: { fieldNumber: 13, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 15, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 14, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        maxMireds: { fieldNumber: 10, valueType: "float", wireType: WireType.FIXED32 },
        minMireds: { fieldNumber: 9, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_LIGHT_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1,
      repeatedFields: {

        effects: { fieldNumber: 11, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        supportedColorModes: { fieldNumber: 12, valueType: "enum", wireType: WireType.VARINT }
      }
    },
    state: {

      deviceIdFieldNumber: 14,
      enumMappings: {

        colorMode: ColorMode
      },
      fields: {

        blue: { fieldNumber: 6, valueType: "float", wireType: WireType.FIXED32 },
        brightness: { fieldNumber: 3, valueType: "float", wireType: WireType.FIXED32 },
        coldWhite: { fieldNumber: 12, valueType: "float", wireType: WireType.FIXED32 },
        colorBrightness: { fieldNumber: 10, valueType: "float", wireType: WireType.FIXED32 },
        colorMode: { fieldNumber: 11, valueType: "enum", wireType: WireType.VARINT },
        colorTemperature: { fieldNumber: 8, valueType: "float", wireType: WireType.FIXED32 },
        effect: { fieldNumber: 9, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        green: { fieldNumber: 5, valueType: "float", wireType: WireType.FIXED32 },
        red: { fieldNumber: 4, valueType: "float", wireType: WireType.FIXED32 },
        state: { fieldNumber: 2, valueType: "bool", wireType: WireType.VARINT },
        warmWhite: { fieldNumber: 13, valueType: "float", wireType: WireType.FIXED32 },
        white: { fieldNumber: 7, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.LIGHT_STATE_RESPONSE
    },
    type: "light"
  },

  lock: {

    command: {

      deviceIdFieldNumber: 5,
      enumMappings: {

        command: { lock: 1, open: 2, unlock: 0 }
      },
      fields: {

        command: { fieldNumber: 2, valueType: "enum", wireType: WireType.VARINT }
      },
      hasPatternFields: {

        code: { hasFieldNumber: 3, valueFieldNumber: 4, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 1,
      messageType: MessageType.LOCK_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 12,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        assumedState: { fieldNumber: 8, valueType: "bool", wireType: WireType.VARINT },
        codeFormat: { fieldNumber: 11, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        requiresCode: { fieldNumber: 10, valueType: "bool", wireType: WireType.VARINT },
        supportsOpen: { fieldNumber: 9, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_LOCK_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 3,
      enumMappings: {

        state: LockState
      },
      fields: {

        state: { fieldNumber: 2, valueType: "enum", wireType: WireType.VARINT }
      },
      keyFieldNumber: 1,
      messageType: MessageType.LOCK_STATE_RESPONSE
    },
    type: "lock"
  },

  media_player: {

    command: {

      deviceIdFieldNumber: 10,
      fields: {},
      hasPatternFields: {

        announcement: { hasFieldNumber: 8, valueFieldNumber: 9, valueType: "bool", wireType: WireType.VARINT },
        command: { hasFieldNumber: 2, valueFieldNumber: 3, valueType: "enum", wireType: WireType.VARINT },
        mediaUrl: { hasFieldNumber: 6, valueFieldNumber: 7, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        volume: { hasFieldNumber: 4, valueFieldNumber: 5, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.MEDIA_PLAYER_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 10,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        featureFlags: { fieldNumber: 11, valueType: "varint", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        supportsPause: { fieldNumber: 8, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_MEDIA_PLAYER_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1,
      repeatedMessageFields: {

        // Each MediaPlayerSupportedFormat sub-message describes one (codec, sample rate, channels, purpose, sample-byte width) tuple the device can accept. The
        // device emits one occurrence per supported configuration; the decoder surfaces them as a structured array consumers can iterate without re-parsing bytes.
        supportedFormats: {

          enumMappings: { purpose: MediaPlayerFormatPurpose },
          fieldNumber: 9,
          fields: {

            format: { fieldNumber: 1, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
            numChannels: { fieldNumber: 3, valueType: "varint", wireType: WireType.VARINT },
            purpose: { fieldNumber: 4, valueType: "enum", wireType: WireType.VARINT },
            sampleBytes: { fieldNumber: 5, valueType: "varint", wireType: WireType.VARINT },
            sampleRate: { fieldNumber: 2, valueType: "varint", wireType: WireType.VARINT }
          },
          wireType: WireType.LENGTH_DELIMITED
        }
      }
    },
    state: {

      deviceIdFieldNumber: 5,
      enumMappings: {

        state: MediaPlayerState
      },
      fields: {

        muted: { fieldNumber: 4, valueType: "bool", wireType: WireType.VARINT },
        state: { fieldNumber: 2, valueType: "enum", wireType: WireType.VARINT },
        volume: { fieldNumber: 3, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.MEDIA_PLAYER_STATE_RESPONSE
    },
    type: "media_player"
  },

  number: {

    command: {

      deviceIdFieldNumber: 3,
      fields: {

        state: { fieldNumber: 2, valueType: "float", wireType: WireType.FIXED32 }
      },
      hasPatternFields: {},
      keyFieldNumber: 1,
      messageType: MessageType.NUMBER_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 14,
      enumMappings: {

        entityCategory: EntityCategory,
        mode: NumberMode
      },
      fields: {

        deviceClass: { fieldNumber: 13, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        disabledByDefault: { fieldNumber: 9, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 10, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        maxValue: { fieldNumber: 7, valueType: "float", wireType: WireType.FIXED32 },
        minValue: { fieldNumber: 6, valueType: "float", wireType: WireType.FIXED32 },
        mode: { fieldNumber: 12, valueType: "enum", wireType: WireType.VARINT },
        step: { fieldNumber: 8, valueType: "float", wireType: WireType.FIXED32 },
        unitOfMeasurement: { fieldNumber: 11, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_NUMBER_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 4,
      fields: {

        missingState: { fieldNumber: 3, valueType: "bool", wireType: WireType.VARINT },
        state: { fieldNumber: 2, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.NUMBER_STATE_RESPONSE
    },
    type: "number"
  },

  radio_frequency: {

    command: {

      // Shared with infrared - see the infrared schema's command slot for the rationale; the wire bytes are identical.
      deviceIdFieldNumber: 1,
      fields: {

        carrierFrequency: { fieldNumber: 3, valueType: "varint", wireType: WireType.VARINT },
        modulation:       { fieldNumber: 6, valueType: "varint", wireType: WireType.VARINT },
        repeatCount:      { fieldNumber: 4, valueType: "varint", wireType: WireType.VARINT },
        timings:          { fieldNumber: 5, valueType: "sint32-packed", wireType: WireType.LENGTH_DELIMITED }
      },
      hasPatternFields: {},
      keyFieldNumber: 2,
      messageType: MessageType.INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 7,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        capabilities:         { fieldNumber: 8,  valueType: "varint", wireType: WireType.VARINT },
        disabledByDefault:    { fieldNumber: 5,  valueType: "bool",   wireType: WireType.VARINT },
        entityCategory:       { fieldNumber: 6,  valueType: "enum",   wireType: WireType.VARINT },
        frequencyMax:         { fieldNumber: 10, valueType: "varint", wireType: WireType.VARINT },
        frequencyMin:         { fieldNumber: 9,  valueType: "varint", wireType: WireType.VARINT },
        icon:                 { fieldNumber: 4,  valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        supportedModulations: { fieldNumber: 11, valueType: "varint", wireType: WireType.VARINT }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_RADIO_FREQUENCY_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      // Shared with infrared - see the infrared schema's state slot for the rationale.
      deviceIdFieldNumber: 1,
      fields: {

        timings: { fieldNumber: 3, valueType: "sint32-packed", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.INFRARED_RF_RECEIVE_EVENT
    },
    type: "radio_frequency"
  },

  select: {

    command: {

      deviceIdFieldNumber: 3,
      fields: {

        state: { fieldNumber: 2, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      hasPatternFields: {},
      keyFieldNumber: 1,
      messageType: MessageType.SELECT_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 9,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        disabledByDefault: { fieldNumber: 7, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 8, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_SELECT_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1,
      repeatedFields: {

        options: { fieldNumber: 6, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      }
    },
    state: {

      deviceIdFieldNumber: 4,
      fields: {

        missingState: { fieldNumber: 3, valueType: "bool", wireType: WireType.VARINT },
        state: { fieldNumber: 2, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 1,
      messageType: MessageType.SELECT_STATE_RESPONSE
    },
    type: "select"
  },

  sensor: {

    listEntities: {

      deviceIdFieldNumber: 14,
      enumMappings: {

        entityCategory: EntityCategory,
        stateClass: SensorStateClass
      },
      fields: {

        accuracyDecimals: { fieldNumber: 7, valueType: "varint", wireType: WireType.VARINT },
        deviceClass: { fieldNumber: 9, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        disabledByDefault: { fieldNumber: 12, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 13, valueType: "enum", wireType: WireType.VARINT },
        forceUpdate: { fieldNumber: 8, valueType: "bool", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        stateClass: { fieldNumber: 10, valueType: "enum", wireType: WireType.VARINT },
        unitOfMeasurement: { fieldNumber: 6, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_SENSOR_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 4,
      fields: {

        missingState: { fieldNumber: 3, valueType: "bool", wireType: WireType.VARINT },
        state: { fieldNumber: 2, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.SENSOR_STATE_RESPONSE
    },
    type: "sensor"
  },

  siren: {

    command: {

      deviceIdFieldNumber: 10,
      fields: {},
      hasPatternFields: {

        duration: { hasFieldNumber: 6, valueFieldNumber: 7, valueType: "varint", wireType: WireType.VARINT },
        state: { hasFieldNumber: 2, valueFieldNumber: 3, valueType: "bool", wireType: WireType.VARINT },
        tone: { hasFieldNumber: 4, valueFieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        volume: { hasFieldNumber: 8, valueFieldNumber: 9, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.SIREN_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 11,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 10, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        supportsDuration: { fieldNumber: 8, valueType: "bool", wireType: WireType.VARINT },
        supportsVolume: { fieldNumber: 9, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_SIREN_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1,
      repeatedFields: {

        tones: { fieldNumber: 7, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      }
    },
    state: {

      deviceIdFieldNumber: 3,
      fields: {

        state: { fieldNumber: 2, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 1,
      messageType: MessageType.SIREN_STATE_RESPONSE
    },
    type: "siren"
  },

  switch: {

    command: {

      deviceIdFieldNumber: 3,
      fields: {

        state: { fieldNumber: 2, valueType: "bool", wireType: WireType.VARINT }
      },
      hasPatternFields: {},
      keyFieldNumber: 1,
      messageType: MessageType.SWITCH_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 10,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        assumedState: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        deviceClass: { fieldNumber: 9, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        disabledByDefault: { fieldNumber: 7, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 8, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_SWITCH_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 3,
      fields: {

        state: { fieldNumber: 2, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 1,
      messageType: MessageType.SWITCH_STATE_RESPONSE
    },
    type: "switch"
  },

  text: {

    command: {

      deviceIdFieldNumber: 3,
      fields: {

        state: { fieldNumber: 2, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      hasPatternFields: {},
      keyFieldNumber: 1,
      messageType: MessageType.TEXT_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 12,
      enumMappings: {

        entityCategory: EntityCategory,
        mode: TextMode
      },
      fields: {

        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        maxLength: { fieldNumber: 9, valueType: "varint", wireType: WireType.VARINT },
        minLength: { fieldNumber: 8, valueType: "varint", wireType: WireType.VARINT },
        mode: { fieldNumber: 11, valueType: "enum", wireType: WireType.VARINT },
        pattern: { fieldNumber: 10, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_TEXT_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 4,
      fields: {

        missingState: { fieldNumber: 3, valueType: "bool", wireType: WireType.VARINT },
        state: { fieldNumber: 2, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 1,
      messageType: MessageType.TEXT_STATE_RESPONSE
    },
    type: "text"
  },

  text_sensor: {

    listEntities: {

      deviceIdFieldNumber: 9,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        deviceClass: { fieldNumber: 8, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_TEXT_SENSOR_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 4,
      fields: {

        missingState: { fieldNumber: 3, valueType: "bool", wireType: WireType.VARINT },
        state: { fieldNumber: 2, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 1,
      messageType: MessageType.TEXT_SENSOR_STATE_RESPONSE
    },
    type: "text_sensor"
  },

  time: {

    command: {

      deviceIdFieldNumber: 5,
      fields: {

        hour: { fieldNumber: 2, valueType: "varint", wireType: WireType.VARINT },
        minute: { fieldNumber: 3, valueType: "varint", wireType: WireType.VARINT },
        second: { fieldNumber: 4, valueType: "varint", wireType: WireType.VARINT }
      },
      hasPatternFields: {},
      keyFieldNumber: 1,
      messageType: MessageType.TIME_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 8,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_TIME_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 6,
      fields: {

        hour: { fieldNumber: 3, valueType: "varint", wireType: WireType.VARINT },
        minute: { fieldNumber: 4, valueType: "varint", wireType: WireType.VARINT },
        missingState: { fieldNumber: 2, valueType: "bool", wireType: WireType.VARINT },
        second: { fieldNumber: 5, valueType: "varint", wireType: WireType.VARINT }
      },
      keyFieldNumber: 1,
      messageType: MessageType.TIME_STATE_RESPONSE
    },
    type: "time"
  },

  update: {

    command: {

      deviceIdFieldNumber: 3,
      enumMappings: {

        command: { check: 2, none: 0, update: 1 }
      },
      fields: {

        command: { fieldNumber: 2, valueType: "enum", wireType: WireType.VARINT }
      },
      hasPatternFields: {},
      keyFieldNumber: 1,
      messageType: MessageType.UPDATE_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 9,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        deviceClass: { fieldNumber: 8, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_UPDATE_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 11,
      fields: {

        currentVersion: { fieldNumber: 6, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        hasProgress: { fieldNumber: 4, valueType: "bool", wireType: WireType.VARINT },
        inProgress: { fieldNumber: 3, valueType: "bool", wireType: WireType.VARINT },
        latestVersion: { fieldNumber: 7, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        missingState: { fieldNumber: 2, valueType: "bool", wireType: WireType.VARINT },
        progress: { fieldNumber: 5, valueType: "float", wireType: WireType.FIXED32 },
        releaseSummary: { fieldNumber: 9, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        releaseUrl: { fieldNumber: 10, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        title: { fieldNumber: 8, valueType: "string", wireType: WireType.LENGTH_DELIMITED }
      },
      keyFieldNumber: 1,
      messageType: MessageType.UPDATE_STATE_RESPONSE
    },
    type: "update"
  },

  valve: {

    command: {

      deviceIdFieldNumber: 5,
      fields: {

        stop: { fieldNumber: 4, valueType: "bool", wireType: WireType.VARINT }
      },
      hasPatternFields: {

        position: { hasFieldNumber: 2, valueFieldNumber: 3, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.VALVE_COMMAND_REQUEST
    },
    listEntities: {

      deviceIdFieldNumber: 12,
      enumMappings: {

        entityCategory: EntityCategory
      },
      fields: {

        assumedState: { fieldNumber: 9, valueType: "bool", wireType: WireType.VARINT },
        deviceClass: { fieldNumber: 8, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        disabledByDefault: { fieldNumber: 6, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 7, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        supportsPosition: { fieldNumber: 10, valueType: "bool", wireType: WireType.VARINT },
        supportsStop: { fieldNumber: 11, valueType: "bool", wireType: WireType.VARINT }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_VALVE_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1
    },
    state: {

      deviceIdFieldNumber: 4,
      enumMappings: {

        currentOperation: ValveOperation
      },
      fields: {

        currentOperation: { fieldNumber: 3, valueType: "enum", wireType: WireType.VARINT },
        position: { fieldNumber: 2, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.VALVE_STATE_RESPONSE
    },
    type: "valve"
  },

  water_heater: {

    command: {

      // Bitmask field that aggregates which value fields are set on this command. Each present option in `bitmaskFields` ORs its bit into the mask before encoding;
      // each touched bit in `packedBitsFields.state.bits` also contributes its `hasFieldBit` to the same mask. Mirrors api.proto's `WaterHeaterCommandHasField`:
      // HAS_MODE, HAS_TARGET_TEMPERATURE, HAS_TARGET_TEMPERATURE_LOW, HAS_TARGET_TEMPERATURE_HIGH, HAS_ON_STATE, HAS_AWAY_STATE - all sourced by reference from the
      // named-constant SSOT in api-constants.ts. The deprecated HAS_STATE=4 is intentionally omitted (no encoder path touches it).
      bitmaskFieldNumber: 2,
      bitmaskFields: {

        mode: { bit: WaterHeaterCommandHasField.MODE, fieldNumber: 3, valueType: "enum", wireType: WireType.VARINT },
        targetTemperature: { bit: WaterHeaterCommandHasField.TARGET_TEMPERATURE, fieldNumber: 4, valueType: "float", wireType: WireType.FIXED32 },
        targetTemperatureHigh: { bit: WaterHeaterCommandHasField.TARGET_TEMPERATURE_HIGH, fieldNumber: 8, valueType: "float", wireType: WireType.FIXED32 },
        targetTemperatureLow: { bit: WaterHeaterCommandHasField.TARGET_TEMPERATURE_LOW, fieldNumber: 7, valueType: "float", wireType: WireType.FIXED32 }
      },
      deviceIdFieldNumber: 5,
      enumMappings: {

        mode: { eco: 1, electric: 2, gas: 6, heat_pump: 5, high_demand: 4, off: 0, performance: 3 }
      },
      fields: {},
      hasPatternFields: {},
      keyFieldNumber: 1,
      messageType: MessageType.WATER_HEATER_COMMAND_REQUEST,
      // Field 6 carries both packed state bits (bit 0 = away, bit 1 = on) per the proto's per-field comment. Each consumer-facing boolean (`awayState`, `onState`) maps
      // to its bit position via WaterHeaterStateFlags AND OR-s the matching HAS_*_STATE bit into the has_fields carrier (field 2) via the named constants in
      // WaterHeaterCommandHasField. The engine accepts independent set/clear for either bit - consumers can update only one packed bit without touching the other.
      packedBitsFields: {

        state: {

          bits: WATER_HEATER_STATE_COMMAND_BITS,
          fieldNumber: 6,
          wireType: WireType.VARINT
        }
      }
    },
    listEntities: {

      deviceIdFieldNumber: 7,
      enumMappings: {

        entityCategory: EntityCategory,
        supportedModes: WaterHeaterMode,
        temperatureUnit: TemperatureUnit
      },
      fields: {

        disabledByDefault: { fieldNumber: 5, valueType: "bool", wireType: WireType.VARINT },
        entityCategory: { fieldNumber: 6, valueType: "enum", wireType: WireType.VARINT },
        icon: { fieldNumber: 4, valueType: "string", wireType: WireType.LENGTH_DELIMITED },
        maxTemperature: { fieldNumber: 9, valueType: "float", wireType: WireType.FIXED32 },
        minTemperature: { fieldNumber: 8, valueType: "float", wireType: WireType.FIXED32 },
        supportedFeatures: { fieldNumber: 12, valueType: "varint", wireType: WireType.VARINT },
        targetTemperatureStep: { fieldNumber: 10, valueType: "float", wireType: WireType.FIXED32 },
        temperatureUnit: { fieldNumber: 13, valueType: "enum", wireType: WireType.VARINT }
      },
      keyFieldNumber: 2,
      messageType: MessageType.LIST_ENTITIES_WATER_HEATER_RESPONSE,
      nameFieldNumber: 3,
      objectIdFieldNumber: 1,
      repeatedFields: {

        supportedModes: { fieldNumber: 11, valueType: "enum", wireType: WireType.VARINT }
      }
    },
    state: {

      deviceIdFieldNumber: 5,
      enumMappings: {

        mode: WaterHeaterMode
      },
      fields: {

        currentTemperature: { fieldNumber: 2, valueType: "float", wireType: WireType.FIXED32 },
        mode: { fieldNumber: 4, valueType: "enum", wireType: WireType.VARINT },
        targetTemperature: { fieldNumber: 3, valueType: "float", wireType: WireType.FIXED32 },
        targetTemperatureHigh: { fieldNumber: 8, valueType: "float", wireType: WireType.FIXED32 },
        targetTemperatureLow: { fieldNumber: 7, valueType: "float", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: MessageType.WATER_HEATER_STATE_RESPONSE,
      // Field 6 is a packed uint32 (bit 0 = away, bit 1 = on) per the proto's per-field comment. The engine decodes each bit into a named consumer-facing boolean so
      // exhaustive switches and instance-of comparisons stay type-safe. State-side decoding ignores `hasFieldBit` - it only applies on the command side.
      packedBitsFields: {

        state: {

          bits: WATER_HEATER_STATE_INBOUND_BITS,
          fieldNumber: 6,
          wireType: WireType.VARINT
        }
      }
    },
    type: "water_heater"
  }
} as const satisfies Record<string, EntitySchema>;


/**
 * Look up an entity schema by its runtime entity-type string. Use this when the entity type is only known at runtime (for example, from a parsed message); for static
 * lookups where the entity type is a known literal, prefer `ENTITY_SCHEMAS.foo` directly so consumers retain the literal types.
 *
 * The cast to `Record<string, EntitySchema>` is the single boundary where the literal-typed registry is widened back to the schema interface for generic dynamic
 * access. Centralizing it here means consumers do not need to repeat the cast.
 *
 * @param type - The entity type string (e.g., "climate", "light").
 * @returns The matching entity schema, or undefined if no schema is registered for that type.
 * @internal
 */
export function getEntitySchema(type: string): EntitySchema | undefined {

  return (ENTITY_SCHEMAS as Record<string, EntitySchema>)[type];
}

/**
 * Look up an entity schema by its state message type ID.
 *
 * @param messageType - The message type ID to look up.
 * @returns The matching entity schema, or undefined if not found.
 * @internal
 */
export function findSchemaByStateMessageType(messageType: number): EntitySchema | undefined {

  return (Object.values(ENTITY_SCHEMAS) as EntitySchema[]).find((schema) => schema.state.messageType === messageType);
}

/**
 * Look up an entity schema by its list entities message type ID.
 *
 * @param messageType - The message type ID to look up.
 * @returns The matching entity schema, or undefined if not found.
 * @internal
 */
export function findSchemaByListEntitiesMessageType(messageType: number): EntitySchema | undefined {

  return (Object.values(ENTITY_SCHEMAS) as EntitySchema[]).find((schema) => schema.listEntities.messageType === messageType);
}

/**
 * Look up an entity schema by its command message type ID.
 *
 * @param messageType - The message type ID to look up.
 * @returns The matching entity schema, or undefined if not found.
 * @internal
 */
export function findSchemaByCommandMessageType(messageType: number): EntitySchema | undefined {

  return (Object.values(ENTITY_SCHEMAS) as EntitySchema[]).find((schema) => schema.command?.messageType === messageType);
}
