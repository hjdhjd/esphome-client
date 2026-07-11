/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * types-test-classifier.ts: Pure classifier logic for the lint-types-test-files script.
 */

/**
 * Classifier logic for the `*.types.test.ts` runtime-assertion lint. Pulled out of `scripts/lint-types-test-files.ts` into a testable module so the per-node-shape
 * literal-vs-non-literal rules can be unit-tested independently of file I/O. The lint script itself is a thin wrapper that walks the filesystem, parses each file,
 * and feeds AST nodes through these classifiers.
 *
 * The classifier draws one structural line: an assertion argument is either a LITERAL (boolean / numeric / string / null / undefined / template-with-no-substitutions,
 * possibly negated or parenthesized) or a NON-LITERAL (an expression that references a value computed at runtime - identifier reads, member access, calls, typeof
 * expressions, template literals with substitutions, etc.). An assertion call counts as "meaningful" when at least one argument is non-literal.
 *
 * @module internal/types-test-classifier
 */
import ts from "typescript";

/**
 * Classify a single assertion argument as literal-or-not. The rule is structural: the argument's AST root is matched against the known literal node kinds; anything
 * else is non-literal. Parenthesization (`(true)`) and unary prefix on a literal (`!true`, `-1`) pass through to the inner check so the wrapper forms are still
 * recognized as literal.
 *
 * Recognized literal forms:
 *
 *   - `true`, `false`, `null` (keyword tokens)
 *   - Numeric literals (`1`, `1.5`, `0xff`, `1n` BigInt)
 *   - String literals (`"foo"`, `'bar'`)
 *   - Template literals with NO substitutions (the no-substitution backtick form `` `foo` ``)
 *   - The identifier `undefined`
 *   - Parenthesized literal (recursive)
 *   - Unary-prefixed literal (recursive: `!true`, `-1`, `+0`, `~0`)
 *
 * Anything else is non-literal: identifier reads other than `undefined`, member access, call expressions, binary expressions, conditional expressions, template
 * literals with substitutions, array/object literals (their members may carry computation), and so on. The bias is conservative: when in doubt, treat as non-literal
 * so the lint accepts more rather than fewer assertions as "meaningful." False positives in the meaningful direction are fine; false positives in the literal
 * direction would flag legitimate assertions as placeholders and create noise.
 *
 * @param node - The argument expression AST node.
 * @returns `true` when the argument is a literal form; `false` otherwise.
 */
export function isLiteralArg(node: ts.Expression): boolean {

  // Parenthesized expressions pass through to the inner expression.
  if(ts.isParenthesizedExpression(node)) {

    return isLiteralArg(node.expression);
  }

  // Boolean keyword tokens (true / false) and the null keyword token.
  if((node.kind === ts.SyntaxKind.TrueKeyword) || (node.kind === ts.SyntaxKind.FalseKeyword) || (node.kind === ts.SyntaxKind.NullKeyword)) {

    return true;
  }

  // Numeric literals (including bigint), string literals, no-substitution templates.
  if(ts.isNumericLiteral(node) || ts.isBigIntLiteral(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {

    return true;
  }

  // The identifier `undefined` is a literal-equivalent value reference in TypeScript's expression grammar.
  if(ts.isIdentifier(node) && (node.text === "undefined")) {

    return true;
  }

  // Unary prefix operators (`!`, `-`, `+`, `~`) on a literal still count as literal. A `typeof` expression parses as a TypeOfExpression, not a PrefixUnaryExpression,
  // so it is not matched here and is classified non-literal.
  if(ts.isPrefixUnaryExpression(node) && isLiteralArg(node.operand)) {

    return true;
  }

  return false;
}

/**
 * Classification summary for a single `*.types.test.ts` file. Counts every `assert.*` call (and `assert.strict.*` call) found by the walker, then partitions them
 * by whether ANY argument was non-literal.
 */
export interface AssertionClassification {

  /**
   * Number of `assert.*` calls where at least one argument was a non-literal expression. A file with zero meaningful calls is functionally pure-type-level and
   * should be renamed to `*.types.ts` per the project convention.
   */
  meaningful: number;

  /**
   * Total `assert.*` call count regardless of argument shape.
   */
  total: number;

  /**
   * Number of `assert.*` calls where every argument was literal (`assert.ok(true)`, `assert.equal(1, 1)`, etc.). These are placeholder assertions that don't
   * earn the mixed-extension contract.
   */
  trivial: number;
}

/**
 * Walk a TypeScript source file and classify every `assert.*` call expression it contains. Recognizes both `assert.X(...)` and `assert.strict.X(...)` shapes by
 * inspecting the property-access chain's root identifier; non-`assert` calls are ignored entirely.
 *
 * @param sourceFile - The parsed TypeScript SourceFile AST.
 * @returns A classification record.
 */
export function classifyAssertionsInFile(sourceFile: ts.SourceFile): AssertionClassification {

  let total = 0;
  let meaningful = 0;

  const visit = (node: ts.Node): void => {

    if(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {

      // Walk the property-access chain to its root - this handles `assert.X(...)` (root = `assert` identifier) and `assert.strict.X(...)` (root = `assert` after
      // descending through `assert.strict`). Anything that doesn't bottom out at the `assert` identifier is ignored.
      let root: ts.Expression = node.expression;

      while(ts.isPropertyAccessExpression(root)) {

        root = root.expression;
      }

      if(ts.isIdentifier(root) && (root.text === "assert")) {

        total++;

        if(node.arguments.some((arg) => !isLiteralArg(arg))) {

          meaningful++;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return { meaningful, total, trivial: total - meaningful };
}
