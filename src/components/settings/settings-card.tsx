// Shared settings-card chrome (design prototype: header block + body + footer
// row). Phases 2–5 append more cards with the same skeleton.
export function SettingsCard({
  title,
  subtitle,
  headerAside,
  bodyClassName = "flex flex-col gap-4.5 p-6",
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  // Badge slot desno u zaglavlju (Pro, Uskoro…) — bez rasporeda, poziva ga slaže.
  headerAside?: React.ReactNode;
  // Kartice s vlastitim retcima nose svoj razmak.
  bodyClassName?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-5">
        <div>
          <h2 className="font-heading text-xl font-semibold text-neutral-800">
            {title}
          </h2>
          <p className="mt-1 text-[0.8125rem] text-neutral-600">{subtitle}</p>
        </div>
        {headerAside}
      </div>
      <div className={bodyClassName}>{children}</div>
      {footer && (
        <div className="flex justify-end border-t border-neutral-200 bg-neutral-50 px-6 py-3.5">
          {footer}
        </div>
      )}
    </section>
  );
}
