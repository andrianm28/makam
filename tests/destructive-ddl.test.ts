import { describe, expect, it } from "vitest";
import { unmarkedDestructiveStatements } from "../scripts/migrations/destructive-ddl";

describe("destructive DDL in a new migration (expand/contract)", () => {
  it("lets an expand-only migration through", () => {
    const migration = [
      'CREATE TABLE "tagihan" ("id" uuid PRIMARY KEY NOT NULL, "total" bigint NOT NULL);',
      "--> statement-breakpoint",
      'ALTER TABLE "tagihan" ADD COLUMN "catatan" text;',
    ].join("\n");
    expect(unmarkedDestructiveStatements(migration)).toEqual([]);
  });

  it("refuses an unmarked DROP TABLE, naming its line", () => {
    const migration = ['CREATE TABLE "a" ("id" uuid);--> statement-breakpoint', 'DROP TABLE "old_tagihan";'].join("\n");
    expect(unmarkedDestructiveStatements(migration)).toEqual([
      { line: 2, statement: 'DROP TABLE "old_tagihan";', reason: "DROP" },
    ]);
  });

  it("lets a destructive statement through when a -- contract: comment with a reason sits directly above it", () => {
    const migration = [
      'CREATE TABLE "a" ("id" uuid);--> statement-breakpoint',
      "-- contract: no release since 2026-10-01 reads old_tagihan",
      'DROP TABLE "old_tagihan";--> statement-breakpoint',
      'DROP TABLE "other";',
    ].join("\n");
    expect(unmarkedDestructiveStatements(migration)).toEqual([{ line: 4, statement: 'DROP TABLE "other";', reason: "DROP" }]);
  });

  it("does not count a contract marker without a reason", () => {
    const migration = ["-- contract:", 'DROP TABLE "old_tagihan";'].join("\n");
    expect(unmarkedDestructiveStatements(migration)).toHaveLength(1);
  });

  it.each([
    ['ALTER TABLE "identity_otp_request" RENAME COLUMN "phone_number" TO "target";', "RENAME"],
    ['ALTER TABLE "tagihan" RENAME TO "invoice";', "RENAME"],
    ['ALTER TABLE "tagihan" ALTER COLUMN "channel" SET NOT NULL;', "SET NOT NULL"],
    ['ALTER TABLE "tagihan" ALTER COLUMN "total" SET DATA TYPE numeric;', "type change"],
    ['ALTER TABLE "tagihan" ALTER COLUMN "total" TYPE numeric USING "total"::numeric;', "type change"],
    ['ALTER TABLE "tagihan" ADD COLUMN "nomor" text NOT NULL;', "NOT NULL column without a default"],
    ['ALTER TABLE "tagihan" DROP COLUMN "catatan";', "DROP"],
    ['ALTER TABLE "tagihan" ALTER COLUMN "catatan" DROP DEFAULT;', "DROP"],
    ['DROP INDEX "identity_otp_request_phone_sent_idx";', "DROP"],
  ])("refuses unmarked %s (%s)", (statement, reason) => {
    expect(unmarkedDestructiveStatements(statement)).toEqual([{ line: 1, statement, reason }]);
  });

  it.each([
    'ALTER TABLE "tagihan" ALTER COLUMN "catatan" DROP NOT NULL;',
    'ALTER TABLE "tagihan" ADD COLUMN "status" text DEFAULT \'draf\' NOT NULL;',
    'ALTER TABLE "tagihan" ADD COLUMN "dibuat" timestamp with time zone NOT NULL DEFAULT now();',
    'CREATE INDEX "tagihan_status_idx" ON "tagihan" ("status");',
  ])("lets expand-only %s through", (statement) => {
    expect(unmarkedDestructiveStatements(statement)).toEqual([]);
  });

  it("does not mistake words inside a function body, a string or a quoted name for DDL", () => {
    const migration = [
      'CREATE FUNCTION "tariff_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$',
      "BEGIN",
      "  RAISE EXCEPTION 'tariff versions are append-only; drop or rename is refused';",
      "  DROP TABLE nothing;",
      "END;",
      "$$;--> statement-breakpoint",
      "COMMENT ON TABLE \"tagihan\" IS 'never DROP this';--> statement-breakpoint",
      'CREATE INDEX "drop_off_rename_idx" ON "pickup" ("drop_off_at");',
    ].join("\n");
    expect(unmarkedDestructiveStatements(migration)).toEqual([]);
  });

  it("names the line of a destructive statement after a multi-line one", () => {
    const migration = [
      'CREATE TABLE "a" (',
      '  "id" uuid PRIMARY KEY',
      ");",
      "--> statement-breakpoint",
      "",
      'ALTER TABLE "a" RENAME TO "b";',
    ].join("\n");
    expect(unmarkedDestructiveStatements(migration)).toEqual([
      { line: 6, statement: 'ALTER TABLE "a" RENAME TO "b";', reason: "RENAME" },
    ]);
  });
});
