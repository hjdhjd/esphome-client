/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * entity-types.ts: Entity type primitives and per-entity type aliases derived from ENTITY_SCHEMAS.
 */

/**
 * Per-entity type aliases derived from {@link ENTITY_SCHEMAS}. Names like `LightEntity` and `SensorEntity` resolve to schema-derived shapes, so consumer code
 * referencing them tracks the schema as the single source of truth. Wire-level protocol enums (`EntityCategory`, `SensorStateClass`, `NumberMode`, `TextMode`,
 * etc.) live in `api-constants.ts` alongside every other wire enum; this module focuses on type aliases over the schema registry.
 *
 * @module schemas/entity-types
 */
import type { EntityFor, StateEventFor } from "./derived.ts";
import type { ENTITY_SCHEMAS } from "./entity-schemas.ts";
import type { EntityCategory } from "../api-constants.ts";

/**
 * String literal union enumerating every ESPHome entity type. Used as the tag on the {@link Entity} union for narrowing. Derived directly
 * from the keys of the {@link ENTITY_SCHEMAS} registry so the union and the schema cannot drift apart - adding a new entity type to
 * ENTITY_SCHEMAS automatically extends this union.
 */
export type EntityType = keyof typeof ENTITY_SCHEMAS;

/**
 * Base entity interface containing fields common to all ESPHome entity types. Carries the same fields as the schema-derived shape under a conventional name for
 * ergonomic consumer use.
 */
export interface BaseEntity {

  deviceId?: number;
  disabledByDefault?: boolean;
  entityCategory?: EntityCategory;
  icon?: string;
  key: number;
  name: string;
  objectId: string;
  type: EntityType;
}

// Per-entity type aliases. Each is a derived shape from ENTITY_SCHEMAS plus any EntityOverrides entry, exposed under conventional names (LightEntity, SensorEntity,
// etc.) for ergonomic consumer use. Adding a new entity type to ENTITY_SCHEMAS produces a new shape under EntityFor<typeof ENTITY_SCHEMAS["new_type"]> automatically;
// no parallel interface to maintain here.
/**
 * The `alarm_control_panel` entity type: arm / disarm / trigger transitions guarded by an optional code.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#alarm-control-panel-command}
 */
export type AlarmControlPanelEntity = EntityFor<typeof ENTITY_SCHEMAS["alarm_control_panel"]>;
export type BinarySensorEntity = EntityFor<typeof ENTITY_SCHEMAS["binary_sensor"]>;
/**
 * The `button` entity type: a stateless momentary trigger (press-only, with no awaitable state).
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#button-command}
 */
export type ButtonEntity = EntityFor<typeof ENTITY_SCHEMAS["button"]>;
export type CameraEntity = EntityFor<typeof ENTITY_SCHEMAS["camera"]>;
/**
 * The `climate` entity type: HVAC mode, target setpoint(s), fan mode, preset, and swing.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#climate-command}
 */
export type ClimateEntity = EntityFor<typeof ENTITY_SCHEMAS["climate"]>;
/**
 * The `cover` entity type: position, tilt, and open / close / stop operation with a current-operation state.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#cover-command}
 */
export type CoverEntity = EntityFor<typeof ENTITY_SCHEMAS["cover"]>;
export type DateEntity = EntityFor<typeof ENTITY_SCHEMAS["date"]>;
/**
 * The `datetime` entity type: a combined date-and-time value.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#number-select-text-command}
 */
export type DateTimeEntity = EntityFor<typeof ENTITY_SCHEMAS["datetime"]>;
export type EventEntity = EntityFor<typeof ENTITY_SCHEMAS["event"]>;
/**
 * The `fan` entity type: on/off, speed level, oscillation, direction, and preset mode.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#fan-command}
 */
export type FanEntity = EntityFor<typeof ENTITY_SCHEMAS["fan"]>;
/**
 * The `infrared` entity type: transmits a raw mark/space timing pattern to a connected IR blaster.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#infrared-transmit}
 */
export type InfraredEntity = EntityFor<typeof ENTITY_SCHEMAS["infrared"]>;
/**
 * The `light` entity type: on/off, brightness, color (RGB / white / color-temperature in mireds), and effects.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#light-command}
 */
export type LightEntity = EntityFor<typeof ENTITY_SCHEMAS["light"]>;
/**
 * The `lock` entity type: lock / unlock / open with an optional code and a current lock state.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#lock-command}
 */
export type LockEntity = EntityFor<typeof ENTITY_SCHEMAS["lock"]>;
/**
 * The `media_player` entity type: playback transport, volume, mute, and media-URL playback with announcements.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#media-player-command}
 */
export type MediaPlayerEntity = EntityFor<typeof ENTITY_SCHEMAS["media_player"]>;
/**
 * The `number` entity type: a bounded numeric value set within its min / max / step range.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#number-select-text-command}
 */
export type NumberEntity = EntityFor<typeof ENTITY_SCHEMAS["number"]>;
/**
 * The `radio_frequency` entity type: transmits a raw 433.92 MHz OOK timing pattern to a connected RF module.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#radio-frequency-transmit}
 */
