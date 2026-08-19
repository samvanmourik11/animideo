import { describe, it, expect, vi } from "vitest";
import { EditorStore } from "./store";
import { checkInvariants, mainVideoTrack } from "./core/invariants";
import { createEmptyTimeline, type TimelineDoc, type VideoClip } from "./timeline";
import type { Op } from "./core/ops";

// De store is de schil om EditorCore heen. Wat hier getest wordt is niet het
// rekenwerk (dat zit in core/), maar of de UI-acties daadwerkelijk via de
// commandolaag lopen — en of een geweigerde bewerking het document met rust laat.

function v(id: string, start: number, duration: number): VideoClip {
  return { id, type: "video", src: `https://example.test/${id}.mp4`, start, duration };
}

function storeMetDrieClips(onOp?: (op: Op, summary: string) => void) {
  const doc = createEmptyTimeline("16:9");
  mainVideoTrack(doc)!.clips = [v("a", 0, 4), v("b", 4, 5), v("c", 9, 3)];
  return new EditorStore(doc, undefined, { onOp });
}

function videoClips(doc: TimelineDoc) {
  return mainVideoTrack(doc)!.clips;
}

describe("EditorStore via EditorCore", () => {
  it("sluit het gat als je een clip midden uit de video haalt", () => {
    const store = storeMetDrieClips();
    store.removeClip("b");
    const clips = videoClips(store.getState().doc);
    expect(clips.map((c) => [c.id, c.start])).toEqual([
      ["a", 0],
      ["c", 4],
    ]);
    expect(checkInvariants(store.getState().doc)).toEqual([]);
    store.destroy();
  });

  it("meldt elke toegepaste bewerking aan de op-sink", () => {
    const gezien: { op: Op; summary: string }[] = [];
    const store = storeMetDrieClips((op, summary) => gezien.push({ op, summary }));
    store.removeClip("b");
    store.splitClip("a", 2);
    expect(gezien.map((g) => g.op.op)).toEqual(["delete_clip", "split_clip"]);
    expect(gezien[0].summary).toMatch(/verwijderd/);
    store.destroy();
  });

  it("laat het document met rust als een bewerking niet kan", () => {
    const gezien: Op[] = [];
    const store = storeMetDrieClips((op) => gezien.push(op));
    const voor = store.getState().doc;

    store.splitClip("a", 0.01); // te dicht op de rand

    expect(store.getState().doc).toBe(voor); // exact hetzelfde object
    expect(gezien).toEqual([]); // niets in de geschiedenis
    expect(store.getState().lastOpError?.code).toBe("invalid");
    store.destroy();
  });

  it("selecteert na een knip de tweede helft", () => {
    const store = storeMetDrieClips();
    store.splitClip("b", 6);
    const geselecteerd = store.getState().selectedClipId;
    const clip = store.find(geselecteerd);
    expect(clip).not.toBeNull();
    expect(clip!.start).toBe(6);
    store.destroy();
  });

  it("zet een overgang op beide clips van een grens", () => {
    const store = storeMetDrieClips();
    store.setBoundaryTransition("a", "b", true);
    const [a, b] = videoClips(store.getState().doc);
    expect(a.transitionOut?.kind).toBe("fade");
    expect(b.transitionIn?.kind).toBe("fade");

    store.setBoundaryTransition("a", "b", false);
    const [a2, b2] = videoClips(store.getState().doc);
    expect(a2.transitionOut).toBeUndefined();
    expect(b2.transitionIn).toBeUndefined();
    store.destroy();
  });

  it("maakt van een sleepbeweging één op, niet honderd", () => {
    const gezien: Op[] = [];
    const store = storeMetDrieClips((op) => gezien.push(op));

    // Zoals de tijdlijn het doet: begin, dan tientallen tussenstanden, dan los.
    store.beginDrag("c");
    for (let x = 9; x >= 3; x -= 0.25) store.moveClip("c", x);
    store.commitDrag();

    expect(gezien).toHaveLength(1);
    expect(gezien[0].op).toBe("reorder_clip");
    // Losgelaten op 3s: voorbij het midden van a (2s), vóór dat van b (6,5s),
    // dus komt hij tussen a en b te liggen.
    expect(videoClips(store.getState().doc).map((c) => c.id)).toEqual(["a", "c", "b"]);
    expect(checkInvariants(store.getState().doc)).toEqual([]);
    store.destroy();
  });

  it("herkent trimmen aan de voorkant en aan de achterkant", () => {
    const heen: Op[] = [];
    const store = storeMetDrieClips((op) => heen.push(op));

    store.beginDrag("b");
    store.trimStart("b", 5); // linker handvat een seconde naar rechts
    store.commitDrag();

    store.beginDrag("a");
    store.trimEnd("a", 3); // rechter handvat een seconde naar links
    store.commitDrag();

    expect(heen.map((o) => o.op)).toEqual(["trim_clip", "trim_clip"]);
    expect(heen[0]).toMatchObject({ edge: "in", deltaSeconds: 1 });
    expect(heen[1]).toMatchObject({ edge: "out", deltaSeconds: 1 });
    store.destroy();
  });

  it("legt een klik zonder beweging niet vast", () => {
    const gezien: Op[] = [];
    const store = storeMetDrieClips((op) => gezien.push(op));
    store.beginDrag("a");
    store.commitDrag();
    expect(gezien).toEqual([]);
    store.destroy();
  });

  it("kan een verwijdering ongedaan maken", () => {
    vi.useFakeTimers();
    const store = storeMetDrieClips();
    store.removeClip("b");
    vi.advanceTimersByTime(600); // geschiedenis wordt per burst samengevoegd
    store.undo();
    expect(videoClips(store.getState().doc).map((c) => c.id)).toEqual(["a", "b", "c"]);
    store.destroy();
    vi.useRealTimers();
  });
});

