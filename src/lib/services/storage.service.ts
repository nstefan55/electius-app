import "server-only";

import { AwsClient } from "aws4fetch";

// Jedina datoteka koja zna da R2 postoji (file-image-spec §9). Sve ostalo barata
// ključevima i URL-ovima. Isti šav preuzima election-report-storage-spec kad
// stigne — tada dobiva drugu kantu, ne drugi klijent.
//
// R2 govori S3, pa je potreban SigV4 potpis. aws4fetch potpisuje običan fetch —
// za PUT i DELETE jednog objekta cijeli AWS SDK je nekoliko megabajta strojarije
// koja se učita u svakom hladnom startu.
//
// ponytail: učitavanje ide kroz poslužitelj. 2 MB stane u Vercelovu granicu tijela
// od ~4,5 MB, pa je to jedan skok bez CORS-a i bez osirotjelog objekta ako
// korisnik prekine. Presigned izravno u R2 je nadogradnja tek ako neki sadržaj
// prijeđe granicu.

function env(name: string): string {
  const value = process.env[name];
  // Bez tihog no-opa: kod koji "uspije" bez spremljene datoteke je gori od pada.
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

let client: AwsClient | null = null;

function r2(): AwsClient {
  client ??= new AwsClient({
    // Vlastiti token po kanti — privatna kanta ima svoj (R2_ACCESS_KEY_ID).
    // Imena moraju biti različita: ista varijabla dvaput u .env datoteci znači
    // da jedna tiho pobijedi, a koja, ovisi o redoslijedu čitanja.
    accessKeyId: env("R2_LOGO_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_LOGO_SECRET_ACCESS_KEY"),
    service: "s3",
    region: "auto",
  });
  return client;
}

function objectEndpoint(key: string): string {
  const account = env("R2_ACCOUNT_ID");
  const bucket = env("R2_BUCKET_PUBLIC");
  return `https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`;
}

/** Javni URL objekta — ono što ide u Organization.logoUrl. */
export function objectUrl(key: string): string {
  return `${env("R2_PUBLIC_URL").replace(/\/+$/, "")}/${key}`;
}

/** Ključ natrag iz javnog URL-a; null ako URL nije iz naše kante. */
export function keyFromUrl(url: string): string | null {
  const base = `${env("R2_PUBLIC_URL").replace(/\/+$/, "")}/`;
  return url.startsWith(base) ? url.slice(base.length) : null;
}

export async function putObject(
  key: string,
  // Uint8Array<ArrayBuffer>, ne goli Uint8Array: fetch ne prima poglede nad
  // SharedArrayBuffer, pa razlika mora ostati u tipu.
  body: Uint8Array<ArrayBuffer>,
  contentType: string,
): Promise<void> {
  const response = await r2().fetch(objectEndpoint(key), {
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

export async function deleteObject(key: string): Promise<void> {
  const response = await r2().fetch(objectEndpoint(key), { method: "DELETE" });
  // R2 vraća 204 i za nepostojeći ključ — brisanje je idempotentno.
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 DELETE ${key} failed: ${response.status} ${await response.text()}`);
  }
}