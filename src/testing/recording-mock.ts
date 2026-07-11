/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * recording-mock.ts: Reflection-driven recording-stub factory for sub-API mocks.
 */

/**
 * Reflection-driven recording-stub factory. One generic produces a `Proxy`-backed instance that satisfies any real sub-API class's interface at the test site,
 * records every method invocation (with args + timestamp) into a per-instance log, and returns either a per-method stub value supplied by the test or a per-API
 * default supplied at construction.
 *
 * @remarks This is the SSOT for mocking every sub-API on {@link MockClient}. The alternative - one hand-stubbed class per sub-API, each mirroring every
 * method - was the brute-force version of pattern-matching; this factory is the architectural answer. Adding a new sub-API to the real client requires zero
 * new mock code; the factory enumerates the new class's prototype on construction and synthesizes the recording surface dynamically.
 *
 * The recording / stubbing introspection surface lives under a {@link MOCK} symbol (not a string property) so it cannot collide with method names on the underlying
 * sub-API class - both real and future. Tests address it via `mock.bluetooth[MOCK].calls` etc.
 *
 * @module testing/recording-mock
 */

/**
 * Sentinel-keyed property exposing the {@link MockController} on any factory-produced mock. Imported by tests as `import { MOCK } from "esphome-client/testing"`;
 * the Symbol guarantees the property name cannot collide with any string method or accessor on the underlying sub-API class.
 */
export const MOCK = Symbol.for("esphome-client/testing/recording-mock");

/**
 * One recorded method invocation on a factory-produced mock. Each call appends to {@link MockController.calls} with args + timestamp for later assertion.
 */
export interface RecordedSubApiCall {

  /**
   * The arguments passed to the method, captured as a read-only view of the call site's args. Reference equality preserved; tests should not mutate the array.
   */
  readonly args: readonly unknown[];

  /**
   * The method or accessor name as it appears on the real sub-API class. For accessors the args array is empty.
   */
  readonly method: string;

  /**
   * Wall-clock timestamp at the time the call was recorded. Useful for ordering assertions across sub-APIs.
   */
  readonly timestamp: number;
}

/**
 * Introspection / control surface for a factory-produced mock. Accessed via `mock[MOCK]`. The surface stays minimal on purpose - the heavy lifting (default returns,
 * stub configuration, per-call recording) lives entirely behind the factory's Proxy handlers.
 */
export interface MockController {

  /**
   * The recorded-call log in arrival order. The array reference is stable across calls; tests reading the log between scenarios should call {@link clearCalls} rather
   * than reassign.
   */
  readonly calls: readonly RecordedSubApiCall[];

  /**
   * Clear the recorded-call log. Tests typically call this between scenarios so each scenario asserts only its own calls.
   */
  clearCalls(): void;

  /**
   * Clear every per-method stub return value. Resets the mock to its construction-time defaults without disposing of the recorded-call log.
   */
  clearStubs(): void;

  /**
   * Stage a return value for a specific method. Tests supply either a literal value (returned verbatim on every call) or a function (invoked with the call args and
   * its result returned). The stub replaces the construction-time default for the named method only; other methods keep returning their defaults.
   */
  stub(method: string, value: unknown): void;
}

/**
 * Per-method default-return map supplied to {@link createRecordingMock} at construction. Each entry is the value (or a function returning the value) that the mock
 * returns when the named method is invoked without a per-test stub override. Methods absent from the map return `undefined`.
 *
 * @remarks The keys are constrained to `keyof T`. At inline-literal construction sites (`createRecordingMock(BluetoothProxyApi, { availabel: false })`), TypeScript's
 * excess-property check rejects unknown keys at compile time - a typo fails to type-check rather than silently landing in the defaults map. This guarantee is pinned
 * by the compile-time test in `recording-mock.types.ts`.
 *
 * Reference-passed defaults are NOT subject to excess-property checking (TypeScript widens to the variable's inferred type before passing). A construction site like
 * `const d = { availabel: false }; createRecordingMock(X, d)` accepts the typo because `d`'s inferred type doesn't carry the original literal's strict shape.
 * Test authors who route defaults through variables should explicitly annotate the type: `const d: MockDefaults<BluetoothProxyApi> = { availabel: false }` - the
 * annotation re-engages the strict check at the variable's declaration site.
 *
 * Values use a `R | ((...args) => R)` shape so each entry can be either a literal return or a function computing the return from the call args - both shapes
 * type-check against the same key.
 */
export type MockDefaults<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => infer R ? R | ((...args: never[]) => R) : T[K];
};

