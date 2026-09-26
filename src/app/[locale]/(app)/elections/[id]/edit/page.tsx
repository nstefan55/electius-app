import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/require-session";
import { getElectionForEdit } from "@/lib/db/elections";
import { resolveEntitlement } from "@/lib/services/entitlement.service";
import { toWizardData } from "@/lib/wizard-prefill";
import { ElectionWizard } from "@/components/elections/wizard/election-wizard";

// /elections/[id]/edit — čarobnjak u načinu uređivanja, isti okvir (~90% modal)
// kao /elections/new. Nepostojeće i tuđe izbore već odbija [id] layout (404);
// null ovdje znači da izbori postoje, ali više nisu DRAFT/SCHEDULED — umjesto
// 404 vraćamo administratora na pregled, gdje status objašnjava zašto.
// Prava zaštita je updateElection: ova stranica samo ne otvara obrazac.
export default async function EditElectionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const { organizationId } = await requireSession();

  const election = await getElectionForEdit(id, organizationId);
  if (!election) redirect(`/${locale}/elections/${id}`);

  const entitlement = await resolveEntitlement(id, organizationId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 md:p-[4vh_4vw]">
      <div className="h-full w-full overflow-hidden bg-neutral-50 shadow-lg md:h-[90vh] md:w-[90vw] md:rounded-2xl">
        <ElectionWizard
          entitlement={entitlement}
          editId={id}
          initial={toWizardData(election)}
        />
      </div>
    </div>
  );
}
