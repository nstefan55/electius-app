// Shared dashed placeholder for the not-yet-built facet bodies (results / voters).
// A content spec replaces the whole component when it fills the facet in.
export function FacetScaffold({
  heading,
  note,
}: {
  heading: string;
  note: string;
}) {
  return (
    <section className="rounded-lg border border-dashed border-border bg-neutral-50 p-6">
      <h2 className="font-heading text-lg font-semibold text-neutral-800">
        {heading}
      </h2>
      <p className="mt-1 text-sm text-neutral-600">{note}</p>
    </section>
  );
}
