import { requireSession } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";
import { clearImage, storeImage } from "@/lib/services/image-upload.service";

// Avatar administratorova računa — piše User.image, stupac koji je dosad držao
// samo Googleov URL iz OAuth-a i nije imao svog pisca.
//
// Vlastita ruta, ne zajednički endpoint s "metom" u tijelu: meta iz tijela
// vratila bi korisnikov unos u odluku o tome koji se redak piše. Ovdje sve
// dolazi iz sesije.
//
// ponytail: avatar JEST osobni podatak, pa javna kanta više ne drži "nula
// osobnih podataka" kako tvrdi file-image-spec §2. Posljedice, po redu:
//  - brisanje računa (postavke, faza 5 / GDPR čl. 17) mora obrisati i objekt —
//    R2 ne sudjeluje u Postgres transakciji, pa to mora biti izričit poziv na
//    clearImage, inače fotografija ostaje iza obrisanog računa;
//  - ništa ne čisti kantu, pa je zadržavanje neograničeno (čl. 5(1)(e));
//  - javno čitanje znači trajni URL bez autentifikacije do fotografije.
// Prihvatljivo jer je riječ o administratorovoj vlastitoj slici koju sam
// učitava i briše — ali obveza brisanja mora ući u fazu 5.

// Sesija nosi e-poštu, a ne id; id treba za ključ objekta. E-pošta u ključu
// bila bi upravo ono što imageKey sprječava — osobni podatak u nazivu objekta.
async function currentUser(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true, image: true } });
}

export async function POST(request: Request) {
  const { user } = await requireSession();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }

  const account = await currentUser(user.email);
  if (!account) return Response.json({ error: "notFound" }, { status: 404 });

  const result = await storeImage({
    bytes: new Uint8Array(await file.arrayBuffer()),
    folder: "avatars",
    ownerId: account.id,
    // Googleov URL prolazi kroz istu putanju: nije iz naše kante, pa ga
    // brisanje preskoči umjesto da pokuša obrisati tuđi objekt.
    previousUrl: account.image,
    save: (image) => prisma.user.update({ where: { id: account.id }, data: { image } }),
  });
  if (!result.ok) return Response.json({ error: result.reason }, { status: 400 });

  return Response.json({ image: result.url });
}

export async function DELETE() {
  const { user } = await requireSession();

  const account = await currentUser(user.email);
  if (!account) return Response.json({ error: "notFound" }, { status: 404 });

  // Uklanjanje vraća inicijale, ne Googleovu sliku — nju bi vratila tek nova
  // prijava Googleom.
  await clearImage({
    previousUrl: account.image,
    save: (image) => prisma.user.update({ where: { id: account.id }, data: { image } }),
  });

  return Response.json({ image: null });
}
