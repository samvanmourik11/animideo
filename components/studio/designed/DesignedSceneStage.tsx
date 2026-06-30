// Deterministische renderer voor ontworpen studio-scènes (CTA + bullets).
// Eén frame tegelijk: `progress` (0→1) drijft de subtiele in-animatie. Dezelfde
// component voedt zowel de live preview als de frame-voor-frame video-export,
// zodat preview en export identiek zijn.
//
// Lay-out is FLOW-BASED: elk element krijgt een geschatte hoogte (incl. tekst die
// over meerdere regels loopt) en wordt met vaste tussenruimtes gestapeld en als
// blok verticaal gecentreerd. Zo lopen knoppen en teksten nooit door elkaar.

import { ExIcon } from "@/components/explainer/icons";
import {
  DESIGNED_SIZES,
  easeOut,
  type DesignedScene,
} from "@/lib/studio/designed-scene";

const FONT = "Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif";

/** Ruwe schatting van het aantal regels dat tekst inneemt op breedte `width`. */
function estLines(text: string, fontSize: number, width: number, weight = 700): number {
  if (!text) return 0;
  const factor = weight >= 700 ? 0.58 : 0.52; // gem. tekenbreedte t.o.v. fontSize
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * factor)));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

function estTextWidth(text: string, fontSize: number, weight = 500): number {
  const factor = weight >= 700 ? 0.58 : 0.52;
  return text.length * fontSize * factor;
}

export default function DesignedSceneStage({
  scene,
  progress,
}: {
  scene: DesignedScene;
  progress: number;
}) {
  const { width: W, height: H } = DESIGNED_SIZES[scene.format];
  const t = scene.theme;
  const cta = scene.kind === "cta";

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", background: t.background }}
    >
      {/* Unieke huisstijl-achtergrond: diagonale gradient (primary → mix met
          accent) + decoratieve kleurvlakken. Richting/posities verschillen per
          scènetype zodat opsomming en eindscène elk een eigen look hebben. */}
      <defs>
        <linearGradient
          id="ds-bg"
          x1={cta ? "100%" : "0%"}
          y1={cta ? "100%" : "0%"}
          x2={cta ? "0%" : "100%"}
          y2={cta ? "0%" : "100%"}
        >
          <stop offset="0%" stopColor={t.gradientFrom} />
          <stop offset="100%" stopColor={t.gradientTo} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="url(#ds-bg)" />
      <circle cx={cta ? W * 0.14 : W * 0.86} cy={H * 0.14} r={W * 0.3} fill={t.blobA} opacity={0.16} />
      <circle cx={cta ? W * 0.9 : W * 0.1} cy={H * 0.9} r={W * 0.26} fill={t.blobB} opacity={0.12} />
      <circle cx={W * 0.5} cy={cta ? H * 1.04 : H * -0.04} r={W * 0.17} fill={t.accent} opacity={0.1} />

      {scene.kind === "cta" ? (
        <CtaLayout scene={scene} W={W} H={H} progress={progress} />
      ) : (
        <BulletsLayout scene={scene} W={W} H={H} progress={progress} />
      )}
    </svg>
  );
}

