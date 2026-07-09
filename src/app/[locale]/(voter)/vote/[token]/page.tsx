import { getTranslations } from "next-intl/server";

// SCAFFOLD (routing Phase 4) — voter ballot inside the voter chrome. The 5-screen flow
// (§8.3: option cards, review, cryptographic confirmation) and real token verification are
// owned by the voter-flow / service-layer specs and replace this body later.
export default async function VoteBallotPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // TODO(seam): token.service verifies here — hash = SHA-256(token), look up the VoterToken
  // (used=false, not expired), reject otherwise. No-op placeholder this phase; real
  // verification is owned by the voter-flow spec. The magic-link + QR both encode voteUrl(token).
  void token;

  const t = await getTranslations("voter.ballot");
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <h1 className="font-heading text-2xl font-semibold text-neutral-800">
        {t("title")}
      </h1>
      <p className="text-sm text-neutral-600">{t("subtitle")}</p>
    </div>
  );
}
