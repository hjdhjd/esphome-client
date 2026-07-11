/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * entity-types.types.ts: Type-level guarantees pinning the per-entity *Entity / *Event alias surface to the schema registry.
 */

/**
 * Compile-time guarantees for the per-entity public type-alias surface declared in `entity-types.ts`. Every entity type in {@link ENTITY_SCHEMAS} must expose a
 * conventionally-named `*Entity` alias and a `*Event` alias; this file pins that symmetry structurally so a future entity type added to the registry without its
 * matching aliases fails the typecheck rather than silently shipping an asymmetric public surface.
 *
 * @remarks This file holds **type-level assertions only**. It lives at `.types.ts` (not `.types.test.ts`) and is validated by `tsc` via `tsconfig.check.json`, NOT by
 * `node --test`. Each assertion is a sentinel-assertion type alias (`Assert<Equal<A, B>>`): a failed assertion produces a typecheck error at the alias's declaration
 * site. The mechanism: the union of every named `*Entity` alias must equal the schema-distributed {@link Entity} union, and the union of every named `*Event` alias
 * must equal the schema-distributed {@link TelemetryEvent} union. A missing alias drops one variant from the union, so the equality fails and CI breaks.
 *
 * @module schemas/entity-types.types
 */
import type {
  AlarmControlPanelEntity, AlarmControlPanelEvent, BinarySensorEntity, BinarySensorEvent, ButtonEntity, ButtonEvent, CameraEntity, CameraEvent, ClimateEntity,
  ClimateEvent, CoverEntity, CoverEvent, DateEntity, DateEvent, DateTimeEntity, DateTimeEvent, EventEntity, EventEntityEvent, FanEntity, FanEvent, InfraredEntity,
  InfraredEvent, LightEntity, LightEvent, LockEntity, LockEvent, MediaPlayerEntity, MediaPlayerEvent, NumberEntity, NumberEvent, RadioFrequencyEntity,
  RadioFrequencyEvent, SelectEntity, SelectEvent, SensorEntity, SensorEvent, SirenEntity, SirenEvent, SwitchEntity, SwitchEvent, TextEntity, TextEvent,
  TextSensorEntity, TextSensorEvent, TimeEntity, TimeEvent, UpdateEntity, UpdateEvent, ValveEntity, ValveEvent, WaterHeaterEntity, WaterHeaterEvent
} from "./entity-types.ts";
import type { Assert, Equal } from "../internal/type-assertions.ts";
import type { Entity, EntityFor, TelemetryEvent } from "./derived.ts";
import type { ENTITY_SCHEMAS } from "./entity-schemas.ts";

/**
 * Union of every named `*Entity` alias. If a future entity type is added to {@link ENTITY_SCHEMAS} without its conventionally-named alias, that variant is absent here
 * and the equality assertion against {@link Entity} below fails to compile.
 */
type AllEntityAliases =
  AlarmControlPanelEntity | BinarySensorEntity | ButtonEntity | CameraEntity | ClimateEntity | CoverEntity | DateEntity | DateTimeEntity | EventEntity | FanEntity |
  InfraredEntity | LightEntity | LockEntity | MediaPlayerEntity | NumberEntity | RadioFrequencyEntity | SelectEntity | SensorEntity | SirenEntity | SwitchEntity |
  TextEntity | TextSensorEntity | TimeEntity | UpdateEntity | ValveEntity | WaterHeaterEntity;

/**
 * Union of every named `*Event` alias. Same guard as {@link AllEntityAliases}, against the {@link TelemetryEvent} union.
 */
type AllEventAliases =
  AlarmControlPanelEvent | BinarySensorEvent | ButtonEvent | CameraEvent | ClimateEvent | CoverEvent | DateEvent | DateTimeEvent | EventEntityEvent | FanEvent |
  InfraredEvent | LockEvent | LightEvent | MediaPlayerEvent | NumberEvent | RadioFrequencyEvent | SelectEvent | SensorEvent | SirenEvent | SwitchEvent | TextEvent |
  TextSensorEvent | TimeEvent | UpdateEvent | ValveEvent | WaterHeaterEvent;

/**
 * The named `*Entity` aliases, taken as a union, are exactly the schema-distributed {@link Entity} union. A missing alias makes the two unions diverge and breaks this
 * assertion.
 */
type EntityAliasesAreComplete = Assert<Equal<AllEntityAliases, Entity>>;

/**
 * The named `*Event` aliases, taken as a union, are exactly the schema-distributed {@link TelemetryEvent} union.
 */
type EventAliasesAreComplete = Assert<Equal<AllEventAliases, TelemetryEvent>>;

/**
 * The `WaterHeaterEntity` alias resolves to the schema-derived shape for the `water_heater` registry entry, matching how every sibling alias is constructed.
 */
type WaterHeaterEntityResolves = Assert<Equal<WaterHeaterEntity, EntityFor<typeof ENTITY_SCHEMAS["water_heater"]>>>;

// The aliases below are never read at runtime; this module is typecheck-only and is not discovered by the test runner. Exporting them as members of the tuple
// type below keeps them referenced so the unused-locals lint stays quiet, while the type-level assertions above do the real work at their declaration sites.
export type EntityTypesTypeGuarantees = [ EntityAliasesAreComplete, EventAliasesAreComplete, WaterHeaterEntityResolves ];