// ── Beheer-acties uit het rechtermuisknopmenu ────────────────────────────────
//
// Dit zijn de handelingen die je bij een geselecteerd element verwacht. Ze gaan
// niet over montage maar over ordenen, en juist daar is een stille fout
// vervelend: je klikt "helemaal naar voren" en er lijkt niets te gebeuren.

function storeMetElementen() {
  const doc = createEmptyTimeline("16:9");
  mainVideoTrack(doc)!.clips = [v("scene", 0, 6)];
  doc.tracks.find((t) => t.kind === "overlay")!.clips = [
    { id: "e1", type: "image", src: "a.png", start: 0, duration: 6, transform: { x: 0.5, y: 0.5, scale: 0.3, rotation: 0 } },
    { id: "e2", type: "image", src: "b.png", start: 0, duration: 6 },
    { id: "e3", type: "image", src: "c.png", start: 0, duration: 6 },
  ];
  return new EditorStore(doc, undefined, {});
}

function overlayIds(doc: TimelineDoc) {
  return doc.tracks.find((t) => t.kind === "overlay")!.clips.map((c) => c.id);
}

describe("laagvolgorde", () => {
  it("zet een element helemaal vooraan of achteraan", () => {
    const store = storeMetElementen();
    store.zetLaag("e1", "vooraan");
    expect(overlayIds(store.getState().doc)).toEqual(["e2", "e3", "e1"]);
    store.zetLaag("e1", "achteraan");
    expect(overlayIds(store.getState().doc)).toEqual(["e1", "e2", "e3"]);
    store.destroy();
  });

  it("schuift één stap op en blijft aan de rand staan", () => {
    const store = storeMetElementen();
    store.zetLaag("e1", "voor");
    expect(overlayIds(store.getState().doc)).toEqual(["e2", "e1", "e3"]);
    store.zetLaag("e2", "achter");
    expect(overlayIds(store.getState().doc)).toEqual(["e2", "e1", "e3"]);
    store.destroy();
  });
});

describe("uitlijnen met het beeld", () => {
  it("zet het element tegen de rand, rekening houdend met zijn breedte", () => {
    const store = storeMetElementen();
    store.lijnUit("e1", "links", { halfW: 0.12, halfH: 0.2 });
    expect(store.find("e1")!.transform!.x).toBeCloseTo(0.12, 5);
    store.lijnUit("e1", "rechts", { halfW: 0.12, halfH: 0.2 });
    expect(store.find("e1")!.transform!.x).toBeCloseTo(0.88, 5);
    store.lijnUit("e1", "onder", { halfW: 0.12, halfH: 0.2 });
    expect(store.find("e1")!.transform!.y).toBeCloseTo(0.8, 5);
    store.destroy();
  });

  it("valt terug op de rand zelf als de maat onbekend is", () => {
    const store = storeMetElementen();
    store.lijnUit("e1", "links", null);
    expect(store.find("e1")!.transform!.x).toBe(0);
    store.destroy();
  });
});

describe("kopiëren en plakken", () => {
  it("dupliceert op dezelfde tijd, iets verschoven in beeld", () => {
    const store = storeMetElementen();
    const id = store.dupliceerOpZelfdePlek("e1")!;
    const origineel = store.find("e1")!;
    const kopie = store.find(id)!;
    expect(kopie.start).toBe(origineel.start);
    expect(kopie.duration).toBe(origineel.duration);
    expect(kopie.transform!.x).toBeCloseTo(origineel.transform!.x + 0.03, 5);
    expect(store.getState().selectedClipId).toBe(id);
    store.destroy();
  });

  it("plakt op de speelkop en niet op de oude plek", () => {
    const store = storeMetElementen();
    const bron = store.find("e1")!;
    store.seek(3);
    const id = store.plakClip(bron, store.spoorKindVan("e1")!)!;
    expect(store.find(id)!.start).toBeCloseTo(3, 5);
    expect(overlayIds(store.getState().doc)).toHaveLength(4);
    store.destroy();
  });

  it("geeft de kopie een eigen id", () => {
    const store = storeMetElementen();
    const id = store.plakClip(store.find("e1")!, "overlay")!;
    expect(id).not.toBe("e1");
    store.destroy();
  });
});

describe("vergrendelen", () => {
  it("zet de vlag om en weer terug", () => {
    const store = storeMetElementen();
    store.zetVergrendeld("e1", true);
    expect(store.find("e1")!.locked).toBe(true);
    store.zetVergrendeld("e1", false);
    expect(store.find("e1")!.locked).toBe(false);
    store.destroy();
  });
});
