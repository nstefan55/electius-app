import { getTranslations } from "next-intl/server";
import { CircleCheckBig } from "lucide-react";
import { marketingHomeUrl } from "@/lib/urls";

// Odredište poveznice iz e-pošte nakon što je brisanje izvršeno
// (profile-settings-phase-4-spec §2). Sesija je u tom trenutku već mrtva, pa
// putanja mora biti u PUBLIC_AUTH_PATHS — inače bi vratar poslao na /login.
// Čisti poslužiteljski sastavni dio: nema što biti interaktivno.
export default async function AccountDeletedPage() {
  const t = await getTranslations("auth.accountDeleted");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-6 py-16">
      <div className="w-full max-w-110 rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-50 text-success-700">
          <CircleCheckBig className="size-7" />
        </span>
        <h1 className="font-heading mt-5 text-2xl font-bold text-neutral-800">
          {t("title")}
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-neutral-600">
          {t("body")}
        </p>
        <a
          href={marketingHomeUrl()}
          className="mt-7 inline-flex h-11 items-center justify-center rounded-md bg-brand-700 px-6 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand-600"
        >
          {t("home")}
        </a>
      </div>
    </main>
  );
}
