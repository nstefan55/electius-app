// Shared settings-card chrome (design prototype: header block + body + footer
// row). Phases 2–5 append more cards with the same skeleton.
export function SettingsCard({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-200 px-6 py-5">
        <h2 className="font-heading text-xl font-semibold text-neutral-800">
          {title}
        </h2>
        <p className="mt-1 text-[13px] text-neutral-600">{subtitle}</p>
      </div>
      <div className="flex flex-col gap-4.5 p-6">{children}</div>
      {footer && (
        <div className="flex justify-end border-t border-neutral-200 bg-neutral-50 px-6 py-3.5">
          {footer}
        </div>
      )}
    </section>
  );
}
