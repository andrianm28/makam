// Moves the browser source maps out of the directory Next serves and into the
// image, so they can be uploaded to GlitchTip (scripts/ci/upload-sourcemaps.sh)
// without becoming a public copy of the source.
//
// `next build` writes them under .next/static, which the web server hands to
// anyone who asks for /_next/static/chunks/<name>.js.map: the application's
// TypeScript, readable by anyone. So every .map moves to dist/sourcemaps/ (its
// path under .next/static kept, though sentry-cli matches an artifact to its map
// by the debug id the build injected, not by name) and the `//# sourceMappingURL=`
// comment is dropped, so no browser asks for a file that is not there.
//
// Fails when there is nothing to move: an image with no maps would deploy
// happily and leave GlitchTip showing minified JavaScript forever.
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCEDIR = ".next/static";
const TARGETDIR = "dist/sourcemaps";
/** The files a `sourceMappingURL` comment can sit at the end of. */
const ARTIFACTS = [".js", ".mjs", ".cjs", ".css"];
/**
 * The comment at the end of a chunk, or the CSS form of it. The trailing
 * newline of the file is left where it was; the `debugId` line before it stays,
 * because that is how the upload finds the map.
 */
const SOURCE_MAPPING_URL = [
  /\n?\/\/[#@] sourceMappingURL=[^\s'"`]+[ \t]*(?=\n*$)/,
  /\n?\/\*[#@] sourceMappingURL=[^\s*]+[ \t]*\*\/[ \t]*(?=\n*$)/,
];

/** Every file under `dir`, relative to it. */
async function filesUnder(dir, prefix = "") {
  const entries = await readdir(path.join(dir, prefix), { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(dir, relative)));
    else found.push(relative);
  }
  return found;
}

async function stripSourceMappingUrl(file) {
  const content = await readFile(file, "utf8");
  const stripped = SOURCE_MAPPING_URL.reduce((text, pattern) => text.replace(pattern, ""), content);
  if (stripped !== content) await writeFile(file, stripped);
}

const files = await filesUnder(SOURCEDIR);
const maps = files.filter((file) => file.endsWith(".map"));
if (maps.length === 0) {
  console.error(
    `No source map under ${SOURCEDIR}: the build did not produce them, so the ci.yml upload step would send nothing.`,
  );
  process.exit(1);
}

for (const map of maps) {
  const target = path.join(TARGETDIR, map);
  await mkdir(path.dirname(target), { recursive: true });
  await rename(path.join(SOURCEDIR, map), target);
}
for (const file of files.filter((name) => ARTIFACTS.includes(path.extname(name)))) {
  await stripSourceMappingUrl(path.join(SOURCEDIR, file));
}
console.log(`Moved ${maps.length} source map(s) from ${SOURCEDIR} to ${TARGETDIR} and dropped their sourceMappingURL comments`);
