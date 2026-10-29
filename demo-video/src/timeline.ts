// Frame timeline of the app walkthrough (local frames of <AppDemo>, 30 fps).
// Built programmatically so typing lengths drive everything after them —
// change a candidate's name in data.ts and the rest of the cut re-flows.

import { CANDIDATES, ELECTION } from "./data";
import { typeEnd } from "./lib/anim";

export type Waypoint = {
  t: number; // frame the cursor arrives
  to: string | [number, number]; // data-anchor id or screen coords
  dur?: number; // frames of travel before `t`
  dx?: number;
  dy?: number;
  fb?: [number, number]; // where to start from once the anchor has left the DOM
};

export const CPF = { title: 1.5, desc: 3.2, name: 1.6, role: 2.4, date: 1.1, time: 0.7 };

const W: Waypoint[] = [];
const CLICKS: number[] = [];
const move = (
  to: Waypoint["to"],
  t: number,
  dur = 18,
  dx = 0,
  dy = 0,
  fb?: [number, number],
) => W.push({ to, t, dur, dx, dy, fb });
const click = (t: number) => CLICKS.push(t);

// ── Dashboard ─────────────────────────────────────────────────────────────
move([1380, 860], 0, 1);
move("btn-new", 70, 42);
const clickNew = 74;
click(clickNew);
const modalOpen = clickNew + 4;

// ── Step 1 · Osnovni podaci ───────────────────────────────────────────────
const s1 = modalOpen;
move("s1-title", s1 + 52, 30, 200, 0);
click(s1 + 55);
const s1Title = s1 + 58;
const s1TitleEnd = typeEnd(ELECTION.title, s1Title, CPF.title);
move("s1-desc", s1TitleEnd + 16, 14, 240, 26);
click(s1TitleEnd + 18);
const s1Desc = s1TitleEnd + 21;
const s1DescEnd = typeEnd(ELECTION.description, s1Desc, CPF.desc);
const s1Scroll = s1DescEnd + 6;
move("s1-type-STANDARD", s1Scroll + 38, 24, 20, 4);
click(s1Scroll + 41);
move("s1-method-SINGLE_CHOICE", s1Scroll + 66, 20, 40, 4);
click(s1Scroll + 69);
move("btn-next", s1Scroll + 104, 28);
click(s1Scroll + 108);

// ── Step 2 · Kandidati ────────────────────────────────────────────────────
const s2 = s1Scroll + 112;
move("s2-name", s2 + 32, 24, 90, 0);
click(s2 + 35);
const cand: { name: number; nameEnd: number; role: number; roleEnd: number; added: number }[] = [];
let next = s2 + 38;
CANDIDATES.forEach((c, i) => {
  const name = next;
  const nameEnd = typeEnd(c.name, name, CPF.name);
  move("s2-role", nameEnd + 8, 8, 110, 0);
  click(nameEnd + 10);
  const role = nameEnd + 12;
  const roleEnd = typeEnd(c.role, role, CPF.role);
  move("s2-add", roleEnd + 9, 9);
  click(roleEnd + 11);
  const added = roleEnd + 12;
  cand.push({ name, nameEnd, role, roleEnd, added });
  if (i < CANDIDATES.length - 1) {
    move("s2-name", added + 10, 10, 90, 0);
    click(added + 12);
    next = added + 14;
  }
});
const s2LastAdded = cand[cand.length - 1].added;
move("s2-abstain", s2LastAdded + 30, 22);
const s2Abstain = s2LastAdded + 33;
click(s2Abstain);
move("btn-next", s2Abstain + 40, 28);
click(s2Abstain + 44);

// ── Step 3 · Popis glasača ────────────────────────────────────────────────
const s3 = s2Abstain + 48;
move("s3-csv", s3 + 30, 24);
click(s3 + 33);
const s3CsvMode = s3 + 35;
const s3Grab = s3 + 62; // file chip appears under the cursor (dragged in from the desktop)
move([1640, 760], s3Grab, 22);
move("s3-drop", s3Grab + 40, 36);
const s3DragOver = s3Grab + 26;
const s3Drop = s3Grab + 44;
const s3Rows = s3Drop + 8;
move("s3-drop", s3Drop + 16, 12, 170, 44); // step aside so the list reads clearly
move("btn-next", s3Drop + 104, 30);
click(s3Drop + 108);

