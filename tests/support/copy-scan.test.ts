import { describe, expect, it } from "vitest";
import { ticketMentions } from "./copy-scan";

describe("finding internal ticket numbers in user-facing copy", () => {
  it("finds one in a string literal and in JSX text", () => {
    const source = `const a = "Segera hadir (tiket 17).";\nexport const B = () => <p>Menunggu tiket 60</p>;`;
    expect(ticketMentions(source, "x.tsx").map((m) => m.line)).toEqual([1, 2]);
  });

  it("finds one in JSX text split across lines", () => {
    const source = `export const B = () => (\n  <p>\n    Segera hadir (tiket\n    17).\n  </p>\n);`;
    expect(ticketMentions(source, "x.tsx")).toHaveLength(1);
  });

  it("is not fooled by a regex literal with escaped slashes before the copy", () => {
    const source = `const re = /https:\\/\\//; const msg = "Lihat tiket 60";`;
    expect(ticketMentions(source, "x.ts")).toHaveLength(1);
  });

  it("ignores comments, and a // inside a string is not a comment", () => {
    const source = `// tiket 17 in a comment\n/* tiket 18 */\nconst url = "https://makam.co.id"; // tiket 19\nconst ok = "Segera hadir.";`;
    expect(ticketMentions(source, "x.ts")).toEqual([]);
  });

  it("matches regardless of case", () => {
    expect(ticketMentions(`const t = "Tiket 5";`, "x.ts")).toHaveLength(1);
  });
});
