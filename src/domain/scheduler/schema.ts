import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Owned by the scheduler module. One row per worker process kind. */
export const schedulerHeartbeat = pgTable("scheduler_heartbeat", {
  worker: text("worker").primaryKey(),
  beatAt: timestamp("beat_at", { withTimezone: true, mode: "date" }).notNull(),
});
