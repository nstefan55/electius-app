import { requireSession } from "@/lib/auth/require-session";
import { voterCap } from "@/lib/entitlements";
import { resolveEntitlement } from "@/lib/services/entitlement.service";
import { ElectionWizard } from "@/components/elections/wizard/election-wizard";

// /elections/new — the 5-step creation wizard as a centered ~90% modal over
// the dashboard shell (user decision 2026-07-23). The route stays real and
// deep-linkable; the "modal" is page styling, not a client dialog. Session is
// enforced by the (app) layout choke point.
//
// Granica birača se razrješava ovdje i spušta u čarobnjak: korak 3 mora
// upozoriti PRIJE nego što se u popis nakupi 300 redaka. Prava zaštita je i
// dalje createElection — ovo je samo najava, ne provjera. electionId je null
// jer izbori u tom trenutku još ne postoje.
export default async function NewElectionPage() {
  const { organizationId } = await requireSession();
  const cap = voterCap(await resolveEntitlement(null, organizationId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 md:p-[4vh_4vw]">
      <div className="h-full w-full overflow-hidden bg-neutral-50 shadow-lg md:h-[90vh] md:w-[90vw] md:rounded-2xl">
        <ElectionWizard voterCap={cap} />
      </div>
    </div>
  );
}
