import { ElectionWizard } from "@/components/elections/wizard/election-wizard";

// /elections/new — the 5-step creation wizard as a centered ~90% modal over
// the dashboard shell (user decision 2026-07-23). The route stays real and
// deep-linkable; the "modal" is page styling, not a client dialog. Session is
// enforced by the (app) layout choke point.
export default function NewElectionPage() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 md:p-[4vh_4vw]">
      <div className="h-full w-full overflow-hidden bg-neutral-50 shadow-lg md:h-[90vh] md:w-[90vw] md:rounded-2xl">
        <ElectionWizard />
      </div>
    </div>
  );
}
