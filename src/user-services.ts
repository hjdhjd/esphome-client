/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * user-services.ts: User-defined service execution sub-API.
 */

/**
 * User-defined services sub-API.
 *
 * @remarks ESPHome's API surfaces user-defined services discovered during entity discovery (parallel to entity discovery but populated from the device's
 * `homeassistant.action` and `script` blocks). Consumers enumerate the discovered services via {@link UserServicesApi.list} and invoke them via
 * {@link UserServicesApi.execute} or {@link UserServicesApi.executeByName}. The wire-level encoding of argument values handles the eight typed variants
 * (`boolValue`, `intValue`, `floatValue`, `stringValue`, plus the four matching array variants) per the ESPHome `ExecuteServiceRequest` proto.
 *
 * Devices that opt into `USE_API_USER_DEFINED_ACTION_RESPONSES` emit an `EXECUTE_SERVICE_RESPONSE` correlated via `callId`; consumers receive these via the host's
 * `serviceCallResult` event. Older firmware treats `executeService` as fire-and-forget and never produces the response message.
 *
 * The class is a thin sub-API namespace - it carries no internal state and delegates every operation to the host seam. The seam supplies the service registry,
 * the encoder, the frame-send hook, and the logger; the api class supplies the consumer-facing method names and JSDoc.
 *
 * @module user-services
 */
import type { EspHomeLogging, ServiceEntity } from "./types.ts";
import { MessageType, WireType } from "./protocol/index.ts";
import { encodeProtoFields, zigzagEncode } from "./protocol/codec.ts";
import { Buffer } from "node:buffer";
import type { ExecuteServiceArgumentValue } from "./esphome-client.ts";
import { FIXED32_FIELD_BYTES } from "./protocol/field-extractors.ts";
import type { ProtoField } from "./protocol/codec.ts";
import type { ServiceRegistry } from "./registries/service-registry.ts";

/**
 * Narrow seam the {@link UserServicesApi} consumes from the host. Mirrors the other sub-API seams (a few primitives plus the host's `frameAndSend` hook). The api
 * never reaches into host private state - everything it needs flows through this object.
 *
 * @internal
 */
export interface UserServicesApiHost {

  readonly log: EspHomeLogging;
  readonly serviceRegistry: ServiceRegistry;
  send(type: number, payload: Buffer): void;
}

/**
 * User-defined services sub-API. Exposes the discovered service catalog and the two execution paths (by key or by name).
 *
 * @remarks Stateless aside from the seam reference. Construct one instance per host; the singleton lifetime is managed by the host's `services` lazy getter.
 */
export class UserServicesApi {

  /**
   * Narrow host seam. Set in the constructor and never reassigned.
   */
  private readonly host: UserServicesApiHost;

  /**
   * Construct a user-services sub-API bound to a host seam.
   *
   * @param host - The host seam (logger, service registry, frame-send hook).
   * @internal
   */
  public constructor(host: UserServicesApiHost) {

    this.host = host;
  }

  /**
   * Enumerate the user-defined services discovered on the current connection. Returns a shallow copy of the registry's discovery-ordered list so consumer mutations
   * never bleed into the registry's state.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#service-execution}
   *
   * @returns An array of discovered service entities, in discovery order.
   *
   */
  public list(): ServiceEntity[] {

    return [...this.host.serviceRegistry.all()];
  }

  /**
   * Execute a user-defined service on the ESPHome device by its numeric key. Use {@link executeByName} when only the service name is known; this method is the lower
   * level entry point for callers that already have the key cached.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#service-execution}
   *
   * @param key - The service key (numeric identifier).
   * @param args - An array of argument values matching the service definition.
   *
   */
  public execute(key: number, args: ExecuteServiceArgumentValue[] = []): void {

    // Validate the service exists in the discovery registry. Unknown keys are a consumer-side bug; log and skip rather than write garbage to the wire.
    const service = this.host.serviceRegistry.byKey(key);

    if(!service) {

      this.host.log.error("Service with key " + String(key) + " not found.");

      return;
    }

    this.host.log.debug("executeService - service: " + service.name + " | key: " + String(key) + " | args: " + String(args.length));

    // Build the ExecuteServiceRequest message according to the protocol specification. The service key occupies field 1 (fixed32); each argument is a nested
    // ExecuteServiceArgument message at field 2 (repeated length-delimited).
    const fields: ProtoField[] = [];
    const keyBuf = Buffer.alloc(FIXED32_FIELD_BYTES);

    keyBuf.writeUInt32LE(key, 0);
    fields.push({ fieldNumber: 1, value: keyBuf, wireType: WireType.FIXED32 });

    for(let i = 0; i < args.length; i++) {

      const argValue = args[i];
      const argDef = service.args[i];

      // The argDef check covers caller-supplied args that exceed the service definition; the argValue check covers caller-supplied args that are sparse (length
      // implies a slot but the slot is empty). Either condition warns and skips the offending slot rather than emitting a silent no-op.
      if(!argDef || (argValue === undefined)) {

        this.host.log.warn("Argument at index " + String(i) + " is missing or exceeds service argument definition.");

        continue;
      }

      const argPayload = encodeServiceArgument(argValue);

      if(argPayload !== null) {

        fields.push({ fieldNumber: 2, value: argPayload, wireType: WireType.LENGTH_DELIMITED });
      }
    }

    this.host.send(MessageType.EXECUTE_SERVICE_REQUEST, encodeProtoFields(fields));
  }

