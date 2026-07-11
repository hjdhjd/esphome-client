/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * reissuable-subscription-contract.helpers.ts: Shared contract-test harness for streaming sub-APIs migrated onto the ReissuableSubscription primitive.
 */

/**
 * Shared, parameterized contract harness every streaming sub-API that migrates onto {@link ReissuableSubscription} drives. Each migrated
 * sub-API (Z-Wave global-presence, Serial per-instance, and Bluetooth's advertisement / connections-free / notify dimensions) exposes the same canonical
 * subscribe / reconnect / dispose contract; rather than
 * re-asserting that contract by hand in every test file, each file calls {@link runReissuableSubscriptionContract} with its own specifics (how to construct the
 * sub-API over a recording host, how to open a subscription iterator, and how to classify a captured frame as SUBSCRIBE / UNSUBSCRIBE for a given key). The harness
 * registers a `node:test` `describe` block that asserts the guarantees the primitive makes.
 *
 * @remarks This is a non-shipping test helper. The `*.helpers.ts` suffix is excluded from `dist/` by `tsconfig.build.json`; it is typechecked by `tsconfig.check.json`
 * and is NOT discovered by the test runner standalone (the runner globs `*.test.ts`). It runs only when a `*.test.ts` file imports and invokes it, so the registered
 * `describe` / `test` blocks attach to the importing file's test context.
 *
 * The rules asserted:
 *
 *   1. **First-subscriber SUBSCRIBE, concurrent share, last-release UNSUBSCRIBE** - the first subscriber on a key emits SUBSCRIBE; a second concurrent subscriber on the
 *      same key does not re-emit; the last release emits UNSUBSCRIBE.
 *   2. **The must-fix regression** - a subscriber that survives a `clearConnectionState()` + `reissueOnReconnect()` cycle (the host's real connect order) WITHOUT the
 *      iterator being touched gets SUBSCRIBE re-issued. This FAILS against the pre-migration hand-rolled refcount, where `reset()` zeroed the count so the reissue saw
 *      nothing to replay.
 *   3. **Dispose-after-reconnect** - after a full `clearConnectionState()` + `reissueOnReconnect()` cycle, the surviving subscriber's release still emits the final
 *      UNSUBSCRIBE. The old "count still > 0" guard swallowed this; the primitive's symbol-identity ledger gets it right.
 *   4. **clearConnectionState alone is wire-silent on dispose** - `clearConnectionState()` WITHOUT a following reissue leaves the wire cache empty, so a subsequent
 *      last-release does NOT emit a stray UNSUBSCRIBE for a connection the new transport never subscribed.
 *
 * Optional flags parameterize the dimensions whose wire shape is not the canonical symmetric SUBSCRIBE / UNSUBSCRIBE:
 *
 * - {@link ReissuableSubscriptionContractOptions.emitsUnsubscribe} (default `true`) - set `false` when the device has no unsubscribe frame, so the last release (and the
 *   post-reconnect last release) emit NOTHING rather than an UNSUBSCRIBE. Bluetooth connections-free and Bluetooth notify both lack an unsubscribe frame. Rules 1
 *   and 3 then assert the UNSUBSCRIBE count stays put across the release instead of incrementing.
 * - {@link ReissuableSubscriptionContractOptions.wireSilentOnChange} (default `false`) - set `true` for a reissue-only ledger (Bluetooth notify) whose `acquire` /
 *   `release` have NO on-change wire effect at all; the SUBSCRIBE-classified frame appears only on `reissueOnReconnect` (a NOTIFY enable=1 re-arm). Rule 1 then
 *   asserts that the first acquire, the concurrent acquire, and the releases are all wire-silent, and the must-fix Rule 2's pre-condition is zero SUBSCRIBEs (not
 *   one) before the reconnect re-arms the key. This flag implies {@link ReissuableSubscriptionContractOptions.emitsUnsubscribe} is irrelevant for the release path, since
 *   a wire-silent ledger never emits anything on `release`; we still honor `emitsUnsubscribe` for documentation symmetry but a reissue-only ledger always passes it
 *   `false`.
 *
 * @module reissuable-subscription-contract.helpers
 */
import { describe, test } from "node:test";
import type { Buffer } from "node:buffer";
import assert from "node:assert/strict";

