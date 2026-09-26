/**
 * Every table in the app, gathered from the domain modules that own them.
 *
 * Each domain module declares its own tables in `src/domain/<module>/schema.ts`.
 * Only that module reads or writes them; other code goes through the module's
 * public functions. This file exists so Drizzle (client and drizzle-kit) sees
 * the whole schema in one place.
 */
export * from "@/domain/audit/schema";
export * from "@/domain/identity/schema";
export * from "@/domain/notifications/schema";
export * from "@/domain/operator-settings/schema";
export * from "@/domain/scheduler/schema";
export * from "@/domain/lokasi/schema";
export * from "@/domain/tariffs/schema";
export * from "@/domain/billing/schema";
