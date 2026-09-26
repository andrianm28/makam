import { fileStoreContract } from "@/adapters/file-store.contract";
import { wib } from "@/lib/time/jakarta";
import { FakeClock } from "./fake-clock";
import { FakeFileStore } from "./fake-files";

fileStoreContract("in-memory fake", () => {
  const clock = new FakeClock(wib("2026-10-01 09:00"));
  const store = new FakeFileStore({ clock });
  return {
    store,
    advance: (milliseconds) => clock.advance({ milliseconds }),
    open: async (url) => store.open(url),
    close: async () => {},
  };
});
