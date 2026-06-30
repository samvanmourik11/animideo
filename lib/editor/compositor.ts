"use client";

import type { Application, Filter, Sprite, Text, Texture } from "pixi.js";
import type { EditorState } from "./store";
import {
  keyframeValueAt,
  type Clip,
  type TextClip,
  type TextStyle,
  type TimelineDoc,
} from "./timeline";

// De preview-compositor. Leest elke frame de live editor-state en tekent de
// zichtbare clips op een Pixi-canvas. Bewust imperatief en losgekoppeld van
// React: de afspeel-klok mag op 60fps draaien zonder re-renders te triggeren.
//
// Belangrijk principe: dit rendert exact hetzelfde Timeline Document dat straks
// de server-render voedt, zodat preview en export gelijk zijn.

interface Resource {
  kind: "image" | "video" | "audio" | "text";
  src: string;
  sprite?: Sprite;
  video?: HTMLVideoElement;
  audio?: HTMLAudioElement;
  text?: Text;
  textKey?: string; // detecteert wijzigingen in tekstinhoud/stijl
  effectsKey?: string; // detecteert wijzigingen in effecten
}

// Als de bronvideo (vanaf trimIn) korter is dan de clip op de timeline, speel 'm
// evenredig LANGZAMER zodat de beweging de hele clip vult i.p.v. te bevriezen op
// het laatste frame (bv. een 5s AI-clip in een 7s scène → ~0,71x). Een handmatig
// ingestelde snelheid (≠ 1) heeft voorrang.
function fitSpeed(clipDuration: number, trimIn: number, videoDuration: number, manualSpeed?: number): number {
  if (manualSpeed && manualSpeed !== 1) return manualSpeed;
  const avail = (videoDuration || 0) - (trimIn || 0);
  if (avail > 0.1 && clipDuration > avail + 0.05) return avail / clipDuration;
  return 1;
}

export class Compositor {
  private app: Application;
  private getState: () => EditorState;
  private resources = new Map<string, Resource>();
  private alive = true;
  private PIXI: typeof import("pixi.js");
  private exportHolder?: { doc: TimelineDoc; currentTime: number; isPlaying: boolean };

  private constructor(
    app: Application,
    PIXI: typeof import("pixi.js"),
    getState: () => EditorState
  ) {
    this.app = app;
    this.PIXI = PIXI;
    this.getState = getState;
  }

  static async create(
    parent: HTMLElement,
    width: number,
    height: number,
    background: string,
    getState: () => EditorState
  ): Promise<Compositor> {
    const PIXI = await import("pixi.js");
    const app = new PIXI.Application();
    await app.init({ width, height, background, antialias: true });
    app.stage.sortableChildren = true;
    app.canvas.style.width = "100%";
    app.canvas.style.height = "100%";
    app.canvas.style.display = "block";
    parent.appendChild(app.canvas);

    const comp = new Compositor(app, PIXI, getState);
    app.ticker.add(comp.frame);
    return comp;
  }

