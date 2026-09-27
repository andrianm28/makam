import type { SentryBuildOptions } from "@sentry/nextjs/config";
import { z } from "zod";

/**
 * The build-time half of error monitoring (ticket 72, ADR 0002): the source maps
 * and the release are facts about an image, decided while it is built, while the
 * DSN the app reports to is a runtime value (one image serves staging and
 * production, `src/lib/env.ts`).
 *
 * The build **never** talks to GlitchTip. `sourcemaps.disable: "disable-upload"`
 * makes the SDK generate the maps and the debug ids and stop there, and
 * `deleteSourcemapsAfterUpload: false` leaves them in the image for
 * `scripts/ci/upload-sourcemaps.sh` to upload with a token that only ever exists
 * as a GitHub secret. That is what keeps a token out of every image layer, and
 * it holds even if one is somehow present in the build environment.
 *
 * The organisation, project, host and token are still named here, and the host
 * is an https URL or nothing: the SDK's own default is `https://sentry.io`,
 * and ADR 0002 keeps error data (and therefore source) inside Indonesia.
 */

const emptyToUndefined = (value: unknown) => (value === "" || value === undefined ? undefined : value);

const buildEnvSchema = z.object({
  /** The GlitchTip instance, e.g. https://errors.makam.co.id. Never sentry.io, never a relative path. */
  SENTRY_URL: z.preprocess(emptyToUndefined, z.url({ protocol: /^https$/, hostname: /[.-]/ }).optional()),
  SENTRY_ORG: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SENTRY_PROJECT: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** Empty in the build: a token here would live in the image's history. ci.yml's `sourcemaps` job has it. */
  SENTRY_AUTH_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** The commit this image is built from; the release name in GlitchTip. A build argument, not a secret. */
  SENTRY_RELEASE: z.preprocess(emptyToUndefined, z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).optional()),
});

/** What `next.config.ts` hands to `withSentryConfig`, plus the Next.js switch that keeps the maps. */
export interface SentryBuildSettings {
  /** Browser source maps: the SDK only turns these on itself when it uploads, and here ci.yml does. */
  productionBrowserSourceMaps: boolean;
  /** The GlitchTip organisation and project the maps belong to. Empty in the build: the upload is CI's. */
  org?: string;
  project?: string;
  /** Empty in the build, and it must stay that way: see `sourcemaps.disable` below. */
  authToken?: string;
  /** The GlitchTip instance. Never sentry.io, never left out. */
  sentryUrl?: string;
  sourcemaps: NonNullable<SentryBuildOptions["sourcemaps"]>;
  release: NonNullable<SentryBuildOptions["release"]>;
}

function parseBuildEnv(source: Record<string, string | undefined>): z.infer<typeof buildEnvSchema> {
  const parsed = buildEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid build environment: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/**
 * The build-time error-monitoring settings, read from the build environment
 * (the Dockerfile's `SENTRY_RELEASE` build argument and whatever else the
 * builder sets). Throws on a `SENTRY_URL` that is not an https URL rather than
 * letting the SDK fall back to sentry.io.
 */
export function sentryBuildSettings(source: Record<string, string | undefined> = process.env): SentryBuildSettings {
  const env = parseBuildEnv(source);
  return {
    productionBrowserSourceMaps: true,
    org: env.SENTRY_ORG,
    project: env.SENTRY_PROJECT,
    authToken: env.SENTRY_AUTH_TOKEN,
    sentryUrl: env.SENTRY_URL,
    sourcemaps: {
      // Generate the maps and the debug ids, upload nothing from here: the token
      // belongs to the ci.yml step that uploads them out of the image.
      disable: "disable-upload",
      // ...so the maps must survive the build for that step to find.
      deleteSourcemapsAfterUpload: false,
    },
    release: env.SENTRY_RELEASE ? { name: env.SENTRY_RELEASE } : {},
  };
}
