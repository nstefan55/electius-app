// Picks the right nested `notFound.*` copy given a getTranslations("notFound")
// translator — keeps not-found.tsx call sites terse. Plain module (no "use
// client") so Server Components can call it directly — not-found-card.tsx
// itself is a Client Component (its "Go back" button), and a client module's
// exports can't be invoked from the server. `link-expired` has no caller yet
// (see 404-page-redesign-spec §"link-expired — not wired yet").
export function notFoundCopy(
  t: (key: string) => string,
  reason: "generic" | "link-expired",
) {
  return reason === "link-expired"
    ? { title: t("linkExpired.title"), description: t("linkExpired.description") }
    : { title: t("generic.title"), description: t("generic.description") };
}