export type RadioFrequencyEntity = EntityFor<typeof ENTITY_SCHEMAS["radio_frequency"]>;
/**
 * The `select` entity type: a single choice from a fixed set of options.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#number-select-text-command}
 */
export type SelectEntity = EntityFor<typeof ENTITY_SCHEMAS["select"]>;
export type SensorEntity = EntityFor<typeof ENTITY_SCHEMAS["sensor"]>;
/**
 * The `siren` entity type: on/off with optional tone, duration, and volume.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#siren-command}
 */
export type SirenEntity = EntityFor<typeof ENTITY_SCHEMAS["siren"]>;
/**
 * The `switch` entity type: a simple boolean on/off control.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#switch-command}
 */
export type SwitchEntity = EntityFor<typeof ENTITY_SCHEMAS["switch"]>;
/**
 * The `text` entity type: a free-form string value within the device's length and mode constraints.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#number-select-text-command}
 */
export type TextEntity = EntityFor<typeof ENTITY_SCHEMAS["text"]>;
export type TextSensorEntity = EntityFor<typeof ENTITY_SCHEMAS["text_sensor"]>;
export type TimeEntity = EntityFor<typeof ENTITY_SCHEMAS["time"]>;
export type UpdateEntity = EntityFor<typeof ENTITY_SCHEMAS["update"]>;
export type ValveEntity = EntityFor<typeof ENTITY_SCHEMAS["valve"]>;
export type WaterHeaterEntity = EntityFor<typeof ENTITY_SCHEMAS["water_heater"]>;

// Per-entity telemetry-event aliases. Same SSOT story as the entity aliases above: each is a derived StateEventFor<...> shape, so consumer code referencing
// LightEvent / SensorEvent etc. resolves to the schema-driven payload type.
export type AlarmControlPanelEvent = StateEventFor<typeof ENTITY_SCHEMAS["alarm_control_panel"]>;
export type BinarySensorEvent = StateEventFor<typeof ENTITY_SCHEMAS["binary_sensor"]>;
export type ButtonEvent = StateEventFor<typeof ENTITY_SCHEMAS["button"]>;
export type CameraEvent = StateEventFor<typeof ENTITY_SCHEMAS["camera"]>;
export type ClimateEvent = StateEventFor<typeof ENTITY_SCHEMAS["climate"]>;
export type CoverEvent = StateEventFor<typeof ENTITY_SCHEMAS["cover"]>;
export type DateEvent = StateEventFor<typeof ENTITY_SCHEMAS["date"]>;
export type DateTimeEvent = StateEventFor<typeof ENTITY_SCHEMAS["datetime"]>;
export type EventEntityEvent = StateEventFor<typeof ENTITY_SCHEMAS["event"]>;
export type FanEvent = StateEventFor<typeof ENTITY_SCHEMAS["fan"]>;
/**
 * The telemetry event for an `infrared` entity: a decoded inbound remote-control code received from the device.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#infrared-receive}
 */
export type InfraredEvent = StateEventFor<typeof ENTITY_SCHEMAS["infrared"]>;
export type LightEvent = StateEventFor<typeof ENTITY_SCHEMAS["light"]>;
export type LockEvent = StateEventFor<typeof ENTITY_SCHEMAS["lock"]>;
export type MediaPlayerEvent = StateEventFor<typeof ENTITY_SCHEMAS["media_player"]>;
export type NumberEvent = StateEventFor<typeof ENTITY_SCHEMAS["number"]>;
/**
 * The telemetry event for a `radio_frequency` entity: a decoded inbound RF transmission received from the device.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#radio-frequency-receive}
 */
export type RadioFrequencyEvent = StateEventFor<typeof ENTITY_SCHEMAS["radio_frequency"]>;
export type SelectEvent = StateEventFor<typeof ENTITY_SCHEMAS["select"]>;
export type SensorEvent = StateEventFor<typeof ENTITY_SCHEMAS["sensor"]>;
export type SirenEvent = StateEventFor<typeof ENTITY_SCHEMAS["siren"]>;
export type SwitchEvent = StateEventFor<typeof ENTITY_SCHEMAS["switch"]>;
export type TextEvent = StateEventFor<typeof ENTITY_SCHEMAS["text"]>;
export type TextSensorEvent = StateEventFor<typeof ENTITY_SCHEMAS["text_sensor"]>;
export type TimeEvent = StateEventFor<typeof ENTITY_SCHEMAS["time"]>;
export type UpdateEvent = StateEventFor<typeof ENTITY_SCHEMAS["update"]>;
export type ValveEvent = StateEventFor<typeof ENTITY_SCHEMAS["valve"]>;
export type WaterHeaterEvent = StateEventFor<typeof ENTITY_SCHEMAS["water_heater"]>;

/**
 * Telemetry-event type tag union. Derived directly from {@link ENTITY_SCHEMAS} so the literal-string union extends automatically as new entity types are added.
 */
export type TelemetryEventType = EntityType;
