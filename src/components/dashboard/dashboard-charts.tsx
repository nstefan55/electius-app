"use client";

import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  sortRecent,
  type DashboardElection,
  type ElectionStatus,
} from "@/lib/elections-view";

// Canonical status hues (globals.css --color-status-*), as literals for recharts fills.
const STATUS_HEX: Record<ElectionStatus, string> = {
  ACTIVE: "#10b981",
  SCHEDULED: "#f59e0b",
  CLOSED: "#ef4444",
  DRAFT: "#3b82f6",
  ARCHIVED: "#6b7280",
};

const STATUS_KEYS = [
  "ACTIVE",
  "SCHEDULED",
  "CLOSED",
  "DRAFT",
  "ARCHIVED",
] as const;

const truncate = (s: string) => (s.length > 22 ? `${s.slice(0, 22)}…` : s);

// A: turnout % per non-archived election. B: count of all elections per status.
export function DashboardCharts({
  elections,
}: {
  elections: DashboardElection[];
}) {
  const t = useTranslations("dashboard.page");

  // fill per datum replaces the deprecated <Cell> child — Bar/Pie read entry.fill.
  const turnoutData = sortRecent(elections).map((e) => ({
    name: e.name,
    pct: e.voters > 0 ? Math.round((e.voted / e.voters) * 100) : 0,
    status: e.status,
    fill: STATUS_HEX[e.status],
  }));

  const statusData = STATUS_KEYS.map((status) => ({
    status,
    count: elections.filter((e) => e.status === status).length,
    fill: STATUS_HEX[status],
  })).filter((d) => d.count > 0);

  // Shared config: per-status label + color (also feeds the donut legend/tooltip).
  const config = {
    pct: { label: t("charts.turnoutTooltip") },
    count: { label: t("charts.statusTitle") },
    ...Object.fromEntries(
      STATUS_KEYS.map((s) => [
        s,
        { label: t(`status.${s}`), color: STATUS_HEX[s] },
      ]),
    ),
  } satisfies ChartConfig;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* A — Turnout by election */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading">
            {t("charts.turnoutTitle")}
          </CardTitle>
          <CardDescription>{t("charts.turnoutSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={config} className="h-72 w-full">
            <BarChart
              accessibilityLayer
              data={turnoutData}
              layout="vertical"
              margin={{ left: 12, right: 16 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tickLine={false}
                axisLine={false}
                tickFormatter={truncate}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="pct" radius={4} />

            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* B — Elections by status */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading">
            {t("charts.statusTitle")}
          </CardTitle>
          <CardDescription>{t("charts.statusSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={config}
            className="mx-auto aspect-square h-72"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent nameKey="status" hideLabel />}
              />
              <Pie
                data={statusData}
                dataKey="count"
                nameKey="status"
                innerRadius={60}
                strokeWidth={4}
              />

              <ChartLegend
                content={<ChartLegendContent nameKey="status" className="flex-wrap" />}
              />
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
