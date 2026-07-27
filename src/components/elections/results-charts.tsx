"use client";

import { Bar, BarChart, CartesianGrid, Label, Pie, PieChart, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatVotingDate } from "@/lib/elections-view";
import type { DayBucket } from "@/lib/results-view";

// Grafovi na stranici rezultata. Klijentske komponente jer recharts mjeri DOM;
// sve ostalo na stranici renderira poslužitelj.
//
// Koristi već postojeći recharts + shadcn chart iz nadzorne ploče — bez nove
// biblioteke (election-results-id-phase-2-spec).

const BRAND = "#1D4ED8";
const REMAINDER = "#E5E7EB";

const CARD = "rounded-lg border border-neutral-200 bg-white shadow-sm";
const CARD_HEAD =
  "flex items-center justify-between gap-3 border-b border-neutral-200 px-6 py-4.5";
const CARD_TITLE = "font-heading text-lg font-semibold text-neutral-800";

export interface ChartLabels {
  dayChart: string;
  dayLegend: string;
  donut: string;
  donutCast: string;
  donutRemain: string;
  empty: string;
}

// Dnevni zbroj predanih listića. Samo agregat po danu — nikad pojedinačni listić
// ni točno vrijeme glasanja.
export function VotesPerDayChart({
  days,
  labels,
  locale,
}: {
  days: DayBucket[];
  labels: ChartLabels;
  locale: string;
}) {
  const data = days.map((d) => ({
    day: formatVotingDate(`${d.day}T00:00:00.000Z`, locale),
    votes: d.votes,
  }));

  const config = {
    votes: { label: labels.dayLegend, color: BRAND },
  } satisfies ChartConfig;

  return (
    <section className={CARD}>
      <div className={CARD_HEAD}>
        <h2 className={CARD_TITLE}>{labels.dayChart}</h2>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-neutral-600">
          <span className="size-2.25 rounded-[2px] bg-brand-700" />
          {labels.dayLegend}
        </span>
      </div>
      <div className="px-6 py-5">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-600">
            {labels.empty}
          </p>
        ) : (
          <ChartContainer config={config} className="h-50 w-full">
            <BarChart accessibilityLayer data={data} margin={{ top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="votes" fill={BRAND} radius={[6, 6, 2, 2]} />
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </section>
  );
}

// Predani listići naspram ukupnog biračkog tijela.
export function TurnoutDonut({
  votesCast,
  voters,
  labels,
  locale,
}: {
  votesCast: number;
  voters: number;
  labels: ChartLabels;
  locale: string;
}) {
  const nf = new Intl.NumberFormat(locale === "hr" ? "hr-HR" : "en-US");
  const remaining = Math.max(0, voters - votesCast);

  const data = [
    { key: "cast", value: votesCast, fill: BRAND },
    { key: "remaining", value: remaining, fill: REMAINDER },
  ];

  const config = {
    value: { label: labels.donut },
    cast: { label: labels.donutCast, color: BRAND },
    remaining: { label: labels.donutRemain, color: REMAINDER },
  } satisfies ChartConfig;

  return (
    <section className={CARD}>
      <div className="border-b border-neutral-200 px-6 py-4.5">
        <h2 className={CARD_TITLE}>{labels.donut}</h2>
      </div>
      <div className="flex flex-col items-center gap-4.5 px-6 py-6">
        <ChartContainer config={config} className="aspect-square h-46.5 w-full">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent nameKey="key" hideLabel />}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="key"
              innerRadius={62}
              outerRadius={88}
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
            >
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox)) return null;
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-neutral-800 font-heading text-[32px] font-bold"
                      >
                        {nf.format(votesCast)}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 24}
                        className="fill-neutral-600 text-[12.5px]"
                      >
                        {labels.donutCast}
                      </tspan>
                    </text>
                  );
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>

        <div className="flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <LegendItem
            color={BRAND}
            label={`${labels.donutCast} · ${nf.format(votesCast)}`}
          />
          <LegendItem
            color={REMAINDER}
            label={`${labels.donutRemain} · ${nf.format(remaining)}`}
          />
        </div>
      </div>
    </section>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="size-2.75 rounded-[3px]"
        style={{ background: color }}
        aria-hidden
      />
      <span className="text-[13px] text-neutral-600">{label}</span>
    </div>
  );
}
