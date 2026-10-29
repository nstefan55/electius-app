import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BrowserFrame } from "../ui/BrowserFrame";
import { Dashboard } from "../ui/Dashboard";
import { ModalFrame, WizardShell } from "../ui/wizard/Shell";
import { FileChip, importedToast, Step1, Step2, Step3, Step4, Step5, StepEnter } from "../ui/wizard/Steps";
import { Success } from "../ui/wizard/Success";
import { Cursor } from "../overlay/Cursor";
import { Toast } from "../overlay/Toast";
import { Captions, type Cue } from "../overlay/Caption";
import { CLICK_FRAMES, TL, WAYPOINTS, stepAt, stepStart } from "../timeline";
import { clamp, easeOut, keyframes, prog } from "../lib/anim";
import { VOTER_COUNT } from "../data";
import { FONT } from "../theme";

// One continuous "screen recording": dashboard → wizard steps 1–5 → success.
// Camera = eased keyframes {s: zoom, x/y: screen point held at frame centre}.

// Two framings for the wizard: FOCUS hides the modal's top bar and footer
// (stepper + form only), OVER adds the footer for "Nastavi". Neither cuts the
// top bar mid-text. Screen-space maths: visible top = y − 540 / s.
const FOCUS = { s: 1.5, x: 960, y: 558 };
const OVER = { s: 1.32, x: 960, y: 609 };
// Pulled back so the top-centre toast (16px under the viewport top) is in shot.
const TOAST = { s: 1.2, x: 960, y: 528 };
const SUCC = { s: 1.3, x: 960, y: 545 }; // view starts at the modal's top edge
const SUCC_QR = { s: 1.2, x: 960, y: 626 }; // QR panel + buttons above the caption
const toggleDone = TL.s4Toggle.voterReminder24h + 8;

const CAM = [
  { t: 0, s: 1, x: 960, y: 540 },
  { t: 36, s: 1, x: 960, y: 540 },
  { t: TL.clickNew - 2, s: 1.28, x: 1240, y: 360 },
  { t: TL.modalOpen + 8, s: 1.28, x: 1240, y: 360 },
  { t: TL.s1 + 40, ...FOCUS },
  { t: TL.s1Scroll + 40, ...FOCUS },
  { t: TL.s2 - 40, ...OVER },
  { t: TL.s2 + 4, ...OVER },
  { t: TL.s2 + 30, ...FOCUS },
  { t: TL.s2Abstain + 8, ...FOCUS },
  { t: TL.s3 - 14, ...OVER },
  { t: TL.s3 + 4, ...OVER },
  { t: TL.s3 + 30, ...FOCUS },
  { t: TL.s3Drop - 4, ...FOCUS },
  { t: TL.s3Drop + 12, ...TOAST },
  { t: TL.s3Drop + 60, ...TOAST },
  { t: TL.s4 - 16, ...OVER },
  { t: TL.s4 + 4, ...OVER },
  { t: TL.s4 + 30, ...FOCUS },
  { t: toggleDone, ...FOCUS },
  { t: TL.s5 - 14, ...OVER },
  { t: TL.success, ...OVER },
  { t: TL.success + 24, ...SUCC },
  { t: TL.successQr + 4, ...SUCC },
  { t: TL.successQr + 34, ...SUCC_QR },
  { t: TL.end, ...SUCC_QR },
];

// Wizard body scroll (px) per beat.
const SCROLL = [
  { t: 0, v: 0 },
  { t: TL.s1Scroll, v: 0 },
  { t: TL.s1Scroll + 30, v: 120 },
  { t: TL.s2 - 1, v: 120 },
  { t: TL.s2, v: 0 },
  { t: TL.cand[1].added + 4, v: 0 },
  { t: TL.cand[1].added + 30, v: 170 },
  { t: TL.s3 - 1, v: 170 },
  { t: TL.s3, v: 0 },
  { t: TL.s3Drop + 16, v: 0 },
  { t: TL.s3Drop + 50, v: 260 },
  { t: TL.s4 - 1, v: 260 },
  { t: TL.s4, v: 0 },
  { t: TL.s4Scroll, v: 0 },
  { t: TL.s4Scroll + 30, v: 300 },
  { t: TL.s4Toggle.quorum + 10, v: 300 },
  { t: TL.s4Toggle.quorum + 30, v: 380 },
  { t: TL.s5 - 1, v: 380 },
  { t: TL.s5, v: 0 },
  { t: TL.s5 + 30, v: 0 },
  { t: TL.s5 + 120, v: 300 },
  { t: TL.success - 1, v: 300 },
  { t: TL.success, v: 0 },
  { t: TL.successQr + 4, v: 0 },
  { t: TL.successQr + 34, v: 322 },
];

