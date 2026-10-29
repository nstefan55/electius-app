import { Composition } from "remotion";
import { ElectiusDemo, TOTAL_DURATION } from "./Video";
import { AppDemo, APP_DEMO_DURATION } from "./scenes/AppDemo";
import { VIDEO } from "./theme";
import "./fonts";

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="ElectiusDemo"
        component={ElectiusDemo}
        durationInFrames={TOTAL_DURATION}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
      />
      {/* The walkthrough on its own — handy for iterating on timing. */}
      <Composition
        id="AppWalkthrough"
        component={AppDemo}
        durationInFrames={APP_DEMO_DURATION}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
      />
    </>
  );
}
