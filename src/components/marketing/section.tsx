import type { ReactNode } from "react";

// Zaglavlje odsjeka: kicker + h2 + podnaslov. U prototipu se ponavlja 4×.
export function SectionHeader({
  kicker,
  title,
  subtitle,
  className = "",
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-190 text-center ${className}`}>
      <div className="mb-3.5 font-heading text-[0.8125rem] font-semibold tracking-[0.08em] text-brand-700 uppercase">
        {kicker}
      </div>
      <h2 className="mb-4 font-heading text-[2rem] leading-tight font-bold tracking-tight text-brand-900 sm:text-[2.5rem]">
        {title}
      </h2>
      {subtitle ? (
        <p className="text-[1.125rem] leading-relaxed text-neutral-600">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

// Kartica s ikonom: 48px kvadrat u boji + h3 + tekst. U prototipu 9× (Problem + Značajke).
// Ikona stiže gotova jer joj boja poteza varira po odsjeku.
export function IconCard({
  icon,
  tint,
  title,
  body,
}: {
  icon: ReactNode;
  tint: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-7 shadow-sm">
      <div
        className={`mb-4.5 inline-flex size-12 items-center justify-center rounded-lg ${tint}`}
      >
        {icon}
      </div>
      <h3 className="mb-2.5 font-heading text-[1.1875rem] font-semibold text-neutral-800">
        {title}
      </h3>
      <p className="text-[0.9375rem] leading-relaxed text-neutral-600">{body}</p>
    </div>
  );
}
