import { requireSession } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";
import { clearImage, storeImage } from "@/lib/services/image-upload.service";

// Logotip organizacije. Route handler jer multipart tijelo i statusni kodovi
// ne idu kroz server akciju.
//
// organizationId dolazi ISKLJUČIVO iz sesije. Nikad iz tijela zahtjeva — time
// je pisanje u tuđu organizaciju nemoguće po konstrukciji, ne po provjeri.
// Zato avatar ima svoju rutu umjesto jednog endpointa s "metom" u tijelu:
// takav parametar bi vratio korisnikov unos u odluku o tome što se piše.

export async function POST(request: Request) {
  const { organizationId } = await requireSession();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { logoUrl: true },
  });
  if (!organization) return Response.json({ error: "notFound" }, { status: 404 });

  const result = await storeImage({
    bytes: new Uint8Array(await file.arrayBuffer()),
    folder: "logos",
    ownerId: organizationId,
    previousUrl: organization.logoUrl,
    save: (logoUrl) =>
      prisma.organization.update({ where: { id: organizationId }, data: { logoUrl } }),
  });
  if (!result.ok) return Response.json({ error: result.reason }, { status: 400 });

  return Response.json({ logoUrl: result.url });
}

export async function DELETE() {
  const { organizationId } = await requireSession();

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { logoUrl: true },
  });
  if (!organization) return Response.json({ error: "notFound" }, { status: 404 });

  await clearImage({
    previousUrl: organization.logoUrl,
    save: (logoUrl) =>
      prisma.organization.update({ where: { id: organizationId }, data: { logoUrl } }),
  });

  return Response.json({ logoUrl: null });
}
