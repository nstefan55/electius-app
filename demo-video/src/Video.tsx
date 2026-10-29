import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import "./fonts";
import { Intro, INTRO_DURATION } from "./scenes/Intro";
import { AppDemo, APP_DEMO_DURATION } from "./scenes/AppDemo";
import { Outro, OUTRO_DURATION } from "./scenes/Outro";
import { EndCard, END_DURATION } from "./scenes/EndCard";

const T = 18; // cross-fade frames between scenes

export const TOTAL_DURATION =
  INTRO_DURATION + APP_DEMO_DURATION + OUTRO_DURATION + END_DURATION - 3 * T;

export function ElectiusDemo() {
  return (
    <AbsoluteFill style={{ background: "#0c1c33", fontFamily: "'Noto Sans', sans-serif" }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={INTRO_DURATION}>
          <Intro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={APP_DEMO_DURATION}>
          <AppDemo />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={OUTRO_DURATION}>
          <Outro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={END_DURATION}>
          <EndCard />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
}
