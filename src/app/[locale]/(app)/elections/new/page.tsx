import { requireSession } from "@/lib/auth/require-session";
import { resolveEntitlement } from "@/lib/services/entitlement.service";
import { ElectionWizard } from "@/components/elections/wizard/election-wizard";

// /elections/new — the 5-step creation wizard as a centered ~90% modal over
// the dashboard shell (user decision 2026-07-23). The route stays real and
// deep-linkable; the "modal" is page styling, not a client dialog. Session is
// enforced by the (app) layout choke point.
//
// Pravo se razrješava ovdje i spušta u čarobnjak cijelo, ne kao izračunata
// granica: korak 3 iz njega izvodi granicu, korak 4 zaključava dva Pro
// prekidača, a oba koraka trebaju znati i postoji li plan iznad ovoga. Jedan
// prop pokriva tri zaštite i ne mijenja se kad stigne kupnja pojedinog izbora.
//
// Prava zaštita je i dalje createElection — ovo je najava, ne provjera.
// electionId je null jer izbori u tom trenutku još ne postoje.
export default async function NewElectionPage() {
  const { organizationId } = await requireSession();
  const entitlement = await resolveEntitlement(null, organizationId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 md:p-[4vh_4vw]">
      <div className="h-full w-full overflow-hidden bg-neutral-50 shadow-lg md:h-[90vh] md:w-[90vw] md:rounded-2xl">
        <ElectionWizard entitlement={entitlement} />
      </div>
    </div>
  );
}