// ── Step 4 · Raspored i postavke ──────────────────────────────────────────
const s4 = s3Drop + 112;
move("s4-scheduled", s4 + 30, 24);
click(s4 + 33);
const s4Scheduled = s4 + 35;
move("s4-opens-date", s4 + 56, 18, 60, 0);
click(s4 + 58);
const s4OpensDate = s4 + 60;
const s4OpensDateEnd = typeEnd(ELECTION.opensDate, s4OpensDate, CPF.date);
move("s4-opens-time", s4OpensDateEnd + 10, 10, 30, 0);
click(s4OpensDateEnd + 12);
const s4OpensTime = s4OpensDateEnd + 14;
const s4OpensTimeEnd = typeEnd(ELECTION.opensTime, s4OpensTime, CPF.time);
move("s4-closes-date", s4OpensTimeEnd + 12, 12, 60, 0);
click(s4OpensTimeEnd + 14);
const s4ClosesDate = s4OpensTimeEnd + 16;
const s4ClosesDateEnd = typeEnd(ELECTION.closesDate, s4ClosesDate, CPF.date);
move("s4-closes-time", s4ClosesDateEnd + 10, 10, 30, 0);
click(s4ClosesDateEnd + 12);
const s4ClosesTime = s4ClosesDateEnd + 14;
const s4ClosesTimeEnd = typeEnd(ELECTION.closesTime, s4ClosesTime, CPF.time);
const s4Scroll = s4ClosesTimeEnd + 10;

const TOGGLE_ORDER = ["liveResults", "publicResults", "quorum", "voterReminder24h"] as const;
const s4Toggle: Record<string, number> = {};
let tg = s4Scroll + 40;
for (const key of TOGGLE_ORDER) {
  move(`s4-toggle-${key}`, tg, 18);
  click(tg + 3);
  s4Toggle[key] = tg + 3;
  tg += key === "quorum" ? 70 : 26;
  if (key === "quorum") {
    // Quorum % field appears: select the default 50 and type 20.
    move("s4-quorum-input", s4Toggle.quorum + 26, 16, -22, 0);
    click(s4Toggle.quorum + 29);
  }
}
const s4QuorumType = s4Toggle.quorum + 34;
move("btn-next", tg + 24, 28);
click(tg + 28);

// ── Step 5 · Pregled ──────────────────────────────────────────────────────
const s5 = tg + 32;
move([1560, 560], s5 + 30, 30);
// The footer leaves with the wizard, so the next move starts from `fb`.
move("btn-create", s5 + 150, 30, 0, 0, [1252, 955]);
const s5Create = s5 + 154;
click(s5Create);

// ── Izbori su izrađeni ────────────────────────────────────────────────────
const success = s5Create + 26;
move("succ-qr", success + 108, 34);
const successQr = success + 111;
click(successQr);
move([1520, 900], successQr + 50, 30);
const end = successQr + 150;

export const TL = {
  clickNew,
  modalOpen,
  s1,
  s1Title,
  s1Desc,
  s1DescEnd,
  s1TitleEnd,
  s1Scroll,
  s2,
  cand,
  s2Abstain,
  s3,
  s3CsvMode,
  s3Grab,
  s3DragOver,
  s3Drop,
  s3Rows,
  s4,
  s4Scheduled,
  s4OpensDate,
  s4OpensTime,
  s4ClosesDate,
  s4ClosesTime,
  s4OpensDateEnd,
  s4OpensTimeEnd,
  s4ClosesDateEnd,
  s4ClosesTimeEnd,
  s4Scroll,
  s4Toggle,
  s4QuorumType,
  s5,
  s5Create,
  success,
  successQr,
  end,
};

export const WAYPOINTS = W;
export const CLICK_FRAMES = CLICKS;

// Step boundaries for the wizard shell.
export const stepAt = (f: number): 1 | 2 | 3 | 4 | 5 =>
  f < TL.s2 ? 1 : f < TL.s3 ? 2 : f < TL.s4 ? 3 : f < TL.s5 ? 4 : 5;

export const stepStart = (n: number) => [TL.s1, TL.s2, TL.s3, TL.s4, TL.s5][n - 1];

// Is a click happening on this anchor right now? (button pressed look)
export const pressedNear = (f: number, frames: number[]) =>
  frames.some((c) => f >= c && f < c + 5);
