"use client";

export default function VideoTest() {
  const url = "https://suuskaaobsbttahqcoct.supabase.co/storage/v1/object/public/scene-assets/ce242a90-a161-423d-8925-ce13010a9853/8a216827-2c7a-400a-806b-d426124ea70f/scene-1776613402763-0-video.mp4";

  return (
    <div style={{ padding: 20, background: "#000", minHeight: "100vh", color: "white" }}>
      <h1>Video test</h1>
      <p>Test 1 — Raw video tag, full width, with controls:</p>
      <video
        src={url}
        controls
        muted
        playsInline
        style={{ width: 640, height: 360, border: "2px solid red" }}
      />
      <p>Test 2 — Video in container met aspect-ratio:</p>
      <div style={{ position: "relative", width: 640, aspectRatio: "16/9", background: "#333", border: "2px solid yellow" }}>
        <video
          src={url}
          controls
          muted
          playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      </div>
      <p>Test 3 — Object element (fallback):</p>
      <video src={url} controls style={{ width: 320 }} />
    </div>
  );
}
