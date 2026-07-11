/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * sub-device.ts: Sub-device descriptor for multi-device ESPHome configurations.
 */

/**
 * Sub-device descriptor.
 *
 * @remarks Single-device ESPHome configurations always report `client.subDevices()` as an empty array. Multi-device configurations - where one ESP hosts a fleet of
 * sub-devices addressed by `device_id` on the wire - report each non-zero sub-device here. The numeric `id` is the protocol's `device_id`; consumers use it with
 * {@link EspHomeClient.entitiesByDevice} to filter the entity registry by parent device.
 *
 * Each {@link EntityFor} record carries its own `deviceId` field, and `client.command(id, opts)` stamps the right wire `device_id` automatically;
 * {@link SubDevice} adds parent-device enumeration on top of that so consumers don't have to extract `device_id` values out of entity records.
 *
 * @module sub-device
 */
import { extractNumberField, extractStringField } from "./protocol/index.ts";
import { Buffer } from "node:buffer";
import type { FieldValue } from "./protocol/index.ts";

/**
 * One sub-device on a multi-device parent ESP. Returned in order from {@link EspHomeClient.subDevices}.
 */
export interface SubDevice {

  /**
   * Optional area id, when the device declares itself in an area. Pulled from the proto's `area_id` field.
   */
  areaId?: number;

  /**
   * Numeric `device_id` from the protocol. Always positive for sub-devices; the parent device is `0` and not enumerated here.
   */
  id: number;

  /**
   * Optional human-readable name. Pulled from the proto's `name` field; absent when the device declares no name.
   */
  name?: string;
}

/**
 * Parse the repeated `devices` nested-message field from a `DeviceInfoResponse` payload. Returns the list of {@link SubDevice} records, skipping any entry without a
 * usable `device_id` (the parent device is `0` and is never enumerated as a sub-device).
 *
 * @param fields - Decoded fields of the parent `DeviceInfoResponse`.
 * @param fieldNum - The repeated field number (`20` per `api.proto`).
 * @param decode - Decoder that the host injects for nested protobuf payloads (so per-message field-count caps and warn callbacks stay consistent).
 * @returns A list of {@link SubDevice} records. Empty when the field is absent, is not an array, or every entry lacks a non-zero device id.
 * @internal
 */
export function extractSubDevices(fields: Record<number, FieldValue[]>, fieldNum: number, decode: (buffer: Buffer) => Record<number, FieldValue[]>): SubDevice[] {

  const result: SubDevice[] = [];
  const subDeviceFields = fields[fieldNum];

  if(!subDeviceFields || !Array.isArray(subDeviceFields)) {

    return result;
  }

  for(const subDeviceBuffer of subDeviceFields) {

    if(!Buffer.isBuffer(subDeviceBuffer)) {

      continue;
    }

    const subDeviceMsg = decode(subDeviceBuffer);
    const id = extractNumberField(subDeviceMsg, 1);

    // Skip entries without a usable device id. The parent device is `0` and is never enumerated as a sub-device.
    if((id === undefined) || (id === 0)) {

      continue;
    }

    const name = extractStringField(subDeviceMsg, 2);
    const areaId = extractNumberField(subDeviceMsg, 3);

    result.push({

      ...((areaId !== undefined) && { areaId }),
      id,
      ...((name !== undefined) && { name })
    });
  }

  return result;
}
