/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * mock-client.types.test.ts: Type-level tests verifying the MockClient surface mirrors EspHomeClient's public API.
 */
import type { Assert, Equal, Extends, MutuallyAssignable } from "../internal/type-assertions.ts";
import type { ENTITY_SCHEMAS, StateEventFor } from "../schemas/index.ts";
import { describe, test } from "node:test";
import type { ClientCapabilities } from "../capabilities.ts";
import type { ConnectionHealth } from "../health.ts";
import type { EntityId } from "../entity-id.ts";
import type { EspHomeClient } from "../esphome-client.ts";
import { MockClient } from "./mock-client.ts";
import assert from "node:assert/strict";
import { entityId } from "../entity-id.ts";

// This file pins MockClient as a faithful test double of EspHomeClient's consumption surface, in two complementary layers that catch different failure modes.
//
// The first layer is the derived-surface parity guard below. It computes the members the two classes share rather than hand-listing them, then asserts member by member
// that the mock's signature mirrors the real client's...so a shared method silently changing shape - the drift class a hand-picked spot-check list misses - becomes a
// typecheck error at the guard's own declaration. One language constraint shapes this layer: TypeScript checks method PARAMETERS bivariantly, so an assignability
// comparison of two method types never notices a parameter that drifted looser or tighter. The flat tier therefore pins with `Equal`, which compares symbolically
// rather than by assignability and so DOES catch parameter drift - the `logs(number)` vs `logs(LogLevel)` regression this guard exists to prevent.
//
// A companion presence guard closes the derived surface's one blind spot: a member that leaves the mock entirely just drops out of the shared set, unpinned. It requires
// every string-keyed consumer member of the client, minus a documented not-modelled set, to exist on the mock, so a removed or newly-unmirrored method surfaces by name.
//
// The second layer is the value-level narrowing tests that follow. They instantiate the mock and drive the generic methods at concrete type arguments - a branded id
// carries its type through `latest`/`snapshotFor`, a wrong-typed command is rejected - which both proves the generics NARROW correctly AND exercises their parameters at
// real call sites, the one place parameter fidelity IS checked strictly. The generic tier below leans on this layer for parameter fidelity while the structural layer
// pins its return shape, so the two are genuinely complementary rather than redundant.

// The shared surface is DERIVED, not curated: `keyof EspHomeClient & keyof MockClient` is exactly the set of members both classes declare, so a new shared method is
// pinned automatically the moment both sides gain it - there is no parallel list to keep in step. The bare `EspHomeClient` reference resolves to the default
// `EspHomeClient<{}>`, the no-extras instantiation a plain consumer sees and the only one the non-generic mock can mirror; under it `ExtendedEntityType<{}>` reduces to
// `EntityType` and `SchemaForExtended<T, {}>` to `typeof ENTITY_SCHEMAS[T]`, so every Extras-threaded client method collapses to exactly the plain-`EntityType`
// signature the mock hand-writes.
type SharedSurfaceKey = keyof EspHomeClient & keyof MockClient;

// The shared members split into three fidelity tiers, each pinned by the predicate its category warrants. Two tiers are declared as exceptions below; every other
// shared member falls through to the strict flat tier, so a member is guarded strictly by default and only relaxed when it is deliberately categorised here.

// Exception one - the entity methods that thread the client's `Extras` generic. The mock, being non-generic, writes them out in the reduced no-extras form, so they are
// INTERCHANGEABLE with the real signatures yet not symbolically identical...`Equal` would flag them spuriously because it does not reduce `SchemaForExtended<T, {}>` to
// `typeof ENTITY_SCHEMAS[T]`. They are pinned with `MutuallyAssignable`, which reduces the conditionals during its check. That predicate cannot see their parameter
// drift (methods are bivariant under assignability), so the value-level tests carry their parameter fidelity while this tier pins their return shape.
type GenericSurfaceKey = "command" | "commandAndAwait" | "latest" | "snapshotFor" | "telemetryFor" | "telemetryForId";

