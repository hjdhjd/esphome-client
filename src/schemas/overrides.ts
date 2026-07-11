/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * overrides.ts: Typed override tables for wire-vs-API divergence on a per-entity basis.
 */

/**
 * Entries in {@link EntityOverrides}, {@link EventOverrides}, and {@link CommandOverrides} are the exhaustive list of intentional divergences between the wire shape
 * (derived strictly from `ENTITY_SCHEMAS`) and the public-API shape consumers see. Most entities have no override; the override layer captures the handful of
 * ergonomic adapters and runtime fallbacks the library exposes on top of the raw wire shape.
 *
 * Every override entry is colocated here so the entire delta from "schema is SSOT" lives in one file. Adding a new override is a single typed entry; the mapped types
 * in `./derived.ts` consume the table automatically.
 *
 * @module schemas/overrides
 */
import type { Buffer } from "node:buffer";

/**
 * Wire-side override entries for the entity (list-entities) shape. Each entry is a partial shape merged onto the wire-derived {@link WireEntityFor}
 * via intersection.
 *
 * @remarks Reserved for genuine wire-vs-API divergences only - cases where the type system needs to refine the schema-derived shape in a way the schema itself cannot
 * express. Enum-valued field narrowing (e.g. `entityCategory`, `number.mode`, `text.mode`, climate's supported* arrays) flows automatically through the schema's
 * listEntities-side `enumMappings`, so those entries do NOT belong here. The remaining entries are runtime-mutation prevention (light's effects and supportedColorModes
 * tightened to readonly arrays) - the schema engine has no way to express readonly on its own.
 *
 * @internal
 */
export interface EntityOverrides {

  light: { effects?: readonly string[]; supportedColorModes?: readonly number[] };
}

/**
 * Wire-side override entries for the state-event shape. Captures runtime fallbacks when the schema's nominal valueType doesn't match what real ESPHome devices produce
 * and the rare case where the post-decode shape consumers see replaces the wire shape entirely (camera, after multi-packet image reassembly).
 *
 * @remarks Climate accepts `number | string` for every temperature/humidity field because some ESPHome firmware builds emit string-encoded floats on the wire even
 * though the schema says float; the decoder honors both and consumers depend on the union. Button has no state schema - the synthesized event carries
 * `pressed: true` constructed in handleTelemetry. Camera is the only entry that uses the omit+add distinction on this table: the multi-packet `data`/`done`
 * fields are internal plumbing and the reassembly path emits the consumer-visible `{ image, name }` pair alongside the preserved base tag and entity id,
 * so consumers narrowing on `event.type === "camera"` continue to see the assembled image rather than the wire chunk fields. Enum-valued state fields (lock state,
 * cover/valve currentOperation, climate mode/fanMode/preset/swingMode/action, fan direction, light colorMode, media-player state, water-heater mode) narrow to
 * literal-union types via the schema's state-side `enumMappings`; no override entry is needed for that narrowing.
 *
 * @internal
 */
export interface EventOverrides {

  button: { pressed: true };
  camera: {

    add: { image: Buffer; name: string };

    // The wire fields the post-reassembly event replaces. `data` and `done` are the per-chunk reassembly plumbing consumers never observe; `deviceId` is wire-only.
    // `type`, `entity`, and `key` survive from the base so the camera arm of {@link TelemetryEvent} carries the same tags every other arm does - consumers
    // iterating the telemetry stream uniformly access `type`/`entity`/`key` across every variant.
    omit: "data" | "deviceId" | "done";
  };
  climate: {

    currentHumidity?: number | string;
    currentTemperature?: number | string;
    targetHumidity?: number | string;
    targetTemperature?: number | string;
    targetTemperatureHigh?: number | string;
    targetTemperatureLow?: number | string;
  };
  valve: { position?: number | string };
}

/**
 * Wire-side override entries for the command-options shape. When an entry declares `omit`, those keys are removed from the wire-derived command shape; when it
 * declares `add`, those fields are intersected on. The runtime mirror lives in `./adapters.ts` - the type table and the runtime adapter must agree on the same set of
 * keys.
 *
 * @remarks Light's wire shape uses flat `red`/`green`/`blue`/`hasRgb`; the public API takes `rgb: { r, g, b }`. The runtime adapter expands the object before reaching
 * the schema-driven encoder. Siren accepts a number for `duration` that the wrapper rounds; no type override needed - the wire shape already accepts a number.
 *
 * @internal
 */
export interface CommandOverrides {

  light: {

    add: { rgb?: { b: number; g: number; r: number } };
    omit: "blue" | "green" | "hasRgb" | "red";
  };
}