/**
 * Construct a recording mock for the given sub-API class. The returned value satisfies the class's TypeScript interface (so consumer code calls `mock.connect(...)`,
 * `mock.disconnect(...)`, etc. unchanged) and exposes its recording surface under {@link MOCK}.
 *
 * @param Ctor - The real sub-API class constructor. The factory reads its `prototype` to enumerate methods and accessors; consumer-facing instance methods declared
 *   on the class surface automatically.
 * @param defaults - Optional per-method default returns. Methods absent from the map return `undefined` (the universal "method completed, no return value" sentinel).
 * @returns A {@link Proxy}-backed object that satisfies the sub-API's interface plus exposes {@link MOCK}.
 *
 */
export function createRecordingMock<T extends object>(Ctor: new(...args: never[]) => T, defaults: MockDefaults<T> = {}): T & { readonly [MOCK]: MockController } {

  const calls: RecordedSubApiCall[] = [];
  const stubs = new Map<string, unknown>();
  const methodCache = new Map<string, (...args: readonly unknown[]) => unknown>();

  // Resolve the value or invoke the function for a given method-name lookup. Resolution order: per-test stub > construction-time default > undefined.
  const resolveReturn = (method: string, args: readonly unknown[]): unknown => {

    const source = stubs.has(method) ? stubs.get(method) : (defaults as Record<string, unknown>)[method];

    if(typeof source === "function") {

      return (source as (...callArgs: readonly unknown[]) => unknown)(...args);
    }

    return source;
  };

  // The mock controller exposed via the MOCK symbol. Stable reference - tests can capture and reuse across scenarios.
  const controller: MockController = {

    calls,
    clearCalls: (): void => {

      calls.length = 0;
    },
    clearStubs: (): void => {

      stubs.clear();
    },
    stub: (method: string, value: unknown): void => {

      stubs.set(method, value);
    }
  };

  // Enumerate the class's own prototype methods and accessor descriptors. We walk only the direct prototype (no climb) because every public method on each sub-API
  // is declared on its own class - climbing would surface inherited Object methods (`toString`, `hasOwnProperty`, etc.) that consumers do not call through the
  // sub-API interface.
  const proto = Ctor.prototype as Record<string, unknown>;
  const descriptors = new Map<string, PropertyDescriptor>();

  for(const name of Object.getOwnPropertyNames(proto)) {

    if(name === "constructor") {

      continue;
    }

    const desc = Object.getOwnPropertyDescriptor(proto, name);

    if(desc) {

      descriptors.set(name, desc);
    }
  }

  // Build the synthetic target object. We do not extend from an instance of Ctor because instantiating it requires the real seam dependencies the mock does not have.
  // The Proxy supplies the surface; the target is just an identity for property access bookkeeping.
  const target: Record<string | symbol, unknown> = {};

  const handler: ProxyHandler<typeof target> = {

    get(_t, prop): unknown {

      if(prop === MOCK) {

        return controller;
      }

      if(typeof prop !== "string") {

        return undefined;
      }

      const desc = descriptors.get(prop);

      // Accessors (getters) record a zero-arg call and return the stub-or-default. Without descriptor inspection these would surface as method-shaped (consumer would
      // need to write `mock.bluetooth.available()`) which mismatches the real API. The synthetic accessor restores the consumer-facing shape.
      if(desc?.get) {

        calls.push({ args: [], method: prop, timestamp: Date.now() });

        return resolveReturn(prop, []);
      }

      // Methods. Cache the recording wrapper so repeated property access returns the same function reference (consumer code that captures `const fn = mock.foo;` and
      // calls `fn(arg)` later still records correctly).
      if(typeof desc?.value === "function") {

        const cached = methodCache.get(prop);

        if(cached) {

          return cached;
        }

        const wrapper = (...args: readonly unknown[]): unknown => {

          calls.push({ args, method: prop, timestamp: Date.now() });

          return resolveReturn(prop, args);
        };

        methodCache.set(prop, wrapper);

        return wrapper;
      }

      // Property does not exist on the sub-API. Return undefined to match a real class instance accessing an undeclared property.
      return undefined;
    }
  };

  // The double cast threads the synthetic Proxy through the consumer-facing type. The factory's contract is that the returned value satisfies the sub-API's
  // interface by structural enumeration of its prototype - real instance methods exist, accessor properties exist, and the MOCK symbol is exposed.
  return new Proxy(target, handler) as unknown as T & { readonly [MOCK]: MockController };
}
