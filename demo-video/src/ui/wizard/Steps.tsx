import React from "react";
import { useCurrentFrame } from "remotion";
import { SquarePen, Trash2, Upload, X } from "lucide-react";
import { C, FONT } from "../../theme";
import { CANDIDATES, CSV_FILE, ELECTION, VOTERS, VOTER_COUNT } from "../../data";
import { CPF, TL } from "../../timeline";
import { easeOut, hrPlural, prog, typed } from "../../lib/anim";
import {
  Avatar,
  Caret,
  FieldLabel,
  Input,
  ModeTabs,
  Optional,
  PrimaryButton,
  ProBadge,
  SectionLabel,
  SelectCard,
  StepCard,
  StepHeading,
  Textarea,
  Toggle,
} from "../primitives";

// The five wizard steps (step-basic-info.tsx … step-review.tsx), each driven by
// the frame number instead of React state. Copy is the app's hr.json verbatim.

const within = (f: number, a: number, b: number) => f >= a && f < b;

// Shared entrance for a step's content.
export function StepEnter({ start, children }: { start: number; children: React.ReactNode }) {
  const f = useCurrentFrame();
  const p = prog(f, start, 14, easeOut);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 14}px)` }}>{children}</div>;
}

// ── Step 1 ──────────────────────────────────────────────────────────────────
const TYPES = [
  { key: "STANDARD", label: "Standardni", desc: "Izbor kandidata ili potvrda prijedloga." },
  { key: "SURVEY", label: "Anketa", desc: "Prikupite mišljenja kroz više pitanja." },
  { key: "POLL", label: "Brza anketa", desc: "Jednostavno da/ne ili jedno pitanje." },
];

export function Step1() {
  const f = useCurrentFrame();
  const title = typed(ELECTION.title, f, TL.s1Title, CPF.title);
  const desc = typed(ELECTION.description, f, TL.s1Desc, CPF.desc);
  const titleFocus = within(f, TL.s1Title - 3, TL.s1TitleEnd + 18);
  const descFocus = within(f, TL.s1TitleEnd + 18, TL.s1Scroll + 41);
  return (
    <div>
      <StepHeading
        title="Osnovni podaci"
        sub="Nazovite izbore i odaberite način glasovanja. Sve možete promijeniti prije otvaranja."
      />
      <StepCard>
        <FieldLabel>
          Naziv izbora <span style={{ color: C.error700 }}>*</span>
        </FieldLabel>
        <Input
          anchor="s1-title"
          value={title}
          placeholder="npr. Izbori za predstavnika studenata"
          focused={titleFocus}
          height={46}
          fontSize={16}
        />
        <div style={{ marginTop: 22 }}>
          <FieldLabel>
            Opis
            <Optional />
          </FieldLabel>
          <Textarea
            anchor="s1-desc"
            value={desc}
            placeholder="Objasnite o čemu glasači odlučuju i dodajte potreban kontekst."
            focused={descFocus}
          />
        </div>
        <SectionLabel>Vrsta izbora</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {TYPES.map((t) => (
            <SelectCard
              key={t.key}
              anchor={`s1-type-${t.key}`}
              title={t.label}
              desc={t.desc}
              selected={t.key === "STANDARD"}
              badge={
                t.key === "STANDARD" ? (
                  <span
                    style={{
                      display: "inline-flex",
                      height: 17,
                      alignItems: "center",
                      borderRadius: 9999,
                      background: C.neutral100,
                      padding: "0 6px",
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: "0.025em",
                      color: C.neutral600,
                    }}
                  >
                    ZADANO
                  </span>
                ) : undefined
              }
            />
          ))}
        </div>
        <SectionLabel>Način glasovanja</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SelectCard
            anchor="s1-method-SINGLE_CHOICE"
            title="Jedan izbor"
            desc="Glasači biraju točno jednu opciju."
            selected
          />
          <SelectCard
            anchor="s1-method-MULTI_CHOICE"
            title="Više izbora"
            desc="Glasači mogu odabrati više opcija."
            selected={false}
          />
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: C.neutral400 }}>
          Rangirano i odobravajuće glasovanje stižu uskoro.
        </p>
      </StepCard>
    </div>
  );
}

// ── Step 2 ──────────────────────────────────────────────────────────────────
const candCount = (n: number) =>
  `${n} ${hrPlural(n) === "one" ? "kandidat" : "kandidata"} na listiću`;

export function Step2() {
  const f = useCurrentFrame();
  const cur = TL.cand.findIndex((c) => f < c.added);
  const c = cur >= 0 ? TL.cand[cur] : null;
  const name = c ? typed(CANDIDATES[cur].name, f, c.name, CPF.name) : "";
  const role = c ? typed(CANDIDATES[cur].role, f, c.role, CPF.role) : "";
  const nameFocus = TL.cand.some((k) => within(f, k.name - 3, k.nameEnd + 10));
  const roleFocus = TL.cand.some((k) => within(f, k.nameEnd + 10, k.added));
  const added = TL.cand.filter((k) => f >= k.added).length;
  const abstainP = prog(f, TL.s2Abstain, 6);
  const addPressed = TL.cand.some((k) => within(f, k.added - 1, k.added + 4));

  return (
    <div>
      <StepHeading
        title="Kandidati i opcije"
        sub="Dodajte opcije koje će glasači vidjeti na listiću. Dodajte ih jednu po jednu ili uvezite popis."
      />
      <StepCard>
        <ModeTabs mode="manual" manual="Dodaj ručno" csv="Učitaj CSV" anchorPrefix="s2" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <FieldLabel size="xs">Ime kandidata</FieldLabel>
            <Input anchor="s2-name" value={name} placeholder="Puno ime" focused={nameFocus} />
          </div>
          <div>
            <FieldLabel size="xs">
              Uloga / opis
              <Optional />
            </FieldLabel>
            <Input anchor="s2-role" value={role} placeholder="npr. 3. godina, Pravo" focused={roleFocus} />
          </div>
          <PrimaryButton anchor="s2-add" height={44} pressed={addPressed} style={{ padding: "0 18px", fontSize: 14 }}>
            Dodaj
          </PrimaryButton>
        </div>

        <div
          style={{
            marginTop: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: "rgba(249,250,251,0.6)",
            padding: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.neutral800 }}>Dopusti suzdržane</div>
            <div style={{ marginTop: 3, fontSize: 13, color: C.muted }}>
              Dodaje opciju „Suzdržan” kako bi glasači mogli formalno odbiti izbor.
            </div>
          </div>
          <Toggle anchor="s2-abstain" p={abstainP} />
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 10, fontFamily: FONT.heading, fontSize: 14, fontWeight: 600, color: C.neutral800 }}>
            {candCount(added)}
          </div>
          {added === 0 ? (
            <div
              style={{
                borderRadius: 10,
                border: `1px dashed ${C.border}`,
                padding: 28,
                textAlign: "center",
                fontSize: 14,
                color: C.neutral400,
              }}
            >
              Još nema kandidata — dodajte barem dva za otvaranje glasovanja.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CANDIDATES.slice(0, added).map((cd, i) => {
                const p = prog(f, TL.cand[i].added, 10, easeOut);
                return (
                  <div
                    key={cd.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      borderRadius: 10,
                      border: `1px solid ${C.neutral100}`,
                      background: C.white,
                      padding: "12px 14px",
                      opacity: p,
                      transform: `translateY(${(1 - p) * -8}px)`,
                    }}
                  >
                    <Avatar name={cd.name} size={36} bg={C.brand50} color={C.brand700} fontSize={14} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.neutral800 }}>{cd.name}</div>
                      <div style={{ fontSize: 13, color: C.muted }}>{cd.role}</div>
                    </div>
                    <span style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", color: C.neutral400 }}>
                      <Trash2 size={18} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </StepCard>
    </div>
  );
}

// ── Step 3 ──────────────────────────────────────────────────────────────────
export const voterCountLabel = (n: number) => {
  const cat = hrPlural(n);
  const num = n.toLocaleString("hr-HR");
  return cat === "one" ? `${num} glasač dodan` : cat === "few" ? `${num} glasača dodana` : `${num} glasača dodano`;
};

export const importedToast = (n: number) => {
  const cat = hrPlural(n);
  const num = n.toLocaleString("hr-HR");
  return cat === "one" ? `Uvezen ${num} glasač` : cat === "few" ? `Uvezena ${num} glasača` : `Uvezeno ${num} glasača`;
};

export function Step3() {
  const f = useCurrentFrame();
  const csv = f >= TL.s3CsvMode;
  const over = within(f, TL.s3DragOver, TL.s3Drop);
  const imported = f >= TL.s3Drop;
  const rowsVisible = imported ? Math.min(VOTERS.length, Math.floor((f - TL.s3Rows) / 2) + 1) : 0;

  return (
    <div>
      <StepHeading
        title="Popis glasača"
        sub="Svaki glasač dobiva jednokratnu čarobnu poveznicu. E-mail se koristi samo za slanje te poveznice — sustav nikada ne povezuje glasača s njegovim glasom."
      />
      <StepCard>
        <ModeTabs mode={csv ? "csv" : "manual"} manual="Dodaj ručno" csv="Učitaj CSV" anchorPrefix="s3" />
        {csv ? (
          <div
            data-anchor="s3-drop"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 12,
              border: `1.5px dashed ${over ? C.brand700 : C.neutral200}`,
              background: over ? C.brand100 : C.neutral50,
              padding: 32,
              textAlign: "center",
            }}
          >
            <span style={{ width: 40, height: 40, borderRadius: 9999, background: C.brand50, color: C.brand700, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Upload size={20} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.neutral800 }}>Ispustite .csv ovdje ili kliknite</span>
            <span style={{ fontSize: 13, color: C.neutral400 }}>
              Obavezni stupci: <span style={{ fontFamily: FONT.mono }}>full_name, email</span>
            </span>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <FieldLabel size="xs">Puno ime</FieldLabel>
              <Input value="" placeholder="Ana Anić" />
            </div>
            <div>
              <FieldLabel size="xs">E-mail adresa</FieldLabel>
              <Input value="" placeholder="ana@sveuciliste.hr" />
            </div>
            <PrimaryButton height={44} style={{ padding: "0 18px", fontSize: 14 }}>
              Dodaj
            </PrimaryButton>
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: FONT.heading, fontSize: 14, fontWeight: 600, color: C.neutral800 }}>
              {voterCountLabel(imported ? VOTER_COUNT : 0)}
            </span>
            {imported && <span style={{ fontSize: 13, fontWeight: 600, color: C.neutral400 }}>Ukloni sve</span>}
          </div>
          <div data-anchor="s3-list" style={{ overflow: "hidden", borderRadius: 10, border: `1px solid ${C.neutral100}` }}>
            {!imported ? (
              <div style={{ padding: 28, textAlign: "center", fontSize: 14, color: C.neutral400 }}>Još nema dodanih glasača.</div>
            ) : (
              VOTERS.slice(0, rowsVisible).map((v, i) => {
                const p = prog(f, TL.s3Rows + i * 2, 8, easeOut);
                return (
                  <div
                    key={v.email}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      borderBottom: `1px solid ${C.neutral100}`,
                      background: C.white,
                      padding: "11px 14px",
                      opacity: p,
                    }}
                  >
                    <Avatar name={v.name} size={32} bg="#F1F5F9" color="#475569" fontSize={12} />
                    <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.neutral800 }}>{v.name}</span>
                      <span style={{ fontFamily: FONT.mono, fontSize: 13, color: C.muted }}>{v.email}</span>
                    </div>
                    <span style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: C.neutral400 }}>
                      <X size={16} />
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </StepCard>
    </div>
  );
}

export function FileChip() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "9px 14px 9px 10px",
        boxShadow: "0 12px 24px rgba(0,0,0,0.18)",
        fontFamily: FONT.body,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 30, height: 36, borderRadius: 5, background: "#16a34a", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 5 }}>
        CSV
      </span>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.neutral800 }}>{CSV_FILE}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{VOTER_COUNT} redaka · full_name, email</div>
      </div>
    </div>
  );
}

// ── Step 4 ──────────────────────────────────────────────────────────────────
const OPTIONS = [
  {
    key: "liveResults",
    pro: true,
    label: "Rezultati uživo tijekom glasovanja",
    desc: "Pratite zbroj po kandidatu dok glasovanje traje. Isključeno, rezultate vidite tek nakon zatvaranja — i vi i birači.",
  },
  {
    key: "publicResults",
    pro: false,
    label: "Javna stranica rezultata",
    desc: "Objavi zbroj glasova na javnoj poveznici. Vidljiva je tek nakon zatvaranja glasovanja — birači do nje dolaze sa završnog zaslona.",
  },
  {
    key: "quorum",
    pro: false,
    label: "Prag kvoruma",
    desc: "Zahtijevaj minimalni udio glasača s pravom glasa za valjanost rezultata.",
  },
  {
    key: "adminTurnoutReminder",
    pro: true,
    label: "Automatski podsjetnici administratoru",
    desc: "Primajte e-mailom ažuriranja o izlaznosti dok je glasovanje otvoreno.",
  },
  {
    key: "voterReminder24h",
    pro: true,
    label: "Automatski podsjetnici glasačima",
    desc: "Podsjetite glasače koji još nisu glasali prije isteka roka.",
  },
] as const;

function SegmentedInput({
  anchor,
  value,
  placeholder,
  focused,
}: {
  anchor: string;
  value: string;
  placeholder: string;
  focused: boolean;
}) {
  return (
    <div
      data-anchor={anchor}
      style={{
        height: 44,
        borderRadius: 8,
        border: `1px solid ${focused ? C.brand700 : C.border}`,
        boxShadow: focused ? "0 0 0 3px rgba(29, 78, 216, 0.3)" : "none",
        background: C.white,
        padding: "0 12px",
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        whiteSpace: "pre",
      }}
    >
      <span style={{ color: C.neutral950 }}>{value}</span>
      <span style={{ color: value ? C.neutral400 : C.neutral600 }}>{placeholder.slice(value.length)}</span>
    </div>
  );
}

function DateTimeField({
  label,
  id,
  date,
  time,
  dateFocus,
  timeFocus,
}: {
  label: string;
  id: string;
  date: string;
  time: string;
  dateFocus: boolean;
  timeFocus: boolean;
}) {
  return (
    <div>
      <FieldLabel size="xs">{label}</FieldLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 112px", gap: 8 }}>
        <SegmentedInput anchor={`s4-${id}-date`} value={date} placeholder="dd. mm. gggg." focused={dateFocus} />
        <SegmentedInput anchor={`s4-${id}-time`} value={time} placeholder="--:--" focused={timeFocus} />
      </div>
    </div>
  );
}

export function Step4() {
  const f = useCurrentFrame();
  const scheduled = f >= TL.s4Scheduled;
  const oD = typed(ELECTION.opensDate, f, TL.s4OpensDate, CPF.date);
  const oT = typed(ELECTION.opensTime, f, TL.s4OpensTime, CPF.time);
  const cD = typed(ELECTION.closesDate, f, TL.s4ClosesDate, CPF.date);
  const cT = typed(ELECTION.closesTime, f, TL.s4ClosesTime, CPF.time);
  const fieldEnter = prog(f, TL.s4Scheduled, 12, easeOut);

  const tp = (key: string) => (TL.s4Toggle[key] !== undefined ? prog(f, TL.s4Toggle[key], 6) : 0);
  const quorumOpen = f >= TL.s4Toggle.quorum + 2;
  const qClick = TL.s4Toggle.quorum + 29;
  const qFocus = within(f, qClick, TL.s4Toggle.voterReminder24h);
  const qSelected = within(f, qClick, TL.s4QuorumType);
  const qValue = f < TL.s4QuorumType ? "50" : f < TL.s4QuorumType + 4 ? "2" : String(ELECTION.quorumPct);

  return (
    <div>
      <StepHeading title="Raspored i postavke" sub="Odlučite kada se glasa i uključite zaštite koje trebate." />

      <StepCard style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 14px", fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, color: C.neutral800 }}>
          Način početka
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SelectCard
            anchor="s4-manual"
            title="Pokreni ručno"
            desc="Glasovanje otvarate gumbom kada budete spremni."
            selected={!scheduled}
          />
          <SelectCard
            anchor="s4-scheduled"
            title="Zakaži početak"
            desc="Glasovanje se automatski otvara u zadano vrijeme."
            selected={scheduled}
          />
        </div>
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {scheduled && (
            <div style={{ opacity: fieldEnter }}>
              <DateTimeField
                label="Otvara se"
                id="opens"
                date={oD}
                time={oT}
                dateFocus={within(f, TL.s4OpensDate - 2, TL.s4OpensDateEnd + 12)}
                timeFocus={within(f, TL.s4OpensDateEnd + 12, TL.s4OpensTimeEnd + 14)}
              />
            </div>
          )}
          <DateTimeField
            label="Zatvara se"
            id="closes"
            date={cD}
            time={cT}
            dateFocus={within(f, TL.s4ClosesDate - 2, TL.s4ClosesDateEnd + 12)}
            timeFocus={within(f, TL.s4ClosesDateEnd + 12, TL.s4ClosesTimeEnd + 8)}
          />
        </div>
      </StepCard>

      <StepCard style={{ padding: "12px 28px 20px" }}>
        <h2 style={{ margin: "16px 0 4px", fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, color: C.neutral800 }}>
          Opcije
        </h2>
        {OPTIONS.map((o, i) => (
          <div
            key={o.key}
            style={{ borderBottom: i < OPTIONS.length - 1 ? `1px solid ${C.neutral100}` : "none", padding: "16px 0" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.neutral800 }}>{o.label}</span>
                  {o.pro && <ProBadge />}
                </div>
                <div style={{ marginTop: 3, fontSize: 13, lineHeight: 1.625, color: C.muted }}>{o.desc}</div>
              </div>
              <Toggle anchor={`s4-toggle-${o.key}`} p={tp(o.key)} />
            </div>
            {o.key === "quorum" && quorumOpen && (
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  background: C.neutral50,
                  padding: 14,
                  opacity: prog(f, TL.s4Toggle.quorum + 2, 8),
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: C.neutral800 }}>Minimalna potrebna izlaznost</span>
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    data-anchor="s4-quorum-input"
                    style={{
                      height: 38,
                      width: 76,
                      borderRadius: 8,
                      border: `1px solid ${qFocus ? C.brand700 : C.border}`,
                      boxShadow: qFocus ? "0 0 0 3px rgba(29, 78, 216, 0.3)" : "none",
                      background: C.white,
                      padding: "0 10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      fontSize: 15,
                    }}
                  >
                    <span style={{ background: qSelected ? "#b4d5fe" : "transparent" }}>{qValue}</span>
                    {qFocus && !qSelected && <Caret />}
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 600, color: C.muted }}>%</span>
                </span>
              </div>
            )}
          </div>
        ))}
      </StepCard>
    </div>
  );
}

// ── Step 5 ──────────────────────────────────────────────────────────────────
function ReviewCard({ title, suffix, children }: { title: string; suffix?: string; children: React.ReactNode }) {
  return (
    <StepCard style={{ marginBottom: 16, padding: 24 }}>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, color: C.neutral800 }}>
          {title}
          {suffix && <span style={{ fontWeight: 500, color: C.neutral600 }}> · {suffix}</span>}
        </h2>
        <span
          style={{
            display: "inline-flex",
            height: 32,
            alignItems: "center",
            gap: 6,
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: C.white,
            padding: "0 12px",
            fontSize: 13,
            fontWeight: 600,
            color: C.brand700,
          }}
        >
          <SquarePen size={14} />
          Uredi
        </span>
      </div>
      {children}
    </StepCard>
  );
}

const ROW: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "130px 1fr",
  columnGap: 16,
  rowGap: 12,
  fontSize: 14,
};

export const ENABLED = [
  "Rezultati uživo tijekom glasovanja",
  "Javna stranica rezultata",
  `Kvorum ${ELECTION.quorumPct}%`,
  "Automatski podsjetnici glasačima",
];

export function Step5() {
  const more = VOTER_COUNT - 3;
  const sample = VOTERS.slice(0, 3).map((v) => v.name).join(", ");
  return (
    <div>
      <h1 style={{ margin: 0, fontFamily: FONT.heading, fontSize: 24, lineHeight: "32px", fontWeight: 600, color: C.neutral800 }}>
        Pregled i potvrda
      </h1>
      <p style={{ margin: "8px 0 28px", fontSize: 15, lineHeight: 1.5, color: C.muted }}>
        Provjerite sve u nastavku. Koristite Uredi na bilo kojem odjeljku za povratak i izmjene.
      </p>

      <ReviewCard title="Osnovni podaci">
        <div style={ROW}>
          <span style={{ color: C.neutral600 }}>Naziv</span>
          <span style={{ fontWeight: 600, color: C.neutral800 }}>{ELECTION.title}</span>
          <span style={{ color: C.neutral600 }}>Opis</span>
          <span style={{ color: C.muted }}>{ELECTION.description}</span>
          <span style={{ color: C.neutral600 }}>Vrsta</span>
          <span style={{ color: C.muted }}>Standardni — Izbor kandidata ili potvrda prijedloga.</span>
          <span style={{ color: C.neutral600 }}>Način glasovanja</span>
          <span style={{ color: C.muted }}>Jedan izbor</span>
        </div>
      </ReviewCard>

      <ReviewCard title="Kandidati" suffix={`${CANDIDATES.length} ${hrPlural(CANDIDATES.length) === "one" ? "kandidat" : "kandidata"}`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CANDIDATES.map((c) => (
            <span
              key={c.name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 9999,
                border: `1px solid ${C.border}`,
                background: C.white,
                padding: "6px 12px 6px 6px",
              }}
            >
              <Avatar name={c.name} size={24} bg={C.brand50} color={C.brand700} fontSize={11} />
              <span style={{ fontSize: 14, fontWeight: 500, color: C.neutral800 }}>{c.name}</span>
            </span>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: C.muted }}>Opcija suzdržanog glasa je uključena.</div>
      </ReviewCard>

      <ReviewCard title="Popis glasača" suffix={`${VOTER_COUNT.toLocaleString("hr-HR")} glasača`}>
        <div style={{ fontSize: 14, color: C.muted }}>
          Pozvat će se {VOTER_COUNT.toLocaleString("hr-HR")} glasača — {sample}
          {more > 0 ? ` i još ${more}` : ""}
        </div>
      </ReviewCard>

      <ReviewCard title="Raspored i postavke">
        <div style={ROW}>
          <span style={{ color: C.neutral600 }}>Početak</span>
          <span style={{ color: C.muted }}>{ELECTION.opensDisplay}</span>
          <span style={{ color: C.neutral600 }}>Zatvaranje</span>
          <span style={{ color: C.muted }}>{ELECTION.closesDisplay}</span>
          <span style={{ color: C.neutral600 }}>Uključeno</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ENABLED.map((l) => (
              <span
                key={l}
                style={{
                  display: "inline-flex",
                  height: 24,
                  alignItems: "center",
                  borderRadius: 9999,
                  background: C.brand50,
                  padding: "0 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.brand700,
                }}
              >
                {l}
              </span>
            ))}
          </span>
        </div>
      </ReviewCard>
    </div>
  );
}
