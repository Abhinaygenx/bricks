import { ImageResponse } from "next/og";

/** PNG app icons generated at build/request time, so no binary assets live in the repo. */
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = raw === "512" ? 512 : raw === "180" ? 180 : 192;
  const maskable = new URL(req.url).searchParams.get("maskable") === "1";
  const pad = maskable ? size * 0.12 : 0;
  const inner = size - pad * 2;
  const u = inner / 32;
  const bricks = [
    [6, 8, 9, 1], [17, 8, 9, 1], [6, 14, 4, 0.85], [11.5, 14, 9, 0.85], [22, 14, 4, 0.85], [6, 20, 9, 0.7], [17, 20, 9, 0.7],
  ];
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", background: maskable ? "#A63D2F" : "transparent" }}>
        <div style={{ position: "absolute", left: pad, top: pad, width: inner, height: inner, background: "#A63D2F", borderRadius: maskable ? 0 : 7 * u, display: "flex" }}>
          {bricks.map(([x, y, w, o], i) => (
            <div
              key={i}
              style={{ position: "absolute", left: x * u, top: y * u, width: w * u, height: 4.5 * u, background: "#F8F7F5", opacity: o, borderRadius: 0.8 * u }}
            />
          ))}
        </div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
