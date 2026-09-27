import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { sourceFiles } from "../../../tests/support/source-files";

/**
 * The Form pattern's rule for the browser's own validation
 * (docs/design-system.md, "Changing settings or a record"): a form on
 * react-hook-form carries `noValidate` and no `required` anywhere in its markup.
 * The shared Zod schema is the only validator — it words each refusal in Bahasa
 * Indonesia under the field that caused it (`pesanKesalahan`), and a field the
 * schema lets through empty (the domain decides whether it is really needed, and
 * refuses it in its own words) is never marked required, so there is no English
 * browser bubble and no second rule that can disagree with the schema. Plain
 * forms outside the pattern (the Lokasi Mitra and Tugas Lapangan forms) keep
 * their own markup; this guard is about the pattern only.
 *
 * The same scan locks the other half of the rule: every form on the pattern
 * clears its fields once its Server Action has answered (see `form-reset.ts`).
 */
const STAF = join(__dirname);

type FormFacts = {
  /** `<form>` elements in the file. */
  forms: number;
  /** Each `<form>` that carries no `noValidate`. */
  withoutNoValidate: string[];
  /** Any JSX attribute named `required`. */
  requiredAttributes: string[];
  /** Calls to `useResetAfterSubmit(`, one per form that clears itself. */
  resets: number;
};

function at(tree: ts.SourceFile, node: ts.Node, text: string): string {
  const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
  return `${relative(STAF, tree.fileName)}:${line}: ${text}`;
}

function scan(file: string): FormFacts {
  const tree = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const attributeName = (name: ts.JsxAttribute["name"]) =>
    ts.isIdentifier(name) ? name.text : `${name.namespace.text}:${name.name.text}`;
  const facts: FormFacts = { forms: 0, withoutNoValidate: [], requiredAttributes: [], resets: 0 };
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      for (const attribute of attributes) {
        if (attributeName(attribute.name) === "required") facts.requiredAttributes.push(at(tree, attribute, "required"));
      }
      if (node.tagName.getText(tree) === "form") {
        facts.forms += 1;
        if (!attributes.some((attribute) => attributeName(attribute.name) === "noValidate"))
          facts.withoutNoValidate.push(at(tree, node, "<form> carries no noValidate"));
      }
    }
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "useResetAfterSubmit") facts.resets += 1;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return facts;
}

/** Every staff form on the pattern: the ones that reach for react-hook-form. */
const forms = sourceFiles(STAF)
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => ({ file, facts: scan(file) }))
  .filter(({ file, facts }) => facts.forms > 0 && /\buseForm\s*[<(]/.test(readFileSync(file, "utf8")));

describe("the Form pattern in the staff area", () => {
  it("finds the staff forms on the pattern", () => {
    expect(forms.map(({ file }) => relative(STAF, file))).not.toEqual([]);
  });

  it("every form on the pattern carries noValidate, so only the shared Zod schema refuses a value", () => {
    expect(forms.flatMap(({ facts }) => facts.withoutNoValidate)).toEqual([]);
  });

  it("no form on the pattern marks a field required; the schema decides which values are needed", () => {
    expect(forms.flatMap(({ facts }) => facts.requiredAttributes)).toEqual([]);
  });

  it("every form on the pattern clears its fields once the save went through", () => {
    const unreset = forms
      .filter(({ facts }) => facts.resets !== facts.forms)
      .map(({ file, facts }) => `${relative(STAF, file)}: ${facts.forms} form(s), ${facts.resets} clear after a save`);
    expect(unreset).toEqual([]);
  });
});