  /**
   * Execute a user-defined service on the ESPHome device by name. Looks up the service in the discovery registry and dispatches to {@link execute}.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#service-execution}
   *
   * @param name - The service name as declared in the device's YAML.
   * @param args - An array of argument values matching the service definition.
   *
   */
  public executeByName(name: string, args: ExecuteServiceArgumentValue[] = []): void {

    const service = this.host.serviceRegistry.byName(name);

    if(!service) {

      this.host.log.error("Service with name '" + name + "' not found.");

      return;
    }

    this.execute(service.key, args);
  }
}

/**
 * Encode a single service argument value into its ExecuteServiceArgument wire-message body. Returns the encoded buffer when any typed variant is set; returns
 * `null` when the argument value carries no typed payload (caller skips the slot).
 *
 * @remarks Field numbers follow the ESPHome `ExecuteServiceArgument` proto exactly: 1 bool, 5 sint32, 3 float, 4 string, 6 repeated bool, 7 repeated sint32, 8
 * repeated float, 9 repeated string. The `if`/`else if` chain checks the four scalar variants before the four repeated variants; because at most one
 * variant is ever set on a given argument value, the chain resolves to the correct field regardless of the order in which the checks run.
 */
function encodeServiceArgument(argValue: ExecuteServiceArgumentValue): Buffer | null {

  const argFields: ProtoField[] = [];

  if(argValue.boolValue !== undefined) {

    argFields.push({ fieldNumber: 1, value: argValue.boolValue ? 1 : 0, wireType: WireType.VARINT });

  } else if(argValue.intValue !== undefined) {

    argFields.push({ fieldNumber: 5, value: zigzagEncode(argValue.intValue), wireType: WireType.VARINT });

  } else if(argValue.floatValue !== undefined) {

    const floatBuf = Buffer.alloc(FIXED32_FIELD_BYTES);

    floatBuf.writeFloatLE(argValue.floatValue, 0);
    argFields.push({ fieldNumber: 3, value: floatBuf, wireType: WireType.FIXED32 });

  } else if(argValue.stringValue !== undefined) {

    argFields.push({ fieldNumber: 4, value: Buffer.from(argValue.stringValue, "utf8"), wireType: WireType.LENGTH_DELIMITED });

  } else if(argValue.boolArray !== undefined) {

    for(const val of argValue.boolArray) {

      argFields.push({ fieldNumber: 6, value: val ? 1 : 0, wireType: WireType.VARINT });
    }

  } else if(argValue.intArray !== undefined) {

    for(const val of argValue.intArray) {

      argFields.push({ fieldNumber: 7, value: zigzagEncode(val), wireType: WireType.VARINT });
    }

  } else if(argValue.floatArray !== undefined) {

    for(const val of argValue.floatArray) {

      const floatBuf = Buffer.alloc(FIXED32_FIELD_BYTES);

      floatBuf.writeFloatLE(val, 0);
      argFields.push({ fieldNumber: 8, value: floatBuf, wireType: WireType.FIXED32 });
    }

  } else if(argValue.stringArray !== undefined) {

    for(const val of argValue.stringArray) {

      argFields.push({ fieldNumber: 9, value: Buffer.from(val, "utf8"), wireType: WireType.LENGTH_DELIMITED });
    }
  }

  return argFields.length > 0 ? encodeProtoFields(argFields) : null;
}
