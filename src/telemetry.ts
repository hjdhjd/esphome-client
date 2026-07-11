/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * telemetry.ts: Pure decoders for state-update payloads.
 */

import type { StateSchema, TelemetryEvent } from "./schemas/index.ts";
import { decodePackedBitsFields, extractFieldBySpec } from "./discovery.ts";
import type { FieldValue } from "./protocol/codec.ts";
import { extractNumberField } from "./protocol/field-extractors.ts";

/**
 * State-update decoding.
 *
 * @remarks Pure decoders for `*_STATE_RESPONSE` payloads. The host owns the state-mutation seam (event emission, latest-state cache update, entity-device-id
 * registry). This module just turns a decoded protobuf field map plus its schema into a typed {@link TelemetryEvent}.
 *
 * @module telemetry
 */

/**
 * Options for {@link decodeStateFromSchema}.
 *
 * @remarks Aggregated into a single options object for parity with {@link DecodeEntityOptions} and {@link DecodeServiceEntityOptions} - every
 * top-level decoder takes an options bag so the call site reads as a named-argument invocation.
 */
export interface DecodeStateOptions {

  /**
   * Lower-cased entity-type tag (e.g. `"light"`). Stamped into the `type` field of the result.
   */
  entityType: string;

  /**
   * The decoded protobuf field map for the state payload.
   */
  fields: Record<number, FieldValue[]>;

  /**
   * Numeric entity key. Stamped into the `key` field of the result.
   */
  key: number;

  /**
   * Human-readable entity name. Stamped into the `entity` field of the result.
   */
  name: string;

  /**
   * The {@link StateSchema} that describes which fields to extract and how to coerce each one.
   */
  stateSchema: StateSchema;
}

/**
 * Decode a state-update payload using its {@link StateSchema}. Walks every scalar field defined on the schema and relies on {@link extractFieldBySpec} to coerce each
 * wire value into its canonical TypeScript type (bool->boolean, varint/enum/sint32/fixed32 stay numeric, float through the same numeric path), then returns the
 * assembled {@link TelemetryEvent}.
 *
 * @param options - The {@link DecodeStateOptions} bag.
 * @returns A schema-derived {@link TelemetryEvent} ready for emission on the bus.
 */
export function decodeStateFromSchema(options: DecodeStateOptions): TelemetryEvent {

  const { entityType, fields, key, name, stateSchema } = options;

  const data: Record<string, unknown> = {

    entity: name,
    key,
    type: entityType
  };

  // device_id arrives in a fixed slot when the schema declares one. The deviceIdFieldNumber field is `0` on schemas that do not carry it.
  if(stateSchema.deviceIdFieldNumber > 0) {

    const deviceId = extractNumberField(fields, stateSchema.deviceIdFieldNumber);

    if(deviceId !== undefined) {

      data["deviceId"] = deviceId;
    }
  }

  // The SSOT extractor in {@link extractFieldBySpec} owns coercion: it converts every wire value into the canonical TypeScript type declared by `WireFieldOutput<F>`
  // (bool->boolean, numeric variants->number, sint32-packed->number[]). The decoder here is a thin walker that copies each coerced value onto the event
  // without re-coercing.
  for(const [ fieldName, fieldSpec ] of Object.entries(stateSchema.fields)) {

    const value = extractFieldBySpec(fields, fieldSpec);

    if(value !== undefined) {

      data[fieldName] = value;
    }
  }

  // Packed-bits fields run after the scalar fields decoder. The order matters when a packed-bits bit name collides with a deprecated scalar boolean of the same name
  // (the climate listEntities pattern has its analog on the state side): newer firmware data wins because the packed-bits decoder executes last. When the packed
  // field is absent on the wire, the scalar boolean's value survives untouched.
  if(stateSchema.packedBitsFields) {

    decodePackedBitsFields(fields, stateSchema.packedBitsFields, data);
  }

  // Schema-driven decoder <-> static type boundary. The decoder builds `data` by walking the same `state.fields` table that StateEventFor<S> derives from, so the
  // structural shape matches by construction. The cast lives at this single named boundary rather than scattered narrowing checks throughout the codebase.
  return data as unknown as TelemetryEvent;
}