/**
 * One captured outbound frame as recorded by the test host's `send` hook: the ESPHome message-type id and the encoded protobuf payload. Mirrors the `CapturedFrame`
 * shape each sub-API test file defines locally so the harness can consume either file's recording array directly.
 */
export interface CapturedContractFrame {

  payload: Buffer;
  type: number;
}

/**
 * Classification verdict for a captured frame relative to a key. The harness asks the consumer's {@link ReissuableSubscriptionContractOptions.classify} callback to map
 * each captured frame to exactly one of these. `"other"` covers frames that are neither a SUBSCRIBE nor an UNSUBSCRIBE for the key under test (a different key, a
 * different message type, or an unrelated request), so the harness can filter the recording down to the wire effects it asserts on.
 */
export type ContractFrameKind = "other" | "subscribe" | "unsubscribe";

/**
 * A single live subscription the harness drives. The harness opens a subscriber, runs the reconnect lifecycle, and then disposes the subscriber via {@link release}; it
 * never iterates the underlying stream, exactly modeling a consumer parked in `for await` across a reconnect.
 */
export interface ContractSubscription {

  /** Tear down the subscriber, triggering the sub-API's release path (the async generator's `finally` block in production). */
  release(): Promise<void> | void;
}

/**
 * The per-sub-API specifics {@link runReissuableSubscriptionContract} needs to drive the canonical contract against a concrete migrated sub-API. The harness owns the
 * lifecycle ordering and the assertions; the consumer supplies only the wiring.
 *
 * @typeParam A - The sub-API class under test (e.g. `ZWaveProxyApi`, `SerialProxyApi`).
 */
export interface ReissuableSubscriptionContractOptions<A> {

  /**
   * Classify a captured outbound frame relative to the key under test. Returns `"subscribe"` when the frame is a SUBSCRIBE for {@link key}, `"unsubscribe"` when it is
   * an UNSUBSCRIBE for {@link key}, and `"other"` for everything else. The harness uses this to filter the recording down to the wire effects it asserts on, so a frame
   * for a different key or an unrelated message type does not perturb the counts.
   *
   * @param frame - The captured outbound frame.
   * @returns The classification verdict.
   */
  classify(frame: CapturedContractFrame): ContractFrameKind;

  /**
   * Whether the device emits an UNSUBSCRIBE frame when a key loses its last subscriber. Defaults to `true` (the symmetric SUBSCRIBE / UNSUBSCRIBE shape: Serial, Z-Wave,
   * Bluetooth advertisement). Set `false` for a SUBSCRIBE-only dimension whose device has no unsubscribe frame (Bluetooth connections-free, Bluetooth notify) so the
   * release-path rules assert the UNSUBSCRIBE count is UNCHANGED across the last release rather than incremented by one.
   */
  emitsUnsubscribe?: boolean;

  /**
   * The label that names this sub-API in the registered `describe` block (e.g. `"ZWaveProxyApi.frames"`). Keeps the harness output legible when every migrated
   * sub-API drives it.
   */
  label: string;

  /**
   * Open a subscription on the sub-API and return a handle whose {@link ContractSubscription.release} tears it down. The harness drives the subscribe / reconnect /
   * dispose lifecycle through this handle WITHOUT iterating the underlying stream - so the production async-generator `finally` cleanup must run from `release()` (an
   * iterator `return()` in practice), not from stream exhaustion.
   *
   * @param api - The sub-API instance the harness constructed via {@link setup}.
   * @returns A handle whose `release` disposes the subscriber.
   */
  openSubscription(api: A): ContractSubscription;

  /**
   * Construct a fresh sub-API over a recording host plus the recording array its `send` hook appends to. Each rule gets its own isolated `setup()` so captured
   * frames never bleed across assertions.
   *
   * @returns The sub-API instance under test and the array its host's `send` hook records captured frames into.
   */
  setup(): { api: A; sent: CapturedContractFrame[] };

  /**
   * Whether `acquire` / `release` have NO on-change wire effect at all - the reissue-only-ledger shape (Bluetooth notify), where the wire enable is caller-driven and the
   * ledger exists solely so `reissueOnReconnect` knows which keys to re-arm. Defaults to `false` (acquire emits SUBSCRIBE, the canonical shape). When `true`, Rule 1
   * asserts the first acquire, the concurrent acquire, and the releases are wire-silent, and Rule 2's pre-reconnect SUBSCRIBE count is zero (the re-arm appears only
   * on `reissueOnReconnect`).
   */
  wireSilentOnChange?: boolean;
}

