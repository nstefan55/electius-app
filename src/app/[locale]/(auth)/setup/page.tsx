import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SetupForm } from "@/components/auth/setup-form";

// Account setup (setup-page-spec): the post-signup step that creates the
// organization and completes the admin's profile — requireSession() bounces
// org-less users here, so this page uses the raw session (requireSession()
// itself would loop). Session invalid despite the proxy's cookie-presence
// check → back to /login.
export default async function SetupPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${await getLocale()}/login`);

  // Revisit prefill — an admin who already has an org edits it in place.
  const admin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      termsAcceptedAt: true,
      organization: {
        select: { name: true, type: true, termsAcceptedAt: true },
      },
    },
  });

  const [firstName = "", ...rest] = session.user.name.trim().split(/\s+/);
  return (
    <SetupForm
      email={session.user.email}
      image={session.user.image ?? null}
      initialFirstName={firstName}
      initialLastName={rest.join(" ")}
      initialOrganizationName={admin?.organization?.name ?? ""}
      initialOrganizationType={admin?.organization?.type ?? ""}
      // Kvačica se skriva čim pristanak POSTOJI — na organizaciji ili na
      // korisniku. Korisnikov zapis nastaje na registraciji (v0.9.69), pa
      // e-mail put ovdje više ništa ne potvrđuje; completeSetup samo prepiše
      // njegov datum na organizaciju. Ostaje vidljiva Googleovu putu, koji
      // kvačicu na registraciji ne prolazi — vidi komentar u actions/setup.ts.
      termsAccepted={
        admin?.organization?.termsAcceptedAt != null ||
        admin?.termsAcceptedAt != null
      }
    />
  );
}
