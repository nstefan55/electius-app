import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { VerifyForm } from "@/components/voter/verify-form";

// /verify/[id] — birač provjerava svoj verifikacijski kôd (future-updates-spec
// §Integrity #2). Nikakvo čitanje iz baze: stranica je ista za svaki id, pa ne
// potvrđuje postoje li izbori. Sve odluke donosi POST /api/verify, i to tek
// kad dobije pravi kôd.

// Konstantno, kao /results/[id]: naslov s imenom izbora bio bi proročište.
export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <VerifyForm electionId={id} />;
}
