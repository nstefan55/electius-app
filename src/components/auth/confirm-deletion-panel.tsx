"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlert, LogIn, Trash2, TriangleAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { Spinner } from "@/components/ui/spinner";

// Ovdje se brisanje stvarno izvršava. Poziva se BetterAuthov GET
// /delete-user/callback BEZ callbackURL-a — s njim ruta odgovara 302 preusmjere-
// njem, a bez njega vraća 200 {success:true} ili JSON s kodom greške, što je
// jedini oblik na koji se može granati.
//
// Poveznica se NE troši ako sesije nema: BetterAuth prvo provjeri sesiju, pa tek
// onda potroši token. Zato "prijavite se pa ponovno otvorite poveznicu" radi.
type Failure =
  | "noToken"
  | "needsSignIn"
  | "invalidToken"
  | "subscriptionActive"
  | "sharedOrganization"
  | "failed";

// BetterAuthovi kodovi + naši iz beforeDelete → stanja panela.
function toFailure(code: string | undefined): Failure {
  switch (code) {
    case "FAILED_TO_GET_USER_INFO":
    case "SESSION_EXPIRED":
      return "needsSignIn";
    case "INVALID_TOKEN":
      return "invalidToken";
    case "subscriptionActive":
      return "subscriptionActive";
    case "sharedOrganization":
      return "sharedOrganization";
    default:
      return "failed";
  }
}

export function ConfirmDeletionPanel() {
  const t = useTranslations("auth.confirmDeletion");
  const locale = useLocale();
  const token = useSearchParams().get("token");
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function confirm() {
    if (!token || pending) return;
    setPending(true);
    setFailure(null);

    try {
      const response = await fetch(
        `/api/auth/delete-user/callback?token=${encodeURIComponent(token)}`,
      );
      if (response.ok) {
        // Sesija je upravo poništena (BetterAuth briše kolačić), pa tvrda
        // navigacija — vratar mora ponovno odlučiti bez kolačića.
        window.location.href = `/${locale}/account-deleted`;
        return;
      }
      const body = await response.json().catch(() => null);
      setFailure(toFailure(body?.code));
    } catch {
      setFailure("failed");
    }
    setPending(false);
  }

  if (!token) return <Notice kind="error" state="noToken" />;
  if (sessionPending) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label={t("checking")} className="size-9 border-2" />
      </div>
    );
  }
  if (failure) return <Notice kind="error" state={failure} />;
  if (!session) return <Notice kind="signIn" state="needsSignIn" />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3.5 rounded-md border-l-3 border-error-500 bg-error-50 p-4">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-error-700" />
        <div>
          <p className="text-sm font-semibold text-error-700">{t("warnTitle")}</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">
            {t.rich("warnBody", {
              email: session.user.email,
              b: (chunks) => (
                <span className="font-semibold text-neutral-800">{chunks}</span>
              ),
            })}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={confirm}
        disabled={pending}
        className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-error-700 text-base font-semibold text-white transition-colors hover:bg-error-500 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
      >
        {pending ? (
          <>
            <Spinner
              label={t("deleting")}
              className="size-4 border-2 border-white/40 border-t-white"
            />
            {t("deleting")}
          </>
        ) : (
          <>
            <Trash2 className="size-4.5" />
            {t("confirm")}
          </>
        )}
      </button>

      <Link
        href="/home"
        className="text-center text-sm font-medium text-neutral-600 hover:underline"
      >
        {t("cancel")}
      </Link>
    </div>
  );
}

// Jedan okvir za sva završna stanja; razlikuju se samo ikona i copy.
function Notice({
  kind,
  state,
}: {
  kind: "error" | "signIn";
  state: Failure;
}) {
  const t = useTranslations("auth.confirmDeletion");
  const signIn = kind === "signIn";
  const Icon = signIn ? LogIn : CircleAlert;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3.5">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
            signIn ? "bg-brand-50 text-brand-700" : "bg-error-50 text-error-700"
          }`}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-semibold text-neutral-800">
            {t(`${state}.title`)}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
            {t(`${state}.body`)}
          </p>
        </div>
      </div>

      <Link
        href={signIn ? "/login" : "/home"}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-brand-700 text-[15px] font-semibold text-white transition-colors hover:bg-brand-600"
      >
        {t(signIn ? "signIn" : "back")}
      </Link>
    </div>
  );
}
