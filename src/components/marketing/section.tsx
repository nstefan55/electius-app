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

// Oznaka trake u odsjeku „Kako funkcionira” — pilula koja imenuje publiku.
// Postoji zato što odsjek ima dvije uzastopne trake koraka; bez naslova traka
// druga bi se čitala kao nastavak prve, a to je druga osoba i drugi uređaj.
export function TrackLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-center">
      <span className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-3.5 py-1 font-heading text-[0.78125rem] font-semibold tracking-[0.04em] text-brand-700">
        {children}
      </span>
    </div>
  );
}

// Jedan korak u traci: numerirani krug s ikonom + naslov + tekst.
// `n` se crta u vlastitoj piluli uz krug, a ne unutar njega, jer krug već nosi
// ikonu — broj u sredini značio bi izbor između to dvoje.
// `z-1` na krugu je nužan: spojnica <ol>-a prolazi kroz njegovu sredinu i bez
// slaganja bi se vidjela preko bijele pozadine kruga.
export function FlowStep({
  n,
  icon,
  title,
  body,
  tint = "bg-brand-50",
}: {
  n: number;
  icon: ReactNode;
  title: string;
  body: string;
  tint?: string;
}) {
  return (
    <li className="flex flex-col items-center text-center">
      <span
        className={`relative z-1 inline-flex size-14 items-center justify-center rounded-full border border-brand-100 ${tint}`}
      >
        {icon}
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 inline-flex size-5.5 items-center justify-center rounded-full bg-brand-700 text-[0.6875rem] font-bold text-white"
        >
          {n}
        </span>
      </span>
      <h3 className="mt-4 font-heading text-[1.0625rem] font-semibold text-neutral-800">
        {title}
      </h3>
      <p className="mt-2 max-w-[26em] text-[0.9375rem] leading-relaxed text-neutral-600">
        {body}
      </p>
    </li>
  );
}
