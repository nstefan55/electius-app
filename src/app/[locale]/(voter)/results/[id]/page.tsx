import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PublicResults } from "@/components/voter/public-results";
import { StateHero } from "@/components/voter/voter-ui";
import { getPublicResultsElection } from "@/lib/db/elections";
import { resultsDetailAccess } from "@/lib/elections-view";

// Bez naslova i bez indeksiranja, na OBJE varijante zaslona.
//
// Naslov se ne postavlja namjerno i nema dohvata: <title> s imenom izbora na
// stranici koja odbija potvrditi da izbor postoji poništio bi cijelo pravilo iz
// §4. Konstanta umjesto uvjeta znači da naslov nema kako procuriti — stranica
// nasljeđuje zadani naslov iz korijenskog layouta, koji ne otkriva ništa.
// Marketinška naslovnica je jedina stranica koja zaslužuje indeks; ova imenuje
// organizaciju i pobjednika.
export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

// Javna stranica rezultata (public-results-page-spec). Biračka odora
// ((voter)/layout.tsx, 56px zaglavlje, max-w-voter 390px) već je oko nje.
export default async function PublicResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const election = await getPublicResultsElection(id);

  // JEDAN odgovor na sva četiri odbijanja — nepostojeći id, resultsVisible=false,
  // nacrt/zakazani izbori i zapečaćeni zbroj — i to bajt po bajt isti. Sve što
  // ih razlikuje pretvara URL u potvrdu o postojanju izbora, a kod zapečaćenih
  // usto odaje da izbori u tijeku skrivaju zbroj.
  //
  // `resultsVisible` se I-spaja s pravilom pristupa, i to treba reći naglas:
  // objavljeni izbori koji još traju prikazuju skriveni zaslon, jer zbroja još
  // nema. Pristup je "closed" (D4b) — dakle CLOSED ili ARCHIVED, nikad LIVE u
  // tijeku: javna ljestvica dok se glasuje mijenja ishod koji izvještava, a Pro
  // obećanje ("pratite rast izlaznosti") upućeno je administratoru, ne svijetu.
  // Arhiviranje je pečat, ne povlačenje, pa arhivirani izbori zadržavaju
  // stranicu — resultsDetailAccess se od resultsAccess razlikuje točno u tome.
  const published =
    election?.resultsVisible && resultsDetailAccess(election) === "closed";

  if (!published) {
    const t = await getTranslations("voter.results");
    return (
      <StateHero
        icon={Lock}
        tone="neutral"
        title={t("hiddenTitle")}
        sub={t("hiddenSub")}
        topPad
      />
    );
  }

  return <PublicResults election={election} />;
}
