/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * timeout-signals.helpers.ts: Shared test helper that captures every timeout signal a test builds.
 */
import type { TestContext } from "node:test";

/**
 * Capture every signal `AbortSignal.timeout` builds during the test, delegating to the platform so each captured signal fires as a real one would. The test's mock
 * context restores the platform method when the test ends.
 *
 * @remarks The `*.helpers.ts` suffix is excluded from `dist/` by `tsconfig.build.json`; it is typechecked by `tsconfig.json` and is not discovered by the test runner
 * on its own (the runner globs `*.test.ts`).
 *
 * @param t - The running test's context, whose mock stands in for `AbortSignal.timeout` until the test ends.
 * @returns The signals captured so far, in the order they were built. The array fills as the test runs.
 */
export function captureTimeoutSignals(t: TestContext): AbortSignal[] {

  const captured: AbortSignal[] = [];
  const platformTimeout = AbortSignal.timeout.bind(AbortSignal);

  t.mock.method(AbortSignal, "timeout", (milliseconds: number): AbortSignal => {

    const signal = platformTimeout(milliseconds);

    captured.push(signal);

    return signal;
  });

  return captured;
}
