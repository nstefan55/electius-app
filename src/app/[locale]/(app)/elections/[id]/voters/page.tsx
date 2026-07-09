import { useTranslations } from "next-intl";
import { FacetScaffold } from "@/components/elections/facet-scaffold";

// Voters facet — per-election voter management (target of /voters rows). Scaffold only;
// content owned by the voters spec. No fetch/authz here — the layout owns both.
export default function ElectionVotersPage() {
  const t = useTranslations("dashboard.election.votersFacet");
  return <FacetScaffold heading={t("heading")} note={t("note")} />;
}