/**
 * Register the canonical reissuable-subscription contract as a `node:test` `describe` block for one migrated sub-API. Called from each sub-API's `*.test.ts` file with
 * that sub-API's specifics; the harness owns the lifecycle ordering (the host's real `clearConnectionState()` then `reissueOnReconnect()` connect order) and the
 * assertions so every migrated sub-API proves the same rules identically.
 *
 * @typeParam A - The sub-API class under test.
 * @param options - The per-sub-API wiring. See {@link ReissuableSubscriptionContractOptions}.
 */
export function runReissuableSubscriptionContract<A>(options: ReissuableSubscriptionContractOptions<A>): void {

  // Count the captured frames classified as SUBSCRIBE for the key under test. We re-derive the count from the full recording on each call rather than tracking deltas, so
  // an assertion reads as "after this lifecycle step, exactly N SUBSCRIBEs have ever been emitted" - the simplest rule to reason about.
  const countSubscribes = (sent: readonly CapturedContractFrame[]): number => sent.filter((frame) => options.classify(frame) === "subscribe").length;

  // Count the captured frames classified as UNSUBSCRIBE for the key under test, with the same cumulative-count semantics as countSubscribes above.
  const countUnsubscribes = (sent: readonly CapturedContractFrame[]): number => sent.filter((frame) => options.classify(frame) === "unsubscribe").length;

  // Whether the device emits an UNSUBSCRIBE on last detach. Default symmetric SUBSCRIBE / UNSUBSCRIBE. SUBSCRIBE-only dimensions (Bluetooth connections-free, notify)
  // pass false so the release-path rules assert the UNSUBSCRIBE count is unchanged across the last release.
  const emitsUnsubscribe = options.emitsUnsubscribe ?? true;

  // Whether acquire / release are entirely wire-silent (the reissue-only-ledger shape: Bluetooth notify). When true the first acquire emits no SUBSCRIBE; the SUBSCRIBE
  // -classified re-arm appears only on reissueOnReconnect.
  const wireSilentOnChange = options.wireSilentOnChange ?? false;

  // The SUBSCRIBE count a single live subscriber produces before any reconnect. One for the canonical on-change shape; zero for a wire-silent reissue-only ledger.
  const initialSubscribes = wireSilentOnChange ? 0 : 1;

  describe(options.label + " reissuable-subscription contract", () => {

    test("first subscriber emits SUBSCRIBE; a second concurrent subscriber does not re-emit; last release emits UNSUBSCRIBE", async () => {

      const { api, sent } = options.setup();

      // First subscriber: one SUBSCRIBE for the canonical shape, zero for a wire-silent ledger; no UNSUBSCRIBE yet either way.
      const first = options.openSubscription(api);

      assert.equal(countSubscribes(sent), initialSubscribes, wireSilentOnChange ?
        "a wire-silent reissue-only ledger must not emit SUBSCRIBE on acquire" : "first subscriber must emit exactly one SUBSCRIBE");
      assert.equal(countUnsubscribes(sent), 0, "first subscriber must not emit an UNSUBSCRIBE");

      // Second concurrent subscriber on the same key: the wire subscription is shared (canonical) or wire-silent (reissue-only ledger), so no additional SUBSCRIBE.
      const second = options.openSubscription(api);

      assert.equal(countSubscribes(sent), initialSubscribes, "a second concurrent subscriber on the same key must not change the SUBSCRIBE count");
      assert.equal(countUnsubscribes(sent), 0, "a second concurrent subscriber must not emit an UNSUBSCRIBE");

      // First release: the key still has a live subscriber, so no UNSUBSCRIBE.
      await first.release();

      assert.equal(countUnsubscribes(sent), 0, "releasing one of two subscribers must not emit UNSUBSCRIBE");

      // Last release: the key's last subscriber leaves. The symmetric shape emits exactly one UNSUBSCRIBE; a SUBSCRIBE-only or wire-silent dimension emits none.
      await second.release();

      assert.equal(countUnsubscribes(sent), emitsUnsubscribe ? 1 : 0, emitsUnsubscribe ?
        "the last release must emit exactly one UNSUBSCRIBE" : "a SUBSCRIBE-only dimension must not emit an UNSUBSCRIBE on last release");
    });

    test("a subscriber surviving clearConnectionState + reissueOnReconnect is re-SUBSCRIBEd without touching the iterator", async () => {

      const { api, sent } = options.setup();

      // Open a subscriber and leave it parked (no iteration). This models a consumer in `for await` across a reconnect.
      const survivor = options.openSubscription(api);

      assert.equal(countSubscribes(sent), initialSubscribes, wireSilentOnChange ?
        "a wire-silent reissue-only ledger emits no SUBSCRIBE before the reconnect re-arm" : "the initial subscribe must emit one SUBSCRIBE");

      // Drive the host's real connect-top order: clear connection-scoped state, then reissue after the new transport is up. The subscriber ledger must survive so the
      // reissue replays SUBSCRIBE for the still-live consumer. This is the must-fix regression: the pre-migration refcount was zeroed by reset(), so the reissue saw
      // nothing to replay and the survivor went permanently deaf.
      callClearConnectionState(api);
      callReissueOnReconnect(api);

      assert.equal(countSubscribes(sent), initialSubscribes + 1, "reissueOnReconnect must re-emit SUBSCRIBE for the surviving subscriber");

      await survivor.release();
    });

    test("after clearConnectionState + reissueOnReconnect, the surviving subscriber's release emits the final UNSUBSCRIBE", async () => {

      const { api, sent } = options.setup();

      const survivor = options.openSubscription(api);

      callClearConnectionState(api);
      callReissueOnReconnect(api);

      const unsubscribesBeforeRelease = countUnsubscribes(sent);

      // The hazard the old "count still > 0" guard swallowed: after a reconnect cycle, the survivor's last-release must still emit UNSUBSCRIBE for the symmetric shape
      // because the reissue re-armed the wire cache. The symbol-identity ledger makes this correct. A SUBSCRIBE-only dimension emits no UNSUBSCRIBE here either.
      await survivor.release();

      assert.equal(countUnsubscribes(sent), unsubscribesBeforeRelease + (emitsUnsubscribe ? 1 : 0), emitsUnsubscribe ?
        "the post-reconnect last-release must emit exactly one UNSUBSCRIBE" : "a SUBSCRIBE-only dimension must not emit an UNSUBSCRIBE post-reconnect");
    });

    test("clearConnectionState alone (no reissue) leaves the cache empty, so a later last-release emits no stray UNSUBSCRIBE", async () => {

      const { api, sent } = options.setup();

      const subscriber = options.openSubscription(api);

      // Clear connection-scoped state WITHOUT reissuing. This models a disconnect with no subsequent reconnect (or the window before reissue runs). The wire cache is now
      // empty, so the subscriber's release must not emit an UNSUBSCRIBE for a connection the device never knew about.
      callClearConnectionState(api);

      const unsubscribesBeforeRelease = countUnsubscribes(sent);

      await subscriber.release();

      assert.equal(countUnsubscribes(sent), unsubscribesBeforeRelease, "a last-release after clearConnectionState (no reissue) must not emit a stray UNSUBSCRIBE");
    });
  });
}

/**
 * Narrow structural shape every migrated sub-API exposes for the reconnect lifecycle. Both methods are nullary and void; the harness calls them in the host's real
 * connect order. We type the sub-API as `unknown` at the call boundary and bridge through this shape so the harness does not depend on any one sub-API's concrete class.
 */
interface ReconnectLifecycle {

  clearConnectionState(): void;
  reissueOnReconnect(): void;
}

/**
 * Invoke `clearConnectionState()` on the sub-API under test. Centralizes the structural bridge so every call site in the harness stays identical and the
 * `unknown`-to-shape narrowing lives in one place.
 *
 * @param api - The sub-API instance under test.
 */
function callClearConnectionState(api: unknown): void {

  (api as ReconnectLifecycle).clearConnectionState();
}

/**
 * Invoke `reissueOnReconnect()` on the sub-API under test. Centralizes the structural bridge, mirroring {@link callClearConnectionState}.
 *
 * @param api - The sub-API instance under test.
 */
function callReissueOnReconnect(api: unknown): void {

  (api as ReconnectLifecycle).reissueOnReconnect();
}
