/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * types-test-classifier.test.ts: Unit tests for the runtime-assertion classifier consumed by `scripts/lint-types-test-files.ts`.
 */
import { classifyAssertionsInFile, isLiteralArg } from "./types-test-classifier.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

/**
 * Parse a snippet of TypeScript source into a SourceFile AST suitable for testing the classifier. We use `ts.ScriptTarget.Latest` so the parser accepts every
 * modern syntactic form (bigint literals, nullish coalescing, etc.) and `ts.ScriptKind.TS` so type-annotation syntax is permitted.
 */
const parse = (source: string): ts.SourceFile => ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/**
 * Extract the FIRST argument of the FIRST call expression in a snippet. Used to feed isolated expressions to {@link isLiteralArg} without manual AST walking in
 * every test.
 */
const firstArg = (source: string): ts.Expression => {

  const sf = parse("dummy(" + source + ");");
  let target: ts.Expression | undefined;

  const visit = (node: ts.Node): void => {

    if(ts.isCallExpression(node) && !target) {

      target = node.arguments[0];
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);

  if(!target) {

    throw new Error("Test fixture parse failure: no call expression in '" + source + "'");
  }

  return target;
};

describe("isLiteralArg - literal argument forms", () => {

  test("recognizes the boolean keyword tokens (true, false)", () => {

    assert.equal(isLiteralArg(firstArg("true")), true);
    assert.equal(isLiteralArg(firstArg("false")), true);
  });

  test("recognizes the null keyword token", () => {

    assert.equal(isLiteralArg(firstArg("null")), true);
  });

  test("recognizes numeric literals (integer, float, hex, bigint)", () => {

    assert.equal(isLiteralArg(firstArg("1")), true);
    assert.equal(isLiteralArg(firstArg("1.5")), true);
    assert.equal(isLiteralArg(firstArg("0xff")), true);
    assert.equal(isLiteralArg(firstArg("0n")), true);
  });

  test("recognizes string literals (single and double-quoted)", () => {

    assert.equal(isLiteralArg(firstArg("\"hello\"")), true);
    assert.equal(isLiteralArg(firstArg("'hello'")), true);
  });

  test("recognizes no-substitution template literals", () => {

    assert.equal(isLiteralArg(firstArg("`hello`")), true);
  });

  test("recognizes the `undefined` identifier as literal-equivalent", () => {

    assert.equal(isLiteralArg(firstArg("undefined")), true);
  });

  test("recognizes parenthesized literals via recursive descent", () => {

    assert.equal(isLiteralArg(firstArg("(true)")), true);
    assert.equal(isLiteralArg(firstArg("((1))")), true);
    assert.equal(isLiteralArg(firstArg("(null)")), true);
  });

  test("recognizes unary-prefixed literals (!, -, +, ~)", () => {

    assert.equal(isLiteralArg(firstArg("!true")), true);
    assert.equal(isLiteralArg(firstArg("-1")), true);
    assert.equal(isLiteralArg(firstArg("+0")), true);
    assert.equal(isLiteralArg(firstArg("~0")), true);
  });

  test("recognizes deeply nested literal forms (parens around unary around literal)", () => {

    assert.equal(isLiteralArg(firstArg("(!true)")), true);
    assert.equal(isLiteralArg(firstArg("!(true)")), true);
  });
});

describe("isLiteralArg - non-literal argument forms", () => {

  test("rejects plain identifier reads (other than undefined)", () => {

    assert.equal(isLiteralArg(firstArg("value")), false);
    assert.equal(isLiteralArg(firstArg("x")), false);
  });

  test("rejects member access expressions", () => {

    assert.equal(isLiteralArg(firstArg("obj.field")), false);
    assert.equal(isLiteralArg(firstArg("obj[\"key\"]")), false);
  });

  test("rejects call expressions", () => {

    assert.equal(isLiteralArg(firstArg("fn()")), false);
    assert.equal(isLiteralArg(firstArg("fn(1, 2)")), false);
  });

  test("rejects typeof expressions on identifiers", () => {

    assert.equal(isLiteralArg(firstArg("typeof value")), false);
    assert.equal(isLiteralArg(firstArg("typeof obj.field")), false);
  });

  test("rejects template literals with substitutions", () => {

    assert.equal(isLiteralArg(firstArg("`hello ${name}`")), false);
  });

  test("rejects binary expressions (computed equality, arithmetic, etc.)", () => {

    assert.equal(isLiteralArg(firstArg("x === y")), false);
    assert.equal(isLiteralArg(firstArg("a + b")), false);
    assert.equal(isLiteralArg(firstArg("count > 0")), false);
  });

  test("rejects conditional (ternary) expressions", () => {

    assert.equal(isLiteralArg(firstArg("cond ? 1 : 2")), false);
  });

  test("rejects array literals (members may carry computation; conservatively non-literal)", () => {

    // Even an array literal of all-literal members is treated as non-literal: the array itself is a runtime allocation and the use sites typically inspect its
    // shape. Treating it as literal would let `assert.deepEqual(actual, [1, 2, 3])` register as a placeholder, which is wrong.
    assert.equal(isLiteralArg(firstArg("[1, 2, 3]")), false);
  });

  test("rejects object literals", () => {

    assert.equal(isLiteralArg(firstArg("{ a: 1 }")), false);
  });
});

describe("classifyAssertionsInFile - counts and classifies assertion calls", () => {

  test("counts a single meaningful assert.equal call", () => {

    const sf = parse("import assert from 'node:assert/strict'; assert.equal(value, 1);");
    const result = classifyAssertionsInFile(sf);

    assert.equal(result.total, 1);
    assert.equal(result.meaningful, 1);
    assert.equal(result.trivial, 0);
  });

  test("counts a single placeholder assert.ok(true) as trivial", () => {

    const sf = parse("import assert from 'node:assert/strict'; assert.ok(true);");
    const result = classifyAssertionsInFile(sf);

    assert.equal(result.total, 1);
    assert.equal(result.meaningful, 0);
    assert.equal(result.trivial, 1);
  });

  test("counts mixed meaningful + placeholder calls separately", () => {

    const sf = parse([
      "import assert from 'node:assert/strict';",
      "assert.ok(true);",
      "assert.equal(value, 1);",
      "assert.equal(1, 1);"
    ].join("\n"));

    const result = classifyAssertionsInFile(sf);

    assert.equal(result.total, 3);
    assert.equal(result.meaningful, 1);
    assert.equal(result.trivial, 2);
  });

  test("returns zero counts when the file contains no assert.* calls", () => {

    const sf = parse("const x = 1;");
    const result = classifyAssertionsInFile(sf);

    assert.equal(result.total, 0);
    assert.equal(result.meaningful, 0);
    assert.equal(result.trivial, 0);
  });

  test("recognizes assert.strict.X(...) shape (descends the property-access chain)", () => {

    const sf = parse("import assert from 'node:assert'; assert.strict.equal(value, 1);");
    const result = classifyAssertionsInFile(sf);

    assert.equal(result.total, 1);
    assert.equal(result.meaningful, 1);
  });

  test("ignores non-assert function calls", () => {

    const sf = parse([
      "import assert from 'node:assert/strict';",
      "console.log(true);",
      "doSomething(value);",
      "assert.equal(value, 1);"
    ].join("\n"));

    const result = classifyAssertionsInFile(sf);

    assert.equal(result.total, 1, "console.log and doSomething are NOT counted; only the assert call is");
    assert.equal(result.meaningful, 1);
  });

  test("an assertion with any non-literal argument counts as meaningful (the bias is liberal)", () => {

    const sf = parse([
      "import assert from 'node:assert/strict';",
      "assert.equal(1, 1, message);"
    ].join("\n"));

    const result = classifyAssertionsInFile(sf);

    assert.equal(result.total, 1);
    assert.equal(result.meaningful, 1, "the `message` identifier in arg 3 makes the whole call meaningful even though args 1 and 2 are literal");
  });

  test("recurses into nested blocks (describe/test bodies, conditionals, etc.)", () => {

    const sf = parse([
      "import assert from 'node:assert/strict';",
      "describe('outer', () => {",
      "  test('inner', () => {",
      "    if(true) {",
      "      assert.equal(value, 1);",
      "    }",
      "  });",
      "});"
    ].join("\n"));

    const result = classifyAssertionsInFile(sf);

    assert.equal(result.total, 1, "the nested assert deep inside describe/test/if is found via recursive descent");
    assert.equal(result.meaningful, 1);
  });

  test("classifier reports total = meaningful + trivial as a guarantee", () => {

    // Property-test: across any combination of meaningful and trivial assertions, the total must equal the sum. Pinning the guarantee catches a classifier
    // refactor that might double-count or miss a category.
    const sf = parse([
      "import assert from 'node:assert/strict';",
      "assert.ok(true);",
      "assert.ok(false);",
      "assert.equal(value, 1);",
      "assert.equal(JSON.stringify(x), \"y\");"
    ].join("\n"));

    const result = classifyAssertionsInFile(sf);

    assert.equal(result.total, result.meaningful + result.trivial);
    assert.equal(result.total, 4);
    assert.equal(result.meaningful, 2);
    assert.equal(result.trivial, 2);
  });
});
