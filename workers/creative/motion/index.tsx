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
      subtitles: false,
      pages: [],
      cutTimes: [0],
    }}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(1, Math.ceil(props.duration * 30)),
      width: props.width,
      height: props.height,
    })}
  />
));
