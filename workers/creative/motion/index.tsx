import { registerRoot, Composition } from "remotion";
import { ReferenceVideo } from "./video";
registerRoot(() => (
  <Composition
    id="NexoVideo"
    component={ReferenceVideo}
    durationInFrames={90}
    fps={30}
    width={720}
    height={1280}
    defaultProps={{
      videoUrl: "",
      duration: 3,
      width: 720,
      height: 1280,
      accent: "#d3b66b",
      captionPosition: "lower" as const,
      gentleZoom: false,
      subtitles: true,
      subtitleSize: 48,
      pages: [[
        { text: "Informação clara", startMs: 0, endMs: 1400, timestampMs: null, confidence: null },
        { text: " para decidir.", startMs: 1400, endMs: 3000, timestampMs: null, confidence: null },
      ]],
      cutTimes: [0],
    }}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(1, Math.ceil(props.duration * 30)),
      width: props.width,
      height: props.height,
    })}
  />
));
