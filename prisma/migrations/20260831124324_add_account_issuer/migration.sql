-- Account.issuer — traži ga better-auth 1.7.2 (uveden podizanjem 1.6.26 -> 1.7.2
-- u fb43c1a). Bez njega prijava vraća 401 "User not found", a registracija 500.
--
-- Tri koraka, jer je stupac obavezan a tablica nije prazna: dodaj kao nullable,
-- popuni, pa tek onda NOT NULL. Prisma bi inače tražila zadanu vrijednost, a
-- jedna zadana vrijednost ne može biti točna i za lokalne i za OAuth račune.

-- 1. Nullable, da postojeći redci prežive.
ALTER TABLE "accounts" ADD COLUMN "issuer" TEXT;

-- 2. Popuna. Vrijednosti su točno ono što knjižnica gradi:
--      createLocalAccountIssuer(id) -> 'local:' || id
--      createOAuthAccountIssuer(id) -> 'local:oauth:' || id
--    U 1.7.2 su lokalni davatelji samo 'credential' i 'siwe'; sve ostalo
--    (google, …) je OAuth. Knjižnica id provlači kroz encodeURIComponent, što
--    je za naše identifikatore ('credential', 'google') identiteta — davatelj s
--    posebnim znakovima u imenu tražio bi kodiranje i ovdje.
UPDATE "accounts"
SET "issuer" = CASE
  WHEN "providerId" IN ('credential', 'siwe') THEN 'local:' || "providerId"
  ELSE 'local:oauth:' || "providerId"
END
WHERE "issuer" IS NULL;

-- 3. Tek sada obavezan — u accountSchema je polje deklarirano kao required.
ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;
