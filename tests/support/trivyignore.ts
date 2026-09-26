/**
 * The policy for `.trivyignore` (ticket 71): every accepted exception to the
 * image scan names its reason in a `#` comment directly above it and an expiry
 * as `exp:YYYY-MM-DD` (Trivy stops ignoring it after that date, so the scan
 * fails again and the exception must be looked at). Returns what breaks it.
 */
export function trivyIgnoreProblems(file: string): string[] {
  const problems: string[] = [];
  const lines = file.split("\n");
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const [id, ...options] = line.split(/\s+/);
    const where = `line ${index + 1}: ${id}`;
    if (!lines[index - 1]?.trim().startsWith("#")) problems.push(`${where} has no reason (a # comment on the line above)`);
    const expiry = options.find((option) => option.startsWith("exp:"));
    if (!expiry) problems.push(`${where} has no expiry (add exp:YYYY-MM-DD)`);
    else if (!isCalendarDate(expiry.slice("exp:".length))) {
      problems.push(`${where} has an invalid expiry ${expiry} (use exp:YYYY-MM-DD)`);
    }
  });
  return problems;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
