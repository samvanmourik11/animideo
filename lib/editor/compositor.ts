"use client";

import type { Application, Filter, Graphics, Sprite, Text, Texture } from "pixi.js";
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
  /**
   * Achtergrondbalk achter de tekst. TextStyle.background stond al jaren in het
   * schema maar werd nergens getekend, waardoor ondertiteling op licht beeld
   * onleesbaar was. Een losse Graphics achter de letters is de enige manier:
   * Pixi's Text kent zelf geen achtergrond.
   */
  bg?: Graphics;
  /**
   * De onbewerkte textuur. Bijsnijden vervangt de textuur van de sprite door een
   * uitsnede; zonder het origineel erbij kun je die snede nooit meer ruimer
   * maken.
   */
  volleTextuur?: Texture;
  /** Onderstreping en doorhaling; die kent Pixi's Text zelf niet. */
  deco?: Graphics;
  cropKey?: string;
  /** Masker voor afgeronde hoeken; alleen aanwezig als de clip er om vraagt. */
  masker?: Graphics;
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

  /**
   * Bijsnijden: de sprite krijgt een uitsnede van de bron in plaats van de hele
   * afbeelding.
   *
   * Bewust via de textuur en niet via een masker: dan wordt het element écht
   * kleiner, klopt het selectiekader eromheen en kun je de uitsnede daarna
   * gewoon verslepen. Met een masker zou de weggesneden ruimte blijven meetellen
   * en pak je bij het slepen lucht beet.
   */
  private pasUitsnedeToe(r: Resource, clip: Clip, bronB: number, bronH: number): { w: number; h: number } {
    const sprite = r.sprite!;
    if (!r.volleTextuur) r.volleTextuur = sprite.texture;
    const c = clip.transform?.crop;
    const key = c ? `${c.top},${c.right},${c.bottom},${c.left}|${bronB}x${bronH}` : "";
    if (r.cropKey !== key) {
      r.cropKey = key;
      const vol = r.volleTextuur;
      const leeg = !c || (!c.top && !c.right && !c.bottom && !c.left);
      if (leeg || !bronB || !bronH) {
        sprite.texture = vol;
      } else {
        const kap = (n: number) => Math.max(0, Math.min(0.45, n || 0));
        const x = kap(c.left) * bronB;
        const y = kap(c.top) * bronH;
        const w = Math.max(8, bronB - x - kap(c.right) * bronB);
        const h = Math.max(8, bronH - y - kap(c.bottom) * bronH);
        sprite.texture = new this.PIXI.Texture({
          source: vol.source,
          frame: new this.PIXI.Rectangle(x, y, w, h),
        });
      }
    }
    return { w: sprite.texture.width || bronB, h: sprite.texture.height || bronH };
  }

  /**
   * Afgeronde hoeken. Het masker deelt de transform van de sprite, dus het
   * draait en schaalt vanzelf mee; alleen de vorm hoeft opnieuw getekend te
   * worden als de maat verandert.
   */
  private pasHoekenToe(r: Resource, clip: Clip, w: number, h: number) {
    const sprite = r.sprite!;
    const straal = clip.transform?.cornerRadius ?? 0;
    if (straal <= 0) {
      if (r.masker) {
        sprite.mask = null;
        r.masker.visible = false;
      }
      return;
    }
    if (!r.masker) {
      r.masker = new this.PIXI.Graphics();
      this.app.stage.addChild(r.masker);
    }
    const m = r.masker;
    m.visible = true;
    m.clear();
    m.roundRect(-w / 2, -h / 2, w, h, Math.min(0.5, straal) * Math.min(w, h));
    m.fill(0xffffff);
    m.x = sprite.x;
    m.y = sprite.y;
    m.rotation = sprite.rotation;
    m.scale.set(sprite.scale.x, sprite.scale.y);
    sprite.mask = m;
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
    // Spiegelen is een negatieve schaal; de anchor staat in het midden, dus het
    // element blijft op zijn plek staan.
    sprite.scale.set(base * sx * (tf?.flipH ? -1 : 1), base * sx * (tf?.flipV ? -1 : 1));
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
            if (rt.bg) rt.bg.zIndex = z++;
            rt.text.zIndex = z++;
            if (rt.deco) rt.deco.zIndex = z++;
            this.layoutText(rt.text, clip, currentTime);
            this.tekenTekstAchtergrond(rt, clip);
            this.tekenTekstStrepen(rt, clip);
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
          const uv = this.pasUitsnedeToe(r, clip, v.videoWidth, v.videoHeight);
          this.layout(r.sprite, clip, uv.w, uv.h, currentTime);
          this.pasHoekenToe(r, clip, uv.w, uv.h);
        } else {
          const vol = r.volleTextuur ?? r.sprite.texture;
          const ui = this.pasUitsnedeToe(r, clip, vol.width, vol.height);
          this.layout(r.sprite, clip, ui.w, ui.h, currentTime);
          this.pasHoekenToe(r, clip, ui.w, ui.h);
        }
        this.applyEffects(r, clip);
      }
    }

    // Ongebruikte resources verbergen en media pauzeren.
    for (const [id, r] of this.resources) {
      if (used.has(id)) continue;
      if (r.sprite) r.sprite.visible = false;
      if (r.text) r.text.visible = false;
      if (r.bg) r.bg.visible = false;
      if (r.masker) r.masker.visible = false;
      if (r.deco) r.deco.visible = false;
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
    // Een muziekbed dat korter is dan de clip lust door — anders valt de muziek
    // in de preview stil terwijl hij in de export wél doorloopt.
    a.loop = clip.loop === true;
    let target = (clip.trimIn ?? 0) + (t - clip.start);
    if (clip.loop && a.duration > 0) target = target % a.duration;
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
      ...(s.italic ? { fontStyle: "italic" } : {}),
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
      const bg = new this.PIXI.Graphics();
      bg.visible = false;
      const deco = new this.PIXI.Graphics();
      deco.visible = false;
      this.app.stage.addChild(bg);
      this.app.stage.addChild(text);
      this.app.stage.addChild(deco);
      r.text = text;
      r.bg = bg;
      r.deco = deco;
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

  /**
   * De balk achter de tekst. Wordt na layoutText getekend omdat hij de
   * uiteindelijke maat van de letters nodig heeft — die kent Pixi pas als de
   * tekst met zijn definitieve inhoud en schaal staat (bij een typemachine-
   * animatie groeit hij per frame mee).
   */
  private tekenTekstAchtergrond(r: Resource, clip: TextClip) {
    const bg = r.bg;
    const text = r.text;
    if (!bg || !text) return;
    const kleur = clip.style.background;
    if (!kleur || !text.visible) {
      bg.visible = false;
      return;
    }
    const marge = clip.style.fontSize * 0.22 * text.scale.x;
    const b = text.width + marge * 2;
    const h = text.height + marge * 1.2;
    bg.clear();
    bg.roundRect(-b / 2, -h / 2, b, h, Math.min(b, h) * 0.18);
    bg.fill(kleur);
    bg.x = text.x;
    bg.y = text.y;
    bg.rotation = text.rotation;
    bg.alpha = text.alpha;
    bg.visible = true;
  }

  /**
   * Onderstreping en doorhaling. Pixi's Text kan dit niet, dus we trekken de
   * strepen zelf op de plek waar de letters staan — dezelfde aanpak als de
   * achtergrondbalk, en om dezelfde reden ná de opmaak van de tekst, omdat we
   * de uiteindelijke breedte nodig hebben.
   */
  private tekenTekstStrepen(r: Resource, clip: TextClip) {
    const deco = r.deco;
    const text = r.text;
    if (!deco || !text) return;
    const { underline, strike } = clip.style;
    if ((!underline && !strike) || !text.visible) {
      deco.visible = false;
      return;
    }
    const b = text.width;
    const h = text.height;
    const dik = Math.max(1, clip.style.fontSize * 0.06 * Math.abs(text.scale.x));
    // Bij holle letters is de vulkleur doorzichtig; dan is de omlijning de kleur
    // die je ziet, en die moet de streep ook krijgen.
    const kleur =
      clip.style.color === "#00000000" ? clip.style.stroke?.color ?? "#ffffff" : clip.style.color;
    deco.clear();
    // Positie op de lettergrootte en niet op de hoogte van het tekstvak: dat vak
    // groeit mee met een schaduw of een dikke omlijning, waardoor de streep
    // ergens onder de tekst in het niets belandde. Bij meerdere regels staat de
    // streep onder de laatste regel — Canva onderstreept elke regel apart, maar
    // dat kan Pixi's Text niet uitrekenen.
    if (underline) deco.rect(-b / 2, h / 2 - dik * 2.5, b, dik).fill(kleur);
    if (strike) deco.rect(-b / 2, -dik / 2, b, dik).fill(kleur);
    deco.x = text.x;
    deco.y = text.y;
    deco.rotation = text.rotation;
    deco.alpha = text.alpha;
    deco.visible = true;
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
    let display =
      clip.style.letters === "hoofdletters" ? clip.text.toUpperCase()
      : clip.style.letters === "kleine-letters" ? clip.text.toLowerCase()
      : clip.text;
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
        display = display.slice(0, Math.ceil(display.length * p));
        break;
      case "word-by-word": {
        const w = display.split(" ");
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
    if (r.bg) {
      r.bg.destroy();
      r.bg = undefined;
    }
    if (r.deco) {
      r.deco.destroy();
      r.deco = undefined;
    }
    if (r.masker) {
      if (r.sprite) r.sprite.mask = null;
      r.masker.destroy();
      r.masker = undefined;
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
