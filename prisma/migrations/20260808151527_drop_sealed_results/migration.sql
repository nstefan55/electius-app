-- Ukloni Election.sealedResults.
--
-- Prekidac je obecavao "sakrij rezultate i od administratora do zatvaranja",
-- a to je vec ponasanje zadanog resultsMode = AFTER_CLOSE (resultsAccess vraca
-- "sealed" za ACTIVE bez LIVE). Stupac je pisao carobnjak, a citao ga je samo
-- GDPR izvoz -- nijedno ponasanje. Stupac koji korisnicki prekidac pise a nista
-- ne cita gori je od nepostojeceg: UI tvrdi promjenu koje nema.
ALTER TABLE "elections" DROP COLUMN "sealedResults";