// Exception two - the sub-API getters, whose mock return type intersects the real one with a `{ [MOCK] }` recording handle. That handle is a deliberate SUBTYPE, so they
// are pinned one-directionally with `Extends` rather than for interchangeability.
type SubApiSurfaceKey = "bluetooth" | "camera" | "homeAssistant" | "serial" | "services" | "voiceAssistant" | "zwave";

// The default tier - every other shared member, restricted to string keys (the `Symbol.dispose`/`Symbol.asyncDispose` pair is pinned explicitly further down, keeping
// the mapped types free of symbol-key edge cases). These must be EXACTLY equal to the real client's - `Equal`, not the looser `MutuallyAssignable` - because a symbolic
// comparison is the only structural check that catches a method parameter drifting looser (assignability would wave it through under method bivariance), and it also
// rejects an accidental `any`.
type FlatSurfaceKey = Exclude<SharedSurfaceKey & string, GenericSurfaceKey | SubApiSurfaceKey>;

// Each `*Drift` map keys itself by exactly the members that FAIL its tier's predicate, pairing the mock signature against the real one, so it is `{}` in the healthy
// state and names the offender otherwise...hover the map at a failure to read the drifted member names.
type FlatSurfaceDrift = {
  [K in FlatSurfaceKey as Equal<MockClient[K], EspHomeClient[K]> extends true ? never : K]: [MockClient[K], EspHomeClient[K]];
};
type GenericSurfaceDrift = {
  [K in GenericSurfaceKey as MutuallyAssignable<MockClient[K], EspHomeClient[K]> extends true ? never : K]: [MockClient[K], EspHomeClient[K]];
};
type SubApiSurfaceDrift = {
  [K in SubApiSurfaceKey as Extends<MockClient[K], EspHomeClient[K]> extends true ? never : K]: [MockClient[K], EspHomeClient[K]];
};

// The guards. Each fails to compile the instant its drift map is non-empty. The two `Symbol.dispose` members sit outside the string-keyed maps, so they are pinned
// directly...being parameterless, `Equal` is exact and sufficient for them.
type _FlatSurfaceMirrorsEspHomeClient = Assert<Equal<keyof FlatSurfaceDrift, never>>;
type _GenericSurfaceMirrorsEspHomeClient = Assert<Equal<keyof GenericSurfaceDrift, never>>;
type _SubApiSurfaceMirrorsEspHomeClient = Assert<Equal<keyof SubApiSurfaceDrift, never>>;
type _SyncDisposeMirrorsEspHomeClient = Assert<Equal<MockClient[typeof Symbol.dispose], EspHomeClient[typeof Symbol.dispose]>>;
type _AsyncDisposeMirrorsEspHomeClient = Assert<Equal<MockClient[typeof Symbol.asyncDispose], EspHomeClient[typeof Symbol.asyncDispose]>>;

// Presence guard. The tiers above pin the SHAPE of members both classes declare, but a member that silently LEAVES the mock simply drops out of the derived shared
// surface, unpinned. This closes that blind spot: every string-keyed public member of the real client, minus the deliberately-unmodelled set below, must exist on the
// mock. The exclusion is inverted on purpose...the list documents what the mock does NOT model - wire framing, connection lifecycle, and diagnostics a byteless double
// has no consumer to serve - so everything else is presence-enforced by default, and a consumer method removed from the mock (or added to the client without being
// mirrored or excluded here) surfaces below by name.
type MockExcludedKey = "acknowledgeDisconnectRequest" | "acknowledgeDisconnectResponse" | "acknowledgePingResponse" | "connect" | "logAllEntityIds" | "sendPing" |
  "setNoiseEncryptionKey" | "subscribeToLogs" | "transmitRawTimings";

