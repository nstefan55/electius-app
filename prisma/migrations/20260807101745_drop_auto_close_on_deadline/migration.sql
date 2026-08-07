-- Mrtav stupac: čarobnjak ga je prestao pisati (fix/expired-token-sends), a
-- čistač zatvara SVE izbore kojima je prozor gotov, neovisno o zastavici.
-- Snimka pečata (ElectionSnapshot) nikad ga nije nosila — arhive su netaknute.
ALTER TABLE "elections" DROP COLUMN "autoCloseOnDeadline";