// ── CTA-eindscène ──────────────────────────────────────────────────────────────
function CtaLayout({
  scene,
  W,
  H,
  progress,
}: {
  scene: DesignedScene;
  W: number;
  H: number;
  progress: number;
}) {
  const t = scene.theme;
  // progress (0→1) loopt over de VOLLE scèneduur; reken om naar seconden zodat
  // de in-animatie op tijd gebeurt (en, bij bullets, per-bullet timing klopt).
  const timeSec = progress * (scene.durationSec || 5);
  const e = easeOut(Math.min(1, timeSec / 0.6));
  const portrait = scene.format === "9:16";
  const pad = W * 0.1;
  const innerW = W - pad * 2;

  const titleSize = Math.round(W * (portrait ? 0.072 : 0.05));
  const subSize = Math.round(titleSize * 0.42);
  const contactSize = Math.round(titleSize * 0.4);
  const gap = titleSize * 0.7; // basis-tussenruimte

  // Heights per blok
  const logoH = scene.logoUrl ? H * 0.12 : 0;
  const titleLines = estLines(scene.title, titleSize, innerW, 800);
  const titleH = titleLines * titleSize * 1.12;
  const subLines = scene.subtitle ? estLines(scene.subtitle, subSize, innerW, 500) : 0;
  const subH = subLines ? subLines * subSize * 1.3 + gap * 0.4 : 0;

  const contact = scene.contact ?? {};
  const contactRows = [
    contact.website && { icon: "globe", text: contact.website },
    contact.email && { icon: "mail", text: contact.email },
    contact.phone && { icon: "phone", text: contact.phone },
  ].filter(Boolean) as { icon: string; text: string }[];

  const ctaLabel = contact.cta || "Neem contact op";
  const pillH = titleSize * 1.5;
  const pillW = Math.min(innerW, estTextWidth(ctaLabel, titleSize * 0.5, 700) + W * 0.08);

  const rowH = contactSize * 1.9;
  const contactH = contactRows.length ? contactRows.length * rowH : 0;

  // Verticale stapel, als blok gecentreerd
  const totalH =
    logoH + (logoH ? gap : 0) +
    titleH + subH +
    gap * 1.4 + pillH +
    (contactH ? gap * 1.4 + contactH : 0);
  let y = Math.max(H * 0.1, (H - totalH) / 2);
  const slide = (1 - e) * H * 0.03;

  const logoY = y;
  if (logoH) y += logoH + gap;
  const titleY = y;
  y += titleH + subH + gap * 1.4;
  const pillY = y;
  y += pillH + gap * 1.4;
  const contactY = y;

  // Contactblok horizontaal centreren op basis van de breedste regel
  const widest = contactRows.reduce((m, r) => Math.max(m, estTextWidth(r.text, contactSize, 500)), 0);
  const blockW = contactSize * 2.1 + widest;
  const contactX = Math.max(pad, (W - blockW) / 2);

  return (
    <g transform={`translate(0, ${slide})`} opacity={e}>
      {scene.logoUrl && (
        <image
          href={scene.logoUrl}
          x={(W - W * 0.2) / 2}
          y={logoY}
          width={W * 0.2}
          height={logoH}
          preserveAspectRatio="xMidYMid meet"
        />
      )}

      <foreignObject x={pad} y={titleY} width={innerW} height={titleH + subH}>
        <div style={{ fontFamily: FONT, textAlign: "center", color: t.text }}>
          <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.02em" }}>
            {scene.title}
          </div>
          {scene.subtitle && (
            <div style={{ fontSize: subSize, fontWeight: 500, color: t.textMuted, marginTop: gap * 0.4, lineHeight: 1.3 }}>
              {scene.subtitle}
            </div>
          )}
        </div>
      </foreignObject>

      <g transform={`translate(${(W - pillW) / 2}, ${pillY})`}>
        <g transform={`scale(${0.94 + e * 0.06})`} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
          <rect x={0} y={0} width={pillW} height={pillH} rx={pillH / 2} fill={t.accent} />
          <text
            x={pillW / 2}
            y={pillH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily={FONT}
            fontSize={Math.round(titleSize * 0.5)}
            fontWeight={700}
            fill={t.onAccent}
          >
            {ctaLabel}
          </text>
        </g>
      </g>

      {contactRows.length > 0 && (
        <g>
          {contactRows.map((row, i) => {
            const cy = contactY + i * rowH + rowH / 2;
            return (
              <g key={i} transform={`translate(${contactX}, ${cy})`}>
                <circle cx={contactSize * 0.7} cy={0} r={contactSize * 0.85} fill={t.text} opacity={0.14} />
                <ExIcon name={row.icon} x={contactSize * 0.2} y={-contactSize * 0.5} size={contactSize} color={t.text} />
                <text x={contactSize * 2.0} y={0} dominantBaseline="central" fontFamily={FONT} fontSize={contactSize} fontWeight={500} fill={t.text}>
                  {row.text}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
}

// ── Presentatie-/opsommingsscène ────────────────────────────────────────────────
function BulletsLayout({
  scene,
  W,
  H,
  progress,
}: {
  scene: DesignedScene;
  W: number;
  H: number;
  progress: number;
}) {
  const t = scene.theme;
  const dur = scene.durationSec || 6;
  const timeSec = progress * dur;
  const portrait = scene.format === "9:16";
  const pad = W * 0.08;
  const innerW = W - pad * 2;
  const bullets = (scene.bullets ?? []).slice(0, 6);
  const n = bullets.length || 1;
  const REVEAL = 0.4; // seconden in-animatie per bullet

  const titleSize = Math.round(W * (portrait ? 0.06 : 0.044));
  const subSize = Math.round(titleSize * 0.5);
  const bulletSize = Math.round(W * (portrait ? 0.038 : 0.026));
  const badge = bulletSize * 1.6;
  const rowGap = bulletSize * 1.1;
  const rowH = badge + rowGap;

  const titleY = H * 0.14;
  const titleLines = estLines(scene.title, titleSize, innerW, 800);
  const titleH = titleLines * titleSize * 1.12;
  const subH = scene.subtitle ? subSize * 1.4 : 0;

  const blockH = n * badge + (n - 1) * rowGap;
  const titleBottom = titleY + titleH + subH;
  // Bullets onder de titel, en als blok netjes in de resterende ruimte gecentreerd
  const spaceBelow = H - titleBottom - H * 0.08;
  const listTop = titleBottom + titleSize * 0.8 + Math.max(0, (spaceBelow - blockH) / 2);

  return (
    <g>
      <foreignObject x={pad} y={titleY} width={innerW} height={titleH + subH} opacity={easeOut(Math.min(1, timeSec / 0.5))}>
        <div style={{ fontFamily: FONT, color: t.text }}>
          <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.02em" }}>
            {scene.title}
          </div>
          {scene.subtitle && (
            <div style={{ fontSize: subSize, fontWeight: 500, color: t.textMuted, marginTop: 8 }}>
              {scene.subtitle}
            </div>
          )}
        </div>
      </foreignObject>

      {bullets.map((b, i) => {
        // Synced met de stem: onthul op revealAt (seconden). Geen timing bekend?
        // Val terug op gelijkmatige spreiding over de scèneduur.
        const reveal = typeof b.revealAt === "number"
          ? b.revealAt
          : (i + 0.4) * (dur / n);
        const p = easeOut(Math.min(1, Math.max(0, (timeSec - reveal) / REVEAL)));
        const yTop = listTop + i * rowH;
        const slideX = (1 - p) * W * 0.04;
        return (
          <g key={i} transform={`translate(${slideX}, 0)`} opacity={p}>
            <rect x={pad} y={yTop} width={badge} height={badge} rx={badge * 0.28} fill={t.accent} />
            <ExIcon
              name={b.icon || "check"}
              x={pad + badge * 0.24}
              y={yTop + badge * 0.24}
              size={badge * 0.52}
              color={t.onAccent}
            />
            <foreignObject x={pad + badge * 1.35} y={yTop} width={innerW - badge * 1.35} height={badge}>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: bulletSize,
                  fontWeight: 600,
                  color: t.text,
                  lineHeight: 1.2,
                  height: badge,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {b.text}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </g>
  );
}
