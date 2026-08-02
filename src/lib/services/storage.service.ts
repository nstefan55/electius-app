import "server-only";

import { AwsClient } from "aws4fetch";

// Jedina datoteka koja zna da R2 postoji (file-image-spec §9). Sve ostalo barata
// ključevima i URL-ovima.
//
// R2 govori S3, pa je potreban SigV4 potpis. aws4fetch potpisuje običan fetch —
// za PUT, GET i DELETE jednog objekta cijeli AWS SDK je nekoliko megabajta
// strojarije koja se učita u svakom hladnom startu.
//
// Dvije kante, jer je javni pristup u R2 postavka KANTE, ne prefiksa: logotipi
// moraju biti čitljivi svima, izvještaji ne smiju biti nikome (sadrže zbrojeve
// izbora kojima je resultsVisible false).
//
// ponytail: učitavanje ide kroz poslužitelj. 2 MB stane u Vercelovu granicu tijela
// od ~4,5 MB, pa je to jedan skok bez CORS-a i bez osirotjelog objekta ako
// korisnik prekine. Presigned izravno u R2 je nadogradnja tek ako neki sadržaj
// prijeđe granicu.

// Kanta je OBVEZAN prvi argument, bez zadane vrijednosti. Ovaj parametar odlučuje
// je li objekt čitljiv cijelom svijetu — zadana vrijednost znači da bi izvještaj
// tiho završio u javnoj kanti ako netko zaboravi argument.
export type Bucket = "public" | "private";

// Vlastiti token po kanti. Imena moraju biti različita: ista varijabla dvaput u
// .env datoteci znači da jedna tiho pobijedi, a koja, ovisi o redoslijedu čitanja.
const BUCKETS = {
  public: {
    name: "R2_BUCKET_PUBLIC",
    accessKeyId: "R2_LOGO_ACCESS_KEY_ID",
    secretAccessKey: "R2_LOGO_SECRET_ACCESS_KEY",
  },
  private: {
    name: "R2_BUCKET_PRIVATE",
    accessKeyId: "R2_ACCESS_KEY_ID",
    secretAccessKey: "R2_SECRET_ACCESS_KEY",
  },
} as const;

function env(name: string): string {
  const value = process.env[name];
  // Bez tihog no-opa: kod koji "uspije" bez spremljene datoteke je gori od pada.
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const clients = new Map<Bucket, AwsClient>();

function r2(bucket: Bucket): AwsClient {
  let client = clients.get(bucket);
  if (!client) {
    const conf = BUCKETS[bucket];
    client = new AwsClient({
      accessKeyId: env(conf.accessKeyId),
      secretAccessKey: env(conf.secretAccessKey),
      service: "s3",
      region: "auto",
    });
    clients.set(bucket, client);
  }
  return client;
}

function objectEndpoint(bucket: Bucket, key: string): string {
  const account = env("R2_ACCOUNT_ID");
  return `https://${account}.r2.cloudflarestorage.com/${env(BUCKETS[bucket].name)}/${key}`;
}

/** Javni URL objekta — ono što ide u Organization.logoUrl. Samo javna kanta. */
export function objectUrl(key: string): string {
  return `${env("R2_PUBLIC_URL").replace(/\/+$/, "")}/${key}`;
}

/** Ključ natrag iz javnog URL-a; null ako URL nije iz naše kante. */
export function keyFromUrl(url: string): string | null {
  const base = `${env("R2_PUBLIC_URL").replace(/\/+$/, "")}/`;
  return url.startsWith(base) ? url.slice(base.length) : null;
}

export async function putObject(
  bucket: Bucket,
  key: string,
  // Uint8Array<ArrayBuffer>, ne goli Uint8Array: fetch ne prima poglede nad
  // SharedArrayBuffer, pa razlika mora ostati u tipu.
  body: Uint8Array<ArrayBuffer>,
  contentType: string,
): Promise<void> {
  const response = await r2(bucket).fetch(objectEndpoint(bucket, key), {
    method: "PUT",
    body,
    headers: {
      // Tip se izvodi iz magičnih bajtova (upload-validation), nikad iz onoga
      // što je poslao preglednik.
      "Content-Type": contentType,
      // R2 odbija PUT bez duljine (411 MissingContentLength) — fetch u Nextu je
      // ne postavi sam. Zaglavlje je na aws4fetch popisu nepotpisivih, pa ne
      // dira potpis.
      "Content-Length": String(body.byteLength),
    },
  });
  if (!response.ok) {
    throw new Error(`R2 PUT ${key} failed: ${response.status} ${await response.text()}`);
  }
}

/**
 * Dohvat objekta. Vraća sirovi Response da ruta može proslijediti `body` kao
 * tok — spremljeni PDF se nikad ne učita cijeli u memoriju.
 * `null` znači da objekta nema (ključ u bazi pokazuje u prazno).
 */
export async function getObject(bucket: Bucket, key: string): Promise<Response | null> {
  const response = await r2(bucket).fetch(objectEndpoint(bucket, key));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`R2 GET ${key} failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

export async function deleteObject(bucket: Bucket, key: string): Promise<void> {
  const response = await r2(bucket).fetch(objectEndpoint(bucket, key), { method: "DELETE" });
  // R2 vraća 204 i za nepostojeći ključ — brisanje je idempotentno.
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 DELETE ${key} failed: ${response.status} ${await response.text()}`);
  }
}