  // ── Export-modus ───────────────────────────────────────────
  // Deterministisch frame-voor-frame renderen voor de server-render. Geen
  // rAF-lus: wij sturen de tijd en wachten op video-seeks, zodat elk frame
  // exact klopt. Wordt gebruikt door de headless render-pagina.
  static async createForExport(
    parent: HTMLElement,
    doc: TimelineDoc
  ): Promise<Compositor> {
    const PIXI = await import("pixi.js");
    const app = new PIXI.Application();
    await app.init({
      width: doc.width,
      height: doc.height,
      background: doc.background,
      antialias: true,
      preserveDrawingBuffer: true, // nodig om pixels uit te lezen
      preference: "webgl",
    });
    app.stage.sortableChildren = true;
    app.ticker.stop(); // wij renderen handmatig
    parent.appendChild(app.canvas);
    const holder = { doc, currentTime: 0, isPlaying: false };
    const comp = new Compositor(app, PIXI, () => holder as unknown as EditorState);
    comp.exportHolder = holder;
    return comp;
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /** Laad alle visuele assets vooraf zodat renderAt synchroon kan tekenen. */
  async preloadAll(): Promise<void> {
    const doc = this.exportHolder!.doc;
    const tasks: Promise<void>[] = [];
    for (const track of doc.tracks) {
      for (const clip of track.clips) {
        if (clip.type === "image") tasks.push(this.preloadImage(clip));
        else if (clip.type === "video") tasks.push(this.preloadVideo(clip));
        else if (clip.type === "text") this.ensureText(clip);
      }
    }
    await Promise.all(tasks);
  }

  private async preloadImage(clip: Clip & { src: string }) {
    const tex = await this.PIXI.Assets.load(clip.src);
    let r = this.resources.get(clip.id);
    if (!r) {
      r = { kind: "image", src: clip.src };
      this.resources.set(clip.id, r);
    }
    if (!r.sprite) {
      const s = new this.PIXI.Sprite(tex);
      s.anchor.set(0.5);
      this.app.stage.addChild(s);
      r.sprite = s;
    }
  }

  private preloadVideo(clip: Clip & { src: string }): Promise<void> {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.playsInline = true;
      video.muted = true; // audio wordt los gemixt
      video.preload = "auto";
      const r: Resource = { kind: "video", src: clip.src, video };
      this.resources.set(clip.id, r);
      const ready = () => {
        if (!r.sprite && video.videoWidth) {
          const source = new this.PIXI.VideoSource({
            resource: video,
            autoPlay: false,
            autoLoad: true,
            updateFPS: 0,
          });
          const s = new this.PIXI.Sprite(new this.PIXI.Texture({ source }));
          s.anchor.set(0.5);
          this.app.stage.addChild(s);
          r.sprite = s;
        }
        resolve();
      };
      video.addEventListener("loadeddata", ready, { once: true });
      video.addEventListener("error", () => resolve(), { once: true });
      video.src = clip.src;
      video.load();
    });
  }

  /** Zet afspeelstatus in export-modus (voor realtime opname). */
  setExportPlaying(playing: boolean) {
    if (this.exportHolder) this.exportHolder.isPlaying = playing;
  }

  /** Render het frame voor tijd t zonder op seeks te wachten (realtime opname). */
  tick(t: number) {
    if (!this.exportHolder) return;
    this.exportHolder.currentTime = t;
    this.frame();
    this.app.render();
  }

  /** Render exact één frame op tijd t (seconden). Wacht op video-seeks. */
  async renderAt(t: number): Promise<void> {
    const holder = this.exportHolder!;
    holder.currentTime = t;
    const seeks: Promise<void>[] = [];
    for (const track of holder.doc.tracks) {
      for (const clip of track.clips) {
        if (clip.type !== "video") continue;
        const active = t >= clip.start && t < clip.start + clip.duration;
        if (!active) continue;
        const v = this.resources.get(clip.id)?.video;
        if (!v) continue;
        const speed = fitSpeed(clip.duration, clip.trimIn ?? 0, v.duration, clip.speed);
        const target = (clip.trimIn ?? 0) + (t - clip.start) * speed;
        if (Math.abs(v.currentTime - target) > 0.02) {
          seeks.push(
            new Promise<void>((res) => {
              const on = () => {
                v.removeEventListener("seeked", on);
                res();
              };
              v.addEventListener("seeked", on);
              v.currentTime = Math.max(0, target);
            })
          );
        }
      }
    }
    await Promise.all(seeks);
    // Forceer GPU-upload van de huidige videoframes (texture is al gealloceerd).
    for (const r of this.resources.values()) {
      if (r.video && r.sprite) r.sprite.texture.source.update();
    }
    this.frame();
    this.app.render();
  }

  private ensure(clip: Clip & { src: string }): Resource {
    let r = this.resources.get(clip.id);
    if (r && r.src !== clip.src) {
      this.disposeResource(r);
      this.resources.delete(clip.id);
      r = undefined;
    }
    if (r) return r;

    r = { kind: clip.type === "video" ? "video" : "image", src: clip.src };
    this.resources.set(clip.id, r);

    if (clip.type === "image") {
      this.PIXI.Assets.load(clip.src)
        .then((tex: Texture) => {
          if (!this.alive || !this.resources.has(clip.id)) return;
          const sprite = new this.PIXI.Sprite(tex);
          sprite.anchor.set(0.5);
          this.app.stage.addChild(sprite);
          r!.sprite = sprite;
        })
        .catch((e) => console.error("[editor] afbeelding laden mislukt", clip.src, e));
    } else {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.playsInline = true;
      video.preload = "auto";
      video.muted = false;
      video.loop = false;
      r.video = video;

      // Maak de texture/sprite pas aan zodra de video echt data heeft. Anders
      // alloceert Pixi de GPU-texture met 0x0 en faalt de eerste frame-upload
      // (glCopySubTexture: destination level must be defined).
      const build = () => {
        if (!this.alive || !this.resources.has(clip.id) || r!.sprite) return;
        if (!video.videoWidth) return;
        const source = new this.PIXI.VideoSource({
          resource: video,
          autoPlay: false,
          autoLoad: true,
          updateFPS: 0,
        });
        const sprite = new this.PIXI.Sprite(new this.PIXI.Texture({ source }));
        sprite.anchor.set(0.5);
        this.app.stage.addChild(sprite);
        r!.sprite = sprite;
      };
      video.addEventListener("loadeddata", build);
      video.addEventListener("error", () =>
        console.error("[editor] video laadfout", video.error?.code, clip.src)
      );
      // Bij een seek tijdens pauze: forceer een veilige texture-update (de
      // texture is dan al volledig gealloceerd, dus dit is wel toegestaan).
      video.addEventListener("seeked", () => r!.sprite?.texture.source.update());
      video.src = clip.src;
      video.load();
    }
    return r;
  }

  /** Fade-in/out factor (0..1) op basis van clip-positie in de tijd. Een
   *  overgang (transitionIn/Out) telt mee als een fade van die lengte, zodat een
   *  toegevoegde overgang meteen zichtbaar is in preview én export. */
  private fadeFactor(clip: Clip, t: number): number {
    let f = 1;
    const local = t - clip.start;
    const fin = Math.max(clip.fadeIn ?? 0, clip.transitionIn?.duration ?? 0);
    const fout = Math.max(clip.fadeOut ?? 0, clip.transitionOut?.duration ?? 0);
    if (fin && local < fin) f *= Math.max(0, local / fin);
    if (fout && clip.duration - local < fout) f *= Math.max(0, (clip.duration - local) / fout);
    return f;
  }

  private clipAlpha(clip: Clip, t: number): number {
    const op = keyframeValueAt(clip, "opacity", t - clip.start, clip.opacity ?? 1);
    return op * this.fadeFactor(clip, t);
  }

  private layout(sprite: Sprite, clip: Clip, mw: number, mh: number, t: number) {
    const W = this.app.renderer.width;
    const H = this.app.renderer.height;
    if (!mw || !mh) {
      sprite.visible = false;
      return;
    }
    const local = t - clip.start;
    const tf = clip.transform;
    const base = Math.min(W / mw, H / mh);
    const sx = keyframeValueAt(clip, "scale", local, tf?.scale ?? 1);
    sprite.scale.set(base * sx);
    sprite.x = keyframeValueAt(clip, "x", local, tf?.x ?? 0.5) * W;
    sprite.y = keyframeValueAt(clip, "y", local, tf?.y ?? 0.5) * H;
    sprite.rotation =
      (keyframeValueAt(clip, "rotation", local, tf?.rotation ?? 0) * Math.PI) / 180;
    sprite.alpha = this.clipAlpha(clip, t);
    sprite.visible = true;
  }

  /** Pas kleur-/blur-filters toe (gecached op effecten-hash). */
  private applyEffects(r: Resource, clip: Clip) {
    const display = r.sprite ?? r.text;
    if (!display) return;
    const key = JSON.stringify(clip.effects ?? []);
    if (r.effectsKey === key) return;
    r.effectsKey = key;
    const effects = clip.effects ?? [];
    if (effects.length === 0) {
      display.filters = [];
      return;
    }
    const out: Filter[] = [];
    const cm = new this.PIXI.ColorMatrixFilter();
    let useCm = false;
    for (const e of effects) {
      switch (e.kind) {
        case "brightness":
          cm.brightness(e.amount, true);
          useCm = true;
          break;
        case "contrast":
          cm.contrast(e.amount, true);
          useCm = true;
          break;
        case "saturation":
          cm.saturate(e.amount, true);
          useCm = true;
          break;
        case "grayscale":
          cm.saturate(-e.amount, true);
          useCm = true;
          break;
        case "blur":
          out.push(new this.PIXI.BlurFilter({ strength: e.amount }));
          break;
      }
    }
    if (useCm) out.unshift(cm);
    display.filters = out;
  }

  private frame = () => {
    if (!this.alive) return;
    const { doc, currentTime, isPlaying } = this.getState();
    const used = new Set<string>();
    let z = 0;

    for (const track of doc.tracks) {
      if (track.hidden) continue;
      for (const clip of track.clips) {
        const active =
          currentTime >= clip.start && currentTime < clip.start + clip.duration;

        // Audio: geen beeld, wel afspelen gesynct aan de klok.
        if (clip.type === "audio") {
          if (active && !track.muted) {
            used.add(clip.id);
            this.syncAudio(clip, currentTime, isPlaying);
          }
          continue;
        }

        // Tekst: Pixi Text met stijl en intro-animatie.
        if (clip.type === "text") {
          if (!active) continue;
          used.add(clip.id);
          const rt = this.ensureText(clip);
          if (rt.text) {
            rt.text.zIndex = z++;
            this.layoutText(rt.text, clip, currentTime);
            this.applyEffects(rt, clip);
          }
          continue;
        }

        if (clip.type !== "video" && clip.type !== "image") continue;
        if (!active) continue;
        used.add(clip.id);

        const r = this.ensure(clip);
        if (!r.sprite) continue;
        r.sprite.zIndex = z++;

        if (r.kind === "video" && r.video) {
          const v = r.video;
          const trimIn = ("trimIn" in clip ? clip.trimIn : 0) ?? 0;
          const speed = clip.type === "video" ? fitSpeed(clip.duration, trimIn, v.duration, clip.speed) : 1;
          const target = trimIn + (currentTime - clip.start) * speed;
          if (clip.type === "video") {
            v.volume = clip.volume ?? 1;
            v.playbackRate = speed;
          }
          if (isPlaying) {
            if (v.paused) v.play().catch(() => {});
            if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
          } else {
            if (!v.paused) v.pause();
            if (Math.abs(v.currentTime - target) > 0.05) v.currentTime = target;
          }
          this.layout(r.sprite, clip, v.videoWidth, v.videoHeight, currentTime);
        } else {
          this.layout(
            r.sprite,
            clip,
            r.sprite.texture.width,
            r.sprite.texture.height,
            currentTime
          );
        }
        this.applyEffects(r, clip);
      }
    }

    // Ongebruikte resources verbergen en media pauzeren.
    for (const [id, r] of this.resources) {
      if (used.has(id)) continue;
      if (r.sprite) r.sprite.visible = false;
      if (r.text) r.text.visible = false;
      if (r.video && !r.video.paused) r.video.pause();
      if (r.audio && !r.audio.paused) r.audio.pause();
    }
  };

  private ensureAudio(clip: Clip & { src: string }): Resource {
    let r = this.resources.get(clip.id);
    if (r && r.src !== clip.src) {
      this.disposeResource(r);
      this.resources.delete(clip.id);
      r = undefined;
    }
    if (r) return r;
    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.src = clip.src;
    r = { kind: "audio", src: clip.src, audio };
    this.resources.set(clip.id, r);
    return r;
  }

  private syncAudio(clip: Clip, t: number, playing: boolean) {
    if (clip.type !== "audio") return;
    const r = this.ensureAudio(clip);
    const a = r.audio;
    if (!a) return;
    a.volume = (clip.volume ?? 1) * this.fadeFactor(clip, t);
    const target = (clip.trimIn ?? 0) + (t - clip.start);
    if (playing) {
      if (a.paused) a.play().catch(() => {});
      if (Math.abs(a.currentTime - target) > 0.3) a.currentTime = target;
    } else {
      if (!a.paused) a.pause();
      if (Math.abs(a.currentTime - target) > 0.05) a.currentTime = target;
    }
  };

  private makeTextStyle(s: TextStyle) {
    const opts = {
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: String(s.fontWeight),
      fill: s.color,
      align: s.align,
      letterSpacing: s.letterSpacing ?? 0,
      ...(s.lineHeight ? { lineHeight: s.fontSize * s.lineHeight } : {}),
      ...(s.stroke && s.stroke.width > 0
        ? { stroke: { color: s.stroke.color, width: s.stroke.width, join: "round" } }
        : {}),
      ...(s.shadow
        ? {
            dropShadow: {
              color: s.shadow.color,
              blur: s.shadow.blur,
              distance: Math.hypot(s.shadow.x, s.shadow.y),
              angle: Math.atan2(s.shadow.y, s.shadow.x),
              alpha: 1,
            },
          }
        : {}),
      wordWrap: true,
      wordWrapWidth: this.app.renderer.width * 0.9,
    };
    return new this.PIXI.TextStyle(
      opts as ConstructorParameters<typeof this.PIXI.TextStyle>[0]
    );
  }

  private ensureText(clip: TextClip): Resource {
    let r = this.resources.get(clip.id);
    const key = JSON.stringify({ t: clip.text, s: clip.style });
    if (!r) {
      r = { kind: "text", src: clip.id, textKey: key };
      const text = new this.PIXI.Text({
        text: clip.text,
        style: this.makeTextStyle(clip.style),
      });
      text.anchor.set(0.5);
      this.app.stage.addChild(text);
      r.text = text;
      this.resources.set(clip.id, r);
      return r;
    }
    if (r.textKey !== key && r.text) {
      r.text.text = clip.text;
      r.text.style = this.makeTextStyle(clip.style);
      r.textKey = key;
    }
    return r;
  }

  private layoutText(text: Text, clip: TextClip, currentTime: number) {
    const W = this.app.renderer.width;
    const H = this.app.renderer.height;
    const tf = clip.transform;
    const local = currentTime - clip.start;
    let scale = keyframeValueAt(clip, "scale", local, tf?.scale ?? 1);
    const x = keyframeValueAt(clip, "x", local, tf?.x ?? 0.5) * W;
    let y = keyframeValueAt(clip, "y", local, tf?.y ?? 0.5) * H;
    const rot = keyframeValueAt(clip, "rotation", local, tf?.rotation ?? 0);
    let alpha = this.clipAlpha(clip, currentTime);

    // Intro-animatie over de eerste 0,4s van de clip.
    const p = Math.max(0, Math.min(1, (currentTime - clip.start) / 0.4));
    const ease = 1 - Math.pow(1 - p, 2);
    let display = clip.text;
    switch (clip.preset) {
      case "fade-in":
        alpha *= ease;
        break;
      case "pop":
        alpha *= ease;
        scale *= 0.7 + 0.3 * ease;
        break;
      case "slide-up":
        alpha *= ease;
        y += (1 - ease) * 0.05 * H;
        break;
      case "typewriter":
        display = clip.text.slice(0, Math.ceil(clip.text.length * p));
        break;
      case "word-by-word": {
        const w = clip.text.split(" ");
        display = w.slice(0, Math.max(1, Math.ceil(w.length * p))).join(" ");
        break;
      }
      default:
        break;
    }
    if (text.text !== display) text.text = display;
    text.scale.set(scale);
    text.x = x;
    text.y = y;
    text.rotation = (rot * Math.PI) / 180;
    text.alpha = alpha;
    text.visible = true;
  }

  /**
   * Positie/grootte/rotatie van een clip, in fracties van de compositie.
   * Gebruikt door de canvas-overlay om de selectie-handvatten te tekenen.
   */
  getClipLayout(clipId: string): {
    cx: number;
    cy: number;
    halfW: number;
    halfH: number;
    rotation: number;
  } | null {
    const r = this.resources.get(clipId);
    const s = r?.sprite ?? r?.text;
    if (!s || !s.visible) return null;
    const W = this.app.renderer.width;
    const H = this.app.renderer.height;
    return {
      cx: s.x / W,
      cy: s.y / H,
      halfW: s.width / 2 / W,
      halfH: s.height / 2 / H,
      rotation: s.rotation,
    };
  }

  /** Bovenste zichtbare clip op een punt (compositie-px). Voor klik-selectie. */
  hitTest(compX: number, compY: number): string | null {
    let best: string | null = null;
    let bestZ = -Infinity;
    for (const [id, r] of this.resources) {
      const s = r.sprite ?? r.text;
      if (!s || !s.visible) continue;
      const b = s.getBounds();
      if (compX >= b.minX && compX <= b.maxX && compY >= b.minY && compY <= b.maxY) {
        if (s.zIndex >= bestZ) {
          bestZ = s.zIndex;
          best = id;
        }
      }
    }
    return best;
  }

  /** Wissel naar een nieuwe compositie-resolutie/achtergrond. */
  resize(width: number, height: number, background: string) {
    this.app.renderer.resize(width, height);
    this.app.renderer.background.color = background;
  }

  private disposeResource(r: Resource) {
    if (r.sprite) {
      r.sprite.destroy();
    }
    if (r.text) {
      r.text.destroy();
    }
    if (r.video) {
      r.video.pause();
      r.video.removeAttribute("src");
      r.video.load();
    }
    if (r.audio) {
      r.audio.pause();
      r.audio.removeAttribute("src");
      r.audio.load();
    }
  }

  destroy() {
    this.alive = false;
    this.app.ticker.remove(this.frame);
    for (const r of this.resources.values()) this.disposeResource(r);
    this.resources.clear();
    this.app.destroy(true, { children: true });
  }
}