// Real consumer members absent from the mock, keyed by the missing member...empty in the healthy state.
type MissingConsumerMember = {
  [K in Exclude<keyof EspHomeClient & string, MockExcludedKey> as K extends keyof MockClient ? never : K]: EspHomeClient[K];
};
type _MockMirrorsEveryConsumerMember = Assert<Equal<keyof MissingConsumerMember, never>>;

// Re-exported so the unused-locals lint cannot elide the guards; the assertions do their work at declaration time, not at use.
export type {
  _AsyncDisposeMirrorsEspHomeClient, _FlatSurfaceMirrorsEspHomeClient, _GenericSurfaceMirrorsEspHomeClient, _MockMirrorsEveryConsumerMember,
  _SubApiSurfaceMirrorsEspHomeClient, _SyncDisposeMirrorsEspHomeClient
};

describe("MockClient surface mirror", () => {

  test("on() returns a Disposable matching the platform Disposable interface", () => {

    const client = new MockClient();
    const handle: Disposable = client.on("connect", () => { /* */ });

    assert.equal(typeof handle[Symbol.dispose], "function");
  });

  test("once() returns a Promise of the event payload", async () => {

    const client = new MockClient();
    const promise: Promise<boolean> = client.once("connect");

    client.emit("connect", true);

    const result: boolean = await promise;

    assert.equal(typeof result, "boolean");
  });

  test("stream() returns an AsyncIterable of the event payload", () => {

    const client = new MockClient();
    const stream: AsyncIterable<boolean> = client.stream("connect");

    assert.equal(typeof stream[Symbol.asyncIterator], "function");
  });

  test("latest<T>() narrows the return type to Nullable<StateEventFor<T>>", () => {

    const client = new MockClient();
    const id: EntityId<"light"> = entityId("light", "kitchen");
    const result = client.latest(id);

    // result is `Nullable<StateEventFor<typeof ENTITY_SCHEMAS["light"]>>`. Verify by extracting type.
    if(result !== null) {

      // result.type narrows to the literal "light" because the EntityId<"light"> brand carried through.
      const _t: "light" = result.type;

      void _t;
    }

    assert.equal(result, null);
  });

  test("snapshotFor<T>() narrows the map to entries of T", () => {

    const client = new MockClient();
    const lights = client.snapshotFor("light");

    // lights is `ReadonlyMap<EntityId<"light">, StateEventFor<typeof ENTITY_SCHEMAS["light"]>>`.
    for(const [ id, event ] of lights) {

      const _id: EntityId<"light"> = id;
      const _t: "light" = event.type;

      void _id;
      void _t;
    }

    assert.equal(lights.size, 0);
  });

  test("telemetryFor<T>() narrows the stream element type to StateEventFor<T>", () => {

    const client = new MockClient();

    // The annotation IS the assertion: telemetryFor("light") must return a stream whose element is the light state event. If the branded type argument stopped carrying
    // through the return, this assignment would fail to compile. We do not iterate - a fresh mock's stream parks awaiting the first emit - so the runtime check just
    // confirms the async-iterable shape.
    const stream: AsyncIterable<StateEventFor<typeof ENTITY_SCHEMAS["light"]>> = client.telemetryFor("light");

    assert.equal(typeof stream[Symbol.asyncIterator], "function");
  });

  test("capabilities() returns ClientCapabilities", () => {

    const client = new MockClient();
    const caps: ClientCapabilities = client.capabilities();

    assert.equal(typeof caps.api.major, "number");
  });

  test("health() returns ConnectionHealth", () => {

    const client = new MockClient();
    const health: ConnectionHealth = client.health();

    assert.equal(typeof health.state, "string");
  });

  test("rejects passing a switch id to a light-typed command call", () => {

    const client = new MockClient();
    const switchId = entityId("switch", "x");

    // @ts-expect-error - command<"switch"> requires a switch-shaped options object; rgb is light-only and not assignable here.
    client.command(switchId, { rgb: { b: 0, g: 0, r: 0 } });

    // The recorded call still works at runtime - the brand erases - but the test guards the type contract.
    assert.equal(client.commands.length, 1);
  });
});
