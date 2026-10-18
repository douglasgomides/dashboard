import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Caption } from "@remotion/captions";
import { CAPTION_BACKGROUND, DEFAULT_CAPTION_SIZE, readableCaptionAccent } from "../../../src/lib/creative-intelligence/caption-style";
export type MotionProps = {
  videoUrl: string;
  duration: number;
  width: number;
  height: number;
  accent: string;
  captionPosition: "lower" | "upper";
  gentleZoom: boolean;
  subtitles: boolean;
  subtitleSize: number;
  pages: Caption[][];
  cutTimes: number[];
};
export const ReferenceVideo = ({
  videoUrl,
  accent,
  captionPosition,
  gentleZoom,
  subtitles,
  subtitleSize = DEFAULT_CAPTION_SIZE,
  pages,
  cutTimes,
}: MotionProps) => {
  const frame = useCurrentFrame(),
    { fps, width, height } = useVideoConfig(),
    seconds = frame / fps,
    scale = Math.min(width, height) / 720,
    highlight = readableCaptionAccent(accent);
  const cutIndex = Math.max(
      0,
      cutTimes.findLastIndex((t) => seconds >= t),
    ),
    cutStart = cutTimes[cutIndex] || 0;
  const page = pages.find(
    (p) =>
      seconds * 1000 >= (p[0]?.startMs ?? Infinity) &&
      seconds * 1000 < (p.at(-1)?.endMs ?? 0),
  );
  return (
    <AbsoluteFill
      style={{
        background: "#141414",
        fontFamily: "Arial, Liberation Sans, sans-serif",
      }}
    >
      {videoUrl ? (
        <OffthreadVideo
          src={videoUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            scale: gentleZoom
              ? interpolate(
                  frame,
                  [cutStart * fps, cutStart * fps + 3 * fps],
                  cutIndex % 2 ? [1.04, 1.055] : [1, 1.015],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                )
              : 1,
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            color: "#f8f5ef",
            alignItems: "center",
            justifyContent: "center",
            fontSize: width * 0.065,
            textAlign: "center",
            padding: width * 0.1,
          }}
        >
          Nexo
          <br />
          Edição orientada por referências
        </AbsoluteFill>
      )}
      {subtitles && page && (
        <div
          style={{
            position: "absolute",
            left: width * 0.09,
            right: width * 0.09,
            ...(captionPosition === "upper"
              ? { top: height * 0.14 }
              : { bottom: height * 0.19 }),
            textAlign: "center",
            fontSize: subtitleSize * scale,
            fontWeight: 700,
            lineHeight: 1.2,
            color: "#fff",
          }}
        >
          <span
            style={{
              display: "inline-block",
              maxWidth: "100%",
              boxSizing: "border-box",
              background: CAPTION_BACKGROUND,
              padding: `${10 * scale}px ${16 * scale}px`,
              borderRadius: 8 * scale,
              overflowWrap: "anywhere",
            }}
          >
            {page.map((word, i) => (
              <span
                key={i}
                style={{
                  color:
                    seconds * 1000 >= word.startMs &&
                    seconds * 1000 < word.endMs
                      ? highlight
                      : "#fff",
                  whiteSpace: "pre-wrap",
                }}
              >
                {word.text}
              </span>
            ))}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};
