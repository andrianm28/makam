CREATE TABLE "scheduler_heartbeat" (
	"worker" text PRIMARY KEY NOT NULL,
	"beat_at" timestamp with time zone NOT NULL
);
