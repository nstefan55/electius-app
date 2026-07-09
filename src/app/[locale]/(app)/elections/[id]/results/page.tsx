import { useTranslations } from "next-intl";
import { FacetScaffold } from "@/components/elections/facet-scaffold";

// Results facet — canonical admin results detail surface (target of /results rows and
// /archive row actions). Scaffold only; content owned by election-results-id-phase-*.
// No fetch/authz here — the layout owns both. Reads nothing yet (placeholder).
export default function ElectionResultsPage() {
  const t = useTranslations("dashboard.election.resultsFacet");
  return <FacetScaffold heading={t("heading")} note={t("note")} />;
}
