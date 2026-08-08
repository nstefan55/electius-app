"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@base-ui/react/dialog";
import toast from "react-hot-toast";
import { TriangleAlert, X } from "lucide-react";
import { addVoters } from "@/actions/voters";
import {
  CsvDropZone,
  FIELD_LABEL,
  INPUT_CLASS,
  ModeTabs,
} from "@/components/elections/wizard/wizard-shared";
import { parseVotersCsv, voterRowSchema, type VoterRow } from "@/lib/wizard-csv";
import { Link, useRouter } from "@/i18n/navigation";
import type { ElectionStatus } from "@/lib/elections-view";
import { nearCap } from "@/lib/entitlements";

// Dodavanje birača nakon kreiranja izbora. Isti ulazi kao čarobnjakov korak 3
// (ručno + CSV), pa se `parseVotersCsv` i `CsvDropZone` dijele, ne pišu ponovno.
//
// Redci se skupljaju lokalno i šalju jednim pozivom — jedan round trip i jedna
// poruka o preskočenim duplikatima umjesto po retku.
export function AddVotersDialog({
  electionId,
  electionStatus,
  open,
  onOpenChange,
  voterCap,
  voterCount,
}: {
  electionId: string;
  electionStatus: ElectionStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voterCap: number;
  voterCount: number;
}) {
  const t = useTranslations("dashboard.voters.add");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [mode, setMode] = useState<"manual" | "csv">("manual");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState<VoterRow[]>([]);
  // Odbijanje zbog granice ostaje NA MJESTU, ne odlazi u poruku koja nestane:
  // pripremljeni redci se čuvaju da ih se može skratiti umjesto ponovno unijeti.
  const [capError, setCapError] = useState<{
    cap: number;
    current: number;
  } | null>(null);

  // Glasanje traje → dodavanje je neopozivo (brisanje je dopušteno samo prije
  // otvaranja), a novi birač odmah dobiva ispravnu poveznicu.
  const isActive = electionStatus === "ACTIVE";

  const has = (em: string) =>
    rows.some((r) => r.email.toLowerCase() === em.toLowerCase());

  // Svaka promjena popisa poništava prethodno odbijanje: brojke u poruci više
  // ne opisuju ono što bi se poslalo, a crveni okvir pokraj skraćenog popisa
  // izgleda kao da je i dalje blokirano.
  const changeRows = (next: React.SetStateAction<VoterRow[]>) => {
    setCapError(null);
    setRows(next);
  };

  function reset() {
    setRows([]);
    setName("");
    setEmail("");
    setMode("manual");
    setCapError(null);
  }

  function add() {
    const parsed = voterRowSchema.safeParse({
      name: name.trim(),
      email: email.trim(),
    });
    if (!name.trim()) return toast.error(t("nameRequired"));
    if (!parsed.success) return toast.error(t("emailInvalid"));
    if (has(parsed.data.email)) return toast.error(t("emailDuplicate"));
    changeRows((rs) => [...rs, parsed.data]);
    setName("");
    setEmail("");
  }

  function importCsv(text: string) {
    const { rows: parsed, skipped } = parseVotersCsv(text);
    const fresh = parsed.filter((r) => !has(r.email));
    if (!fresh.length) return toast.error(t("csvEmpty"));
    changeRows((rs) => [...rs, ...fresh]);
    toast.success(
      skipped
        ? t("csvImportedSkipped", { count: fresh.length, skipped })
        : t("csvImported", { count: fresh.length }),
    );
  }

  function submit() {
    startTransition(async () => {
      const res = await addVoters({ electionId, rows });
      if (!res.success) {
        // Granica je odbijanje, ne kvalifikator uspjeha: `blocked` čita se tek
        // ispod ove grane i znači "dodani su, ali pozivnica nije poslana".
        // Kroz njega bi odbijanje tiho završilo u generičkoj poruci o grešci.
        if (res.error === "voterCap") {
          setCapError({
            cap: res.cap ?? voterCap,
            current: res.current ?? voterCount,
          });
          return;
        }
        // Rezerva: gumb je skriven na gotovim izborima, ali stranica može biti
        // stara — a radnja je granica, ne UI. `closed` govori o statusu; ovo o
        // roku, pa ima vlastitu poruku.
        if (res.error === "electionEnded") {
          toast.error(t("electionEnded"));
          return;
        }
        toast.error(t(res.error === "invalidStatus" ? "closed" : "failed"));
        return;
      }
      // Poslužitelj ponovno provjerava duplikate prema stvarnom popisu, pa
      // `skipped` može biti veći od onoga što je klijent vidio.
      const added = res.added ?? 0;
      if (added === 0) toast(t("allDuplicates"));
      // Birači su dodani, ali rok je prošao — poveznica nije poslana i ne može
      // biti. Prije grane s greškom slanja: ovo nije neuspjeh, nego odbijanje.
      else if (res.blocked) toast(t("addedWindowOver", { count: added }));
      else if (res.failed) toast.success(t("addedPartial", { count: added, failed: res.failed }));
      else if (res.sent) toast.success(t("addedInvited", { count: added }));
      else toast.success(t("added", { count: added }));

      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-white shadow-lg outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div>
              <Dialog.Title className="font-heading text-xl font-semibold text-neutral-800">
                {t("title")}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {t("sub")}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={t("close")}
              className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-neutral-100"
            >
              <X className="size-4.5" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <ModeTabs
              mode={mode}
              onChange={setMode}
              manualLabel={t("manual")}
              csvLabel={t("csv")}
            />

            {mode === "manual" ? (
              <div className="grid items-end gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
                <label>
                  <span className={FIELD_LABEL}>{t("fullName")}</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        add();
                      }
                    }}
                    placeholder={t("namePlaceholder")}
                    maxLength={200}
                    className={`${INPUT_CLASS} h-11`}
                  />
                </label>
                <label>
                  <span className={FIELD_LABEL}>{t("email")}</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        add();
                      }
                    }}
                    placeholder={t("emailPlaceholder")}
                    maxLength={255}
                    className={`${INPUT_CLASS} h-11`}
                  />
                </label>
                <button
                  type="button"
                  onClick={add}
                  className="h-11 rounded-md bg-primary px-4.5 text-sm font-semibold whitespace-nowrap text-primary-foreground transition-colors hover:bg-brand-600"
                >
                  {t("addRow")}
                </button>
              </div>
            ) : (
              <CsvDropZone
                title={t("dropTitle")}
                hint={
                  <>
                    {t("dropHintPrefix")}{" "}
                    <span className="font-mono">full_name, email</span>
                  </>
                }
                errors={{ notCsv: t("csvNotCsv"), tooLarge: t("csvTooLarge") }}
                onText={importCsv}
              />
            )}

            {/* Pripremljeni redci */}
            <div className="mt-5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="font-heading text-sm font-semibold text-neutral-800">
                  {t("staged", { count: rows.length })}
                </span>
                {rows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => changeRows([])}
                    className="text-[0.8125rem] font-semibold text-neutral-400 transition-colors hover:text-brand-700"
                  >
                    {t("clearAll")}
                  </button>
                )}
              </div>
              <div className="overflow-hidden rounded-[10px] border border-neutral-100">
                {rows.length === 0 ? (
                  <div className="p-6 text-center text-sm text-neutral-400">
                    {t("stagedEmpty")}
                  </div>
                ) : (
                  <ul className="max-h-56 overflow-y-auto">
                    {rows.map((r, i) => (
                      <li
                        key={r.email}
                        className="flex items-center gap-3 border-b border-neutral-100 px-3.5 py-2.5 last:border-b-0"
                      >
                        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5">
                          <span className="text-sm font-semibold text-neutral-800">
                            {r.name}
                          </span>
                          <span className="font-mono text-[0.8125rem] text-muted-foreground">
                            {r.email}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label={t("removeRow")}
                          onClick={() =>
                            changeRows((rs) => rs.filter((_, j) => j !== i))
                          }
                          className="flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-700"
                        >
                          <X className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Odbijanje zbog granice — na mjestu neuspjeha, s brojkama i
                poveznicom. Nikad golo "potrebna je nadogradnja" (§8). */}
            {capError && (
              <div className="mt-5 flex gap-3 rounded-md border-l-[3px] border-error-500 bg-error-50 px-4 py-3.5">
                <TriangleAlert
                  className="mt-0.5 size-5 shrink-0 text-error-700"
                  aria-hidden
                />
                <div className="text-[0.84375rem] leading-relaxed text-error-700">
                  <p className="font-semibold">{t("capTitle")}</p>
                  <p className="mt-0.5">
                    {t("capBody", {
                      cap: capError.cap,
                      current: capError.current,
                      adding: rows.length,
                    })}
                  </p>
                  <Link
                    href="/settings"
                    className="mt-1.5 inline-block font-semibold underline underline-offset-2"
                  >
                    {t("capLink")}
                  </Link>
                </div>
              </div>
            )}

            {/* Tiha najava prije odbijanja: granica se ne otkriva tek kad je
                pripremljeno 300 redaka. */}
            {!capError && nearCap(voterCount + rows.length, voterCap) && (
              <p className="mt-5 text-[0.84375rem] text-neutral-600">
                {t("capUsage", {
                  used: voterCount + rows.length,
                  cap: voterCap,
                })}
              </p>
            )}

            {/* Dodavanje u izbore koji traju mijenja nazivnik izlaznosti i ne
                može se poništiti — zato upozorenje ide PRIJE unosa. */}
            {isActive && rows.length > 0 && (
              <div className="mt-5 flex gap-3 rounded-md border-l-[3px] border-warning-500 bg-warning-50 px-4 py-3.5">
                <TriangleAlert
                  className="mt-0.5 size-5 shrink-0 text-warning-700"
                  aria-hidden
                />
                <div className="text-[0.84375rem] leading-relaxed text-warning-700">
                  <p className="font-semibold">{t("activeWarnTitle")}</p>
                  <p className="mt-0.5">{t("activeWarnBody")}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
            <Dialog.Close className="inline-flex h-11 items-center rounded-md px-5 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-neutral-100">
              {t("cancel")}
            </Dialog.Close>
            <button
              type="button"
              onClick={submit}
              disabled={rows.length === 0 || pending}
              className="inline-flex h-11 items-center rounded-md bg-primary px-5.5 text-[0.9375rem] font-semibold text-primary-foreground transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isActive
                ? t("submitInvite", { count: rows.length })
                : t("submit", { count: rows.length })}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
