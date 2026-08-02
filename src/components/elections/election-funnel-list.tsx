import { ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/elections/status-badge";
import { UrlPagination } from "@/components/ui/pagination";
import {
  formatVotingDate,
  type DashboardElection,
} from "@/lib/elections-view";

// Cross-election list scaffold whose rows deep-link into a nested facet
// (/elections/[id]/results or /voters). Shared by the /results and /voters pages;
// rich list UI/filters are owned by the respective content specs.
//
// Stranicanje je poslužiteljsko: ovu listu ništa ne filtrira na klijentu, pa
// `skip`/`take` ne može sakriti podudaranje (pagination-spec).
export function ElectionFunnelList({
  title,
  subtitle,
  empty,
  elections,
  hrefFor,
  page,
  pageCount,
  basePath,
}: {
  title: string;
  subtitle: string;
  empty: string;
  elections: DashboardElection[];
  hrefFor: (id: string) => string;
  page: number;
  pageCount: number;
  basePath: string;
}) {
  const locale = useLocale();
  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold text-neutral-800">
          {title}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
      </header>

      {elections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-neutral-50 p-6 text-sm text-neutral-600">
          {empty}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-white">
          {elections.map((e) => {
            const pct = e.voters > 0 ? Math.round((e.voted / e.voters) * 100) : 0;
            return (
              <li key={e.id} className="border-b border-border last:border-b-0">
                <Link
                  href={hrefFor(e.id)}
                  className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-brand-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-[0.9375rem] font-semibold text-neutral-800">
                      {e.name}
                    </div>
                    <div className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                      {formatVotingDate(e.opens, locale)} –{" "}
                      {formatVotingDate(e.closes, locale)} · {e.voted}/
                      {e.voters} ({pct}%)
                    </div>
                  </div>
                  <StatusBadge status={e.status} />
                  <ChevronRight className="size-4 text-neutral-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <UrlPagination
        page={page}
        pageCount={pageCount}
        basePath={basePath}
        className="mt-6"
      />
    </div>
  );
}