// Each step's card introduces the step and then gets out of the way (≤ 5 s),
// before the action reaches the lower-left of the form.
const cue = (from: number, until: number, tag: string, text: string): Cue => ({
  from,
  to: Math.min(until, from + 150),
  tag,
  text,
});

export const CUES: Cue[] = [
  cue(8, TL.modalOpen + 30, "Početna", "Administratorica Sveučilišta u Zagrebu pokreće novi izbor s nadzorne ploče."),
  cue(TL.s1 + 34, TL.s2 - 2, "Korak 1", "Osnovni podaci — naziv, opis i način glasovanja za Studentski zbor."),
  cue(TL.s2 + 8, TL.s3 - 2, "Korak 2", "Kandidati — unos kandidata i opcija „Suzdržan” na listiću."),
  cue(TL.s3 + 8, TL.s3Drop + 34, "Korak 3", "Popis glasača — uvoz studenata iz CSV-a. Svatko dobiva jednokratnu poveznicu."),
  cue(TL.s4 + 8, TL.s5 - 2, "Korak 4", "Raspored i postavke — termin glasovanja, kvorum i automatski podsjetnici."),
  cue(TL.s5 + 8, TL.success - 2, "Korak 5", "Pregled i potvrda — sve na jednom mjestu prije izrade izbora."),
  cue(TL.success + 14, TL.successQr - 2, "Gotovo", "Izbori su izrađeni — glasovanje se automatski otvara 10. studenoga u 8:00."),
  cue(TL.successQr + 12, TL.end, "QR kod", "QR kod vodi studente izravno na glasački listić — glas ostaje anoniman."),
];

const URL_DASH = "app.electius.com/hr/home";
const URL_WIZ = "app.electius.com/hr/elections/new";

export function AppDemo() {
  const f = useCurrentFrame();

  const cam = keyframes(f, CAM);
  const s = cam.s;
  const x = clamp(cam.x, 960 / s, 1920 - 960 / s);
  const y = clamp(cam.y, 540 / s, 1080 - 540 / s);
  const camTransform = `translate(${960 - x * s}px, ${540 - y * s}px) scale(${s})`;

  const scrollKf = keyframes(f, SCROLL.map(({ t, v }) => ({ t, v })));
  const scroll = scrollKf.v;

  const wizardOpen = f >= TL.modalOpen;
  const modalP = prog(f, TL.modalOpen, 20, easeOut);
  const step = stepAt(f);
  const isSuccess = f >= TL.success;
  const nextPressed = f >= stepStart(Math.min(5, step + 1)) - 4 && step < 5 && f < stepStart(step + 1);
  const createPressed = f >= TL.s5Create && f < TL.s5Create + 5;
  const creating = f >= TL.s5Create && !isSuccess;

  const carrying = f >= TL.s3Grab - 4 && f < TL.s3Drop + 6;
  const chipP = f < TL.s3Drop ? prog(f, TL.s3Grab - 4, 10, easeOut) : 1 - prog(f, TL.s3Drop, 6);

  const StepBody = [Step1, Step2, Step3, Step4, Step5][step - 1];

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT.body,
        background: "radial-gradient(120% 120% at 20% 0%, #24497a 0%, #142b4a 55%, #0c1c33 100%)",
      }}
    >
      <div
        data-camera-root
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          transformOrigin: "0 0",
          transform: camTransform,
        }}
      >
        <BrowserFrame url={wizardOpen ? URL_WIZ : URL_DASH}>
          <Dashboard pressNew={f >= TL.clickNew && f < TL.clickNew + 5} />
          {wizardOpen && (
            <ModalFrame p={modalP}>
              {isSuccess ? (
                <Success scroll={scroll} />
              ) : (
                <WizardShell
                  step={step}
                  scroll={scroll}
                  nextPressed={nextPressed}
                  createPressed={createPressed}
                  creating={creating}
                >
                  <StepEnter key={step} start={stepStart(step)}>
                    <StepBody />
                  </StepEnter>
                </WizardShell>
              )}
            </ModalFrame>
          )}
          <Toast text={importedToast(VOTER_COUNT)} from={TL.s3Drop + 4} dur={80} />
        </BrowserFrame>
        <Cursor
          waypoints={WAYPOINTS}
          clicks={CLICK_FRAMES}
          carry={
            carrying ? (
              <div style={{ opacity: chipP, transform: `scale(${0.7 + 0.3 * chipP})`, transformOrigin: "0 0" }}>
                <FileChip />
              </div>
            ) : undefined
          }
        />
      </div>
      <Captions cues={CUES} />
    </AbsoluteFill>
  );
}

export const APP_DEMO_DURATION = TL.end;
