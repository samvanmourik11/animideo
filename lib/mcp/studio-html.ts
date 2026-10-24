// Het Animideo-studioscherm in de Claude-app (MCP Apps, specificatie 2026-01-26). Eén HTML-
// pagina die Claude in het gesprek laat zien bij onze gereedschappen; wat hij toont hangt af
// van `structuredContent.weergave` in het resultaat:
//   stemmen   kaartjes met luisteren + kiezen
//   creators  portretten om te kiezen
//   galerij   beelden/video's (je werk of de stand van creaties), ververst zolang iets bezig is
//   prijs     wat een stap kost, met een Start-knop; daarna live de voortgang
// Praten met Claude gaat via postMessage (JSON-RPC): ui/initialize, dan ontvangen we
// ui/notifications/tool-result; kiezen stuurt een bericht (ui/message), Start roept het
// gereedschap zelf aan (tools/call). Gewoon JavaScript: het scherm laadt niets van buiten.

import { createHash } from "node:crypto";

export const STUDIO_HTML = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Animideo</title>
<style>
  /* De lichte uitstraling van de nieuwe app (Sam, 24-10-2026), ook als Claude donker staat. */
  :root { --bg:#ffffff; --vlak:#f5f7fb; --kaart:#ffffff; --kaart2:#ecf1f8; --rand:#dfe5ef; --tekst:#0f172a; --tekst2:#334155; --tekst3:#64748b; --blauw:#2563eb; --blauw2:#3b82f6; color-scheme: light; }
  * { box-sizing:border-box; }
  html { height:auto; }
  body { margin:0; padding:14px; font:14px/1.45 Inter, system-ui, -apple-system, sans-serif; background:var(--vlak); color:var(--tekst); border-radius:16px; }
  .kop { display:flex; align-items:center; gap:8px; margin-bottom:10px; font-weight:600; }
  .logo { font-weight:800; letter-spacing:-.02em; } .logo i { color:var(--blauw); font-style:normal; }
  .sub { color:var(--tekst2); font-size:12px; font-weight:400; }
  .raster { display:grid; gap:8px; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); }
  .kaart { background:var(--kaart); border:1px solid var(--rand); border-radius:16px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 1px 2px rgba(15,23,42,.05); }
  .kaart .in { padding:8px 10px; display:flex; flex-direction:column; gap:4px; flex:1; }
  .naam { font-weight:600; } .klein { font-size:12px; color:var(--tekst3); }
  .media { width:100%; aspect-ratio:1/1; object-fit:cover; background:#000; display:block; }
  .media.staand { aspect-ratio:3/4; }
  button { font:inherit; border:1px solid var(--rand); border-radius:12px; padding:7px 12px; cursor:pointer; background:var(--kaart2); color:var(--tekst); }
  button:hover:not(:disabled) { border-color:#c7d2e3; }
  button.blauw { background:linear-gradient(90deg, var(--blauw), var(--blauw2)); border-color:transparent; color:#fff; font-weight:600; box-shadow:0 0 14px rgba(59,130,246,.3); }
  button:disabled { opacity:.5; cursor:default; }
  .knoppen { display:flex; gap:6px; margin-top:auto; padding-top:4px; }
  .knoppen button { flex:1; }
  .prijs { background:var(--kaart); border:1px solid var(--rand); border-radius:16px; padding:16px; display:flex; flex-direction:column; gap:10px; box-shadow:0 1px 2px rgba(15,23,42,.05); }
  .post { display:flex; justify-content:space-between; gap:10px; padding:6px 0; border-bottom:1px solid var(--rand); font-size:13px; }
  .post:last-child { border-bottom:0; } .post b { white-space:nowrap; }
  .ok { color:#15803d; font-weight:600; }
  .scene { aspect-ratio:16/9; }
  .gesprek { display:flex; flex-direction:column; gap:6px; margin-bottom:10px; }
  .ballon { max-width:88%; padding:8px 12px; border-radius:14px; font-size:13.5px; white-space:pre-wrap; }
  .ballon.regisseur { background:var(--kaart); border:1px solid var(--rand); align-self:flex-start; }
  .ballon.jij { background:#dbeafe; color:#1e3a8a; align-self:flex-end; }
  .actie { font-size:12px; color:var(--tekst3); padding-left:4px; }
  .bijlage { max-height:120px; border-radius:12px; align-self:flex-end; border:1px solid var(--rand); }
  .pil { font-size:11px; padding:2px 8px; border-radius:999px; background:var(--kaart2); color:var(--tekst2); font-weight:500; }
  .pil.bezig { background:#dbeafe; color:#1d4ed8; }
  .vraagkaart { background:var(--kaart); border:1px solid var(--rand); border-radius:16px; padding:12px; display:flex; flex-direction:column; gap:10px; margin-bottom:10px; box-shadow:0 1px 2px rgba(15,23,42,.05); }
  .opties { display:grid; gap:6px; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); }
  .opties button { text-align:left; } .opties button small { display:block; color:var(--tekst3); font-size:11px; }
  .invoer { display:flex; gap:6px; margin-top:10px; }
  .invoer input { flex:1; padding:9px 12px; border-radius:12px; border:1px solid var(--rand); background:#fff; font:inherit; color:var(--tekst); }
  .denkt { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--tekst3); padding:4px; }
  .draai { width:14px; height:14px; border-radius:50%; border:2px solid #bfdbfe; border-top-color:var(--blauw); animation:rond .8s linear infinite; }
  @keyframes rond { to { transform:rotate(360deg); } }
  .resultaten { display:grid; gap:10px; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); }
  .resultaten.een { grid-template-columns:1fr; }
  .res { background:var(--kaart); border:1px solid var(--rand); border-radius:16px; overflow:hidden; box-shadow:0 1px 2px rgba(15,23,42,.05); }
  .res .vlak { position:relative; background:linear-gradient(135deg, #eef3fb, #e3ebf7); display:flex; align-items:center; justify-content:center; }
  .res .vlak img, .res .vlak video { width:100%; height:100%; object-fit:contain; display:block; background:#0f172a; }
  .res .vlak.bezig { background:linear-gradient(110deg, #eef3fb 30%, #dbe7f8 50%, #eef3fb 70%); background-size:200% 100%; animation:glans 1.4s linear infinite; }
  .res .label { position:absolute; top:10px; left:10px; display:flex; align-items:center; gap:6px; background:#fff; border:1px solid var(--rand); border-radius:999px; padding:4px 10px; font-size:12px; font-weight:600; color:var(--blauw); }
  .res .label.mis { color:#dc2626; }
  .res .onder { padding:10px 12px; display:flex; flex-direction:column; gap:6px; }
  .res .meta { display:flex; flex-wrap:wrap; gap:4px 10px; font-size:12px; font-weight:600; color:var(--tekst2); }
  .res .prompt { font-size:12.5px; color:var(--tekst3); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .res .knoppen { justify-content:flex-start; } .res .knoppen button { flex:0 0 auto; }
  .dag { font-size:12px; font-weight:600; color:var(--tekst2); margin:10px 0 4px; }
  .bedrag { font-size:22px; font-weight:800; } .bedrag span { font-size:13px; font-weight:500; color:var(--tekst2); }
  .laad { width:100%; aspect-ratio:1/1; display:flex; align-items:center; justify-content:center; background:linear-gradient(110deg, var(--kaart) 30%, var(--rand) 50%, var(--kaart) 70%); background-size:200% 100%; animation:glans 1.4s linear infinite; color:var(--tekst2); font-size:12px; }
  @keyframes glans { to { background-position:-200% 0; } }
  .mis { color:#dc2626; font-size:12px; }
  .lijst { display:flex; flex-direction:column; gap:8px; }
  .rij { display:flex; align-items:center; gap:10px; background:var(--kaart); border:1px solid var(--rand); border-radius:14px; padding:8px 10px; box-shadow:0 1px 2px rgba(15,23,42,.05); }
  .rij .wie { min-width:0; flex:0 0 32%; } .rij .wie .naam, .rij .wie .klein { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rij audio { flex:1; min-width:0; height:36px; }
  .rij button { flex:0 0 auto; }
  .zoek { width:100%; padding:7px 10px; border-radius:10px; border:1px solid var(--rand); background:var(--kaart); color:var(--tekst); margin-bottom:8px; font:inherit; }
</style>
</head>
<body>
<div id="app"><div class="klein">Animideo laden…</div></div>
<script>
(function () {
  var volgnummer = 0, wachtend = {}, huidig = null, peiling = null, speler = null;
  var app = document.getElementById("app");

  function stuur(bericht) { window.parent.postMessage(bericht, "*"); }
  function vraag(method, params) {
    var id = ++volgnummer;
    stuur({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    return new Promise(function (ok, nee) { wachtend[id] = { ok: ok, nee: nee }; });
  }
  function meld(method, params) { stuur({ jsonrpc: "2.0", method: method, params: params || {} }); }
  function zeg(tekst) { return vraag("ui/message", { role: "user", content: { type: "text", text: tekst } }); }
  function open(url) { return vraag("ui/open-link", { url: url }).catch(function () { window.open(url, "_blank"); }); }

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id !== undefined && wachtend[m.id] && !m.method) {
      var w = wachtend[m.id]; delete wachtend[m.id];
      if (m.error) w.nee(m.error); else w.ok(m.result);
      return;
    }
    if (m.method === "ui/notifications/tool-result") toon(m.params || {});
    if (m.method === "ui/notifications/host-context-changed" && m.params && m.params.theme) thema(m.params.theme);
  });

  function thema() { /* altijd licht: de uitstraling van de nieuwe app */ }
  function e(tag, attrs, kinderen) {
    var el = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "onclick") el.onclick = attrs[k];
      else if (k === "tekst") el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    (kinderen || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }
  function kop(titel, sub) {
    var logo = e("span", { class: "logo" }, [document.createTextNode("Animideo"), e("i", { tekst: "." })]);
    return e("div", { class: "kop" }, [logo, e("span", { tekst: titel }), sub ? e("span", { class: "sub", tekst: sub }) : null]);
  }
  // Grootte pas doorgeven na het opstarten (eerder negeert de Claude-app het), en alleen
  // als hij echt verandert; de hoogte is wat de inhoud nodig heeft.
  var klaarVoorMaat = false, laatsteMaat = "";
  function maat() {
    if (!klaarVoorMaat) return;
    requestAnimationFrame(function () {
      var w = window.innerWidth, h = Math.ceil(document.documentElement.getBoundingClientRect().height);
      var sleutel = w + "x" + h;
      if (sleutel === laatsteMaat) return;
      laatsteMaat = sleutel;
      meld("ui/notifications/size-changed", { width: w, height: h });
    });
  }
  var waarnemer = new ResizeObserver(maat);
  waarnemer.observe(document.documentElement);
  waarnemer.observe(document.body);

  function toon(resultaat) {
    var s = resultaat.structuredContent;
    if (!s || !s.weergave) { app.innerHTML = ""; return; }
    huidig = s;
    if (peiling) { clearTimeout(peiling); peiling = null; }
    app.innerHTML = "";
    var weergaven = { stemmen: stemmen, creators: creators, galerij: galerij, prijs: prijs, budget: budget, storyboard: storyboard, apps: apps, kalender: kalender, regisseur: regisseur };
    if (weergaven[s.weergave]) weergaven[s.weergave](s);
  }

  // ── Stemmen ──
  function stemmen(s) {
    var lijst = s.stemmen || [];
    var zoek = e("input", { class: "zoek", placeholder: "Zoek op naam, accent of typering…" });
    var raster = e("div", { class: "raster" });
    function vul() {
      var q = (zoek.value || "").toLowerCase();
      raster.innerHTML = "";
      lijst.filter(function (x) { return !q || (x.naam + " " + (x.typering || "") + " " + (x.accent || "")).toLowerCase().indexOf(q) >= 0; }).slice(0, 60).forEach(function (x) {
        var luister = e("button", { tekst: "▶ Luister", onclick: function () {
          if (speler) speler.pause();
          if (!x.voorbeeld) return;
          speler = new Audio(x.voorbeeld); speler.play();
        } });
        if (!x.voorbeeld) luister.disabled = true;
        raster.appendChild(e("div", { class: "kaart" }, [e("div", { class: "in" }, [
          e("div", { class: "naam", tekst: x.naam }),
          e("div", { class: "klein", tekst: [x.typering, x.accent].filter(Boolean).join(" · ") }),
          x.waarom ? e("div", { class: "klein", tekst: x.waarom }) : null,
          e("div", { class: "knoppen" }, [luister, e("button", { class: "blauw", tekst: "Kies", onclick: function () { zeg("Ik kies de stem " + x.naam + " (stem-id " + x.id + ")."); } })]),
        ])]));
      });
      maat();
    }
    zoek.oninput = vul;
    app.appendChild(kop("Stemmen", lijst.length + " stemmen"));
    if (lijst.length > 8) app.appendChild(zoek);
    app.appendChild(raster);
    vul();
  }

  // ── Creators ──
  function creators(s) {
    var raster = e("div", { class: "raster" });
    (s.creators || []).forEach(function (c) {
      raster.appendChild(e("div", { class: "kaart" }, [
        c.portret ? e("img", { class: "media staand", src: c.portret, alt: c.naam }) : null,
        e("div", { class: "in" }, [
          e("div", { class: "naam", tekst: c.naam }),
          c.omschrijving ? e("div", { class: "klein", tekst: c.omschrijving }) : null,
          e("div", { class: "knoppen" }, [e("button", { class: "blauw", tekst: "Kies", onclick: function () { zeg("Ik kies creator " + c.naam + " (creator-id " + c.id + ")."); } })]),
        ]),
      ]));
    });
    app.appendChild(kop("UGC-creators"));
    app.appendChild(raster);
  }

  // ── Galerij / stand (Higgsfield-stijl: groot resultaat, details, Download en Gebruik) ──
  var VERHOUDING = { "1:1": "1/1", "9:16": "9/16", "16:9": "16/9" };
  function resultaat(c, alleen) {
    var vorm = VERHOUDING[c.formaat] || (c.soort === "audio" ? null : "1/1");
    var stijl = vorm ? "aspect-ratio:" + vorm + ";" + (alleen && c.formaat === "9:16" ? "max-height:460px;margin:0 auto;" : "") : "height:72px;";
    var vlak = e("div", { class: "vlak" + (c.status === "bezig" ? " bezig" : ""), style: stijl });
    if (c.status === "klaar" && c.url) {
      if (c.soort === "video") vlak.appendChild(e("video", { src: c.url, controls: "", playsinline: "", preload: "metadata" }));
      else if (c.soort === "audio") vlak.appendChild(e("audio", { src: c.url, controls: "", style: "width:92%;background:transparent" }));
      else vlak.appendChild(e("img", { src: c.url, alt: c.prompt || "" }));
    } else if (c.status === "mislukt") {
      vlak.appendChild(e("span", { class: "label mis", tekst: "Mislukt" }));
    } else {
      vlak.appendChild(e("span", { class: "label" }, [e("span", { class: "draai" }), document.createTextNode("Bezig…")]));
    }
    var meta = [c.model, c.kwaliteit === "pro" ? "Pro" : c.kwaliteit === "standaard" ? "Standaard" : null, c.formaat].filter(Boolean);
    var knoppen = c.status === "klaar" && c.url ? [
      e("button", { class: "blauw", tekst: "⬇ Download", onclick: function () { open(c.url); } }),
      e("button", { tekst: "Gebruik", onclick: function () { zeg("Gebruik creatie " + c.id + " verder."); } }),
    ] : c.status === "mislukt" ? [e("button", { tekst: "Opnieuw", onclick: function () { zeg("Creatie " + c.id + " is mislukt (" + (c.fout || "onbekend") + "). Probeer het opnieuw."); } })] : [];
    return e("div", { class: "res" }, [vlak, e("div", { class: "onder" }, [
      meta.length ? e("div", { class: "meta", tekst: meta.join(" · ") }) : null,
      c.prompt ? e("div", { class: "prompt", tekst: c.prompt }) : null,
      c.fout ? e("div", { class: "mis", tekst: c.fout }) : null,
      knoppen.length ? e("div", { class: "knoppen" }, knoppen) : null,
    ])]);
  }
  function tegel(c) {
    var media;
    if (c.status === "klaar" && c.url && c.soort === "video") media = e("video", { class: "media", src: c.url, controls: "", playsinline: "", muted: "" });
    else if (c.status === "klaar" && c.url && c.soort === "audio") media = e("audio", { src: c.url, controls: "", style: "width:100%" });
    else if (c.status === "klaar" && c.url) media = e("img", { class: "media", src: c.url, alt: c.prompt || "" });
    else if (c.status === "mislukt") media = e("div", { class: "laad", style: "animation:none", tekst: "Mislukt" });
    else media = e("div", { class: "laad", tekst: "Wordt gemaakt…" });
    var knoppen = c.status === "klaar" ? [
      e("button", { tekst: "Open", onclick: function () { open(c.url); } }),
      e("button", { class: "blauw", tekst: "Gebruik deze", onclick: function () { zeg("Ga verder met creatie " + c.id + "."); } }),
    ] : c.status === "mislukt" ? [e("button", { tekst: "Opnieuw", onclick: function () { zeg("Creatie " + c.id + " is mislukt (" + (c.fout || "onbekend") + "). Probeer het opnieuw."); } })] : [];
    return e("div", { class: "kaart" }, [media, e("div", { class: "in" }, [
      c.prompt ? e("div", { class: "klein", tekst: c.prompt.slice(0, 90) }) : null,
      c.fout ? e("div", { class: "mis", tekst: c.fout }) : null,
      knoppen.length ? e("div", { class: "knoppen" }, knoppen) : null,
    ])]);
  }
  // Geluid als rijen (naam + brede speler), beeld en video als raster.
  function geluidRij(c) {
    var naam = (c.prompt || "").split(":")[0].replace(/^Voice-over door /i, "").slice(0, 40) || "Voice-over";
    var tekst = (c.prompt || "").indexOf(":") > 0 ? c.prompt.slice(c.prompt.indexOf(":") + 1).trim() : "";
    var speler = c.status === "klaar" && c.url ? e("audio", { src: c.url, controls: "", preload: "none" }) : e("div", { class: c.status === "mislukt" ? "mis" : "klein", style: "flex:1", tekst: c.status === "mislukt" ? (c.fout || "Mislukt") : "Wordt ingesproken…" });
    return e("div", { class: "rij" }, [
      e("div", { class: "wie" }, [e("div", { class: "naam", tekst: naam }), tekst ? e("div", { class: "klein", tekst: tekst }) : null]),
      speler,
      c.status === "klaar" ? e("button", { class: "blauw", tekst: "Kies", onclick: function () { zeg("Ik kies de voice-over van " + naam + " (creatie " + c.id + ")."); } }) : null,
    ]);
  }
  function galerij(s) {
    var items = s.items || [];
    var bezig = items.filter(function (x) { return x.status === "bezig"; }).length;
    var titel = (s.titel || "Resultaten").replace(/:.*/, "");
    app.appendChild(kop(titel, bezig ? bezig + " bezig" : items.length === 1 ? "1 stuk" : items.length + " stuks"));
    var geluid = items.length && items.every(function (x) { return x.soort === "audio" || (x.status === "bezig" && /voice|stem/i.test(s.titel || "")); });
    if (geluid) {
      var lijst = e("div", { class: "lijst" });
      items.forEach(function (c) { lijst.appendChild(geluidRij(c)); });
      app.appendChild(lijst);
    } else {
      var raster = e("div", { class: "resultaten" + (items.length === 1 ? " een" : "") });
      items.forEach(function (c) { raster.appendChild(resultaat(c, items.length === 1)); });
      app.appendChild(raster);
    }
    if (bezig) volg(items.map(function (x) { return x.id; }), s.titel);
  }
  // Zolang er iets bezig is: elke 5 s de stand opvragen (via Claude naar onze server).
  function volg(ids, titel) {
    peiling = setTimeout(function () {
      vraag("tools/call", { name: "status", arguments: { creatie_ids: ids } }).then(function (r) {
        if (r && r.structuredContent) { r.structuredContent.titel = titel; toon(r); }
        var klaar = r && r.structuredContent && (r.structuredContent.items || []).every(function (x) { return x.status !== "bezig"; });
        if (klaar) vraag("ui/update-model-context", { content: [{ type: "text", text: "De creaties " + ids.join(", ") + " zijn klaar; de gebruiker ziet ze in het Animideo-scherm." }] }).catch(function () {});
      }).catch(function () { volg(ids, titel); });
    }, 5000);
  }

  // ── Prijs + Start ──
  function prijs(s) {
    var start = e("button", { class: "blauw", tekst: "▶ Start · " + s.credits + " " + (s.credits === 1 ? "credit" : "credits") });
    var niet = e("button", { tekst: "Niet doen", onclick: function () { zeg("Niet doen."); start.disabled = true; niet.disabled = true; } });
    var meldingEl = e("div", { class: "klein" });
    start.onclick = function () {
      start.disabled = true; niet.disabled = true; start.textContent = "Even…";
      var args = Object.assign({}, s.arguments || {}, { akkoord_credits: s.credits });
      vraag("tools/call", { name: s.tool, arguments: args }).then(function (r) {
        var g = r && r.structuredContent;
        if (!g || !g.creatie_id) { meldingEl.textContent = (r && r.content && r.content[0] && r.content[0].text) || "Starten lukte niet."; meldingEl.className = "mis"; start.textContent = "Mislukt"; return; }
        vraag("ui/update-model-context", { content: [{ type: "text", text: "De gebruiker klikte Start in het Animideo-scherm: " + s.omschrijving + " → creatie " + g.creatie_id + " (" + s.credits + " credits). Gebruik status om het resultaat te zien; niet nog eens starten." }] }).catch(function () {});
        toon({ structuredContent: { weergave: "galerij", titel: s.omschrijving, items: [{ id: g.creatie_id, status: "bezig" }] } });
      }).catch(function (f) { meldingEl.textContent = (f && f.message) || "Starten lukte niet."; meldingEl.className = "mis"; start.textContent = "Mislukt"; });
    };
    app.appendChild(kop("Klaar om te maken"));
    app.appendChild(e("div", { class: "prijs" }, [
      e("div", { class: "naam", tekst: s.omschrijving }),
      e("div", { class: "bedrag" }, [document.createTextNode(s.credits + " "), e("span", { tekst: s.credits === 1 ? "credit" : "credits" })]),
      s.saldo !== undefined ? e("div", { class: "klein", tekst: "Je saldo: " + s.saldo + " credits" }) : null,
      e("div", { class: "knoppen" }, [niet, start]),
      meldingEl,
    ]));
  }

  // ── Budget voor het hele project: één keer akkoord ──
  function budget(s) {
    var akkoord = e("button", { class: "blauw", tekst: "✓ Akkoord · " + s.totaal + " credits" });
    var anders = e("button", { tekst: "Aanpassen", onclick: function () { zeg("Ik wil het plan of het budget aanpassen."); } });
    var regel = e("div", { class: "klein" });
    akkoord.onclick = function () {
      akkoord.disabled = true; anders.disabled = true; akkoord.textContent = "Even…";
      vraag("tools/call", { name: "keur_budget_goed", arguments: { budget_id: s.budget_id } }).then(function () {
        akkoord.textContent = "✓ Akkoord gegeven"; regel.className = "ok"; regel.textContent = "Claude gaat aan de slag; je hoeft niets meer per stap goed te keuren.";
        vraag("ui/update-model-context", { content: [{ type: "text", text: "De gebruiker gaf akkoord op budget " + s.budget_id + " (" + s.totaal + " credits). Ga verder met het project en geef bij elke betaalde stap budget_id " + s.budget_id + " mee." }] }).catch(function () {});
        zeg("Akkoord, ga je gang.").catch(function () {});
      }).catch(function () { akkoord.disabled = false; anders.disabled = false; akkoord.textContent = "✓ Akkoord · " + s.totaal + " credits"; regel.className = "mis"; regel.textContent = "Akkoord geven lukte niet; zeg het anders in de chat."; });
    };
    app.appendChild(kop("Plan en budget"));
    app.appendChild(e("div", { class: "prijs" }, [
      e("div", { class: "naam", tekst: s.omschrijving }),
      e("div", {}, (s.posten || []).map(function (p) { return e("div", { class: "post" }, [e("span", { tekst: p.wat }), e("b", { tekst: p.credits + " cr" })]); })),
      e("div", { class: "bedrag" }, [document.createTextNode(s.totaal + " "), e("span", { tekst: "credits in totaal" })]),
      s.saldo !== undefined ? e("div", { class: "klein", tekst: "Je saldo: " + s.saldo + " credits · daarna vraagt Claude niet meer per stap" }) : null,
      e("div", { class: "knoppen" }, [anders, akkoord]),
      regel,
    ]));
  }

  // ── Storyboard ter goedkeuring ──
  function storyboard(s) {
    var raster = e("div", { class: "raster", style: "grid-template-columns:repeat(auto-fill, minmax(200px, 1fr))" });
    (s.scenes || []).forEach(function (sc, i) {
      raster.appendChild(e("div", { class: "kaart" }, [
        sc.url ? e("img", { class: "media scene", src: sc.url, alt: "Scène " + (i + 1) }) : e("div", { class: "laad scene", tekst: "Wordt geschetst…" }),
        e("div", { class: "in" }, [e("div", { class: "klein" }, [e("b", { tekst: (i + 1) + ". " }), document.createTextNode(sc.tekst || "")])]),
      ]));
    });
    var goed = e("button", { class: "blauw", tekst: "✓ Goedkeuren", onclick: function () { goed.disabled = true; zeg("Storyboard goedgekeurd, ga verder."); } });
    var anders = e("button", { tekst: "✏️ Aanpassen", onclick: function () { zeg("Ik wil iets aanpassen aan het storyboard: "); } });
    app.appendChild(kop("Storyboard", (s.scenes || []).length + " scènes"));
    app.appendChild(raster);
    app.appendChild(e("div", { class: "knoppen", style: "margin-top:10px" }, [anders, goed]));
  }

  // ── Apps en effecten ──
  function apps(s) {
    var lijst = s.apps || [];
    var zoek = e("input", { class: "zoek", placeholder: "Zoek een app of effect…" });
    var raster = e("div", { class: "raster" });
    function vul() {
      var q = (zoek.value || "").toLowerCase();
      raster.innerHTML = "";
      lijst.filter(function (a) { return !q || (a.naam + " " + a.uitleg).toLowerCase().indexOf(q) >= 0; }).slice(0, 60).forEach(function (a) {
        var media = a.voorbeeld
          ? (a.voorbeeldSoort === "video" ? e("video", { class: "media", src: a.voorbeeld, muted: "", loop: "", autoplay: "", playsinline: "" }) : e("img", { class: "media", src: a.voorbeeld, alt: a.naam }))
          : e("div", { class: "laad", style: "animation:none;font-size:32px", tekst: a.icoon });
        raster.appendChild(e("div", { class: "kaart" }, [media, e("div", { class: "in" }, [
          e("div", { class: "naam", tekst: a.icoon + " " + a.naam }),
          e("div", { class: "klein", tekst: a.uitleg }),
          e("div", { class: "knoppen" }, [e("button", { class: "blauw", tekst: "Gebruik · " + a.credits + " cr", onclick: function () { zeg("Ik wil de app " + a.naam + " gebruiken (app-id " + a.id + ")." + (a.foto ? " Vraag me om: " + a.foto.toLowerCase() + "." : "")); } })]),
        ])]));
      });
      maat();
    }
    zoek.oninput = vul;
    app.appendChild(kop("Apps & effecten", lijst.length + " stuks"));
    app.appendChild(zoek);
    app.appendChild(raster);
    vul();
  }

  // ── Contentkalender ──
  function kalender(s) {
    app.appendChild(kop(s.titel || "Contentkalender", (s.posts || []).length + " posts"));
    var vorige = "";
    var doos = e("div", { class: "prijs" });
    (s.posts || []).forEach(function (p) {
      var d = new Date(p.gepland_op);
      var dag = d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
      if (dag !== vorige) { doos.appendChild(e("div", { class: "dag", tekst: dag })); vorige = dag; }
      doos.appendChild(e("div", { class: "post" }, [
        e("span", { tekst: d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) + " · " + p.idee }),
        e("b", { tekst: (p.platforms || []).join(" + ") + (p.soort === "video" ? " · video" : "") }),
      ]));
    });
    doos.appendChild(e("div", { class: "knoppen" }, [e("button", { class: "blauw", tekst: "Open en keur in Animideo", onclick: function () { open(s.link); } })]));
    app.appendChild(doos);
  }

  // ── De Regisseur zelf: gesprek, vraag, bevestiging, resultaten ──
  // **vet** en [tekst](link) zoals in de app, zonder HTML van buiten in te voegen.
  function opgemaakt(tekst) {
    var doos = document.createDocumentFragment();
    String(tekst || "").split(/(\\*\\*[^*]+\\*\\*|\\[[^\\]]+\\]\\(https?:\\/\\/[^)\\s]+\\))/g).forEach(function (deel) {
      var vet = deel.match(/^\\*\\*([^*]+)\\*\\*$/), link = deel.match(/^\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+)\\)$/);
      if (vet) doos.appendChild(e("b", { tekst: vet[1] }));
      else if (link) doos.appendChild(e("a", { href: "#", tekst: link[1], onclick: function (ev) { ev.preventDefault(); open(link[2]); } }));
      else doos.appendChild(document.createTextNode(deel.replace(/(^|\\s)\\*([^*\\n]+)\\*/g, "$1$2")));
    });
    return doos;
  }
  var STATUS = { denkt: "denkt na…", wacht_op_antwoord: "wacht op jou", wacht_op_bevestiging: "wacht op akkoord", wacht_op_maken: "aan het maken…", klaar: "klaar", fout: "mislukt" };
  function regieActie(args) {
    return vraag("tools/call", { name: "regisseur_antwoord", arguments: Object.assign({ project_id: huidig.project_id }, args) }).then(function (r) { if (r && r.structuredContent) toon(r); else volgRegie(); });
  }
  function volgRegie(direct) {
    if (peiling) clearTimeout(peiling);
    peiling = setTimeout(function () {
      vraag("tools/call", { name: "regisseur_stand", arguments: { project_id: huidig.project_id } }).then(function (r) {
        var oud = huidig && huidig.status;
        if (r && r.structuredContent) toon(r);
        // Claude op de hoogte houden als de Regisseur iets van de gebruiker wil of klaar is.
        if (huidig && oud !== huidig.status && huidig.status !== "denkt" && huidig.status !== "wacht_op_maken") {
          var tekst = r.content && r.content[0] && r.content[0].text;
          if (tekst) vraag("ui/update-model-context", { content: [{ type: "text", text: tekst }] }).catch(function () {});
        }
      }).catch(function () { volgRegie(); });
    }, direct ? 400 : 3000);
  }
  function regisseur(s) {
    var pilKlasse = s.status === "denkt" || s.status === "wacht_op_maken" ? "pil bezig" : "pil";
    var kopje = kop("Regisseur", "");
    kopje.appendChild(e("span", { class: pilKlasse, tekst: STATUS[s.status] || s.status }));
    app.appendChild(kopje);

    var gesprek = e("div", { class: "gesprek" });
    (s.regels || []).forEach(function (r) {
      if (r.wie === "actie") gesprek.appendChild(e("div", { class: "actie", tekst: r.tekst }));
      else if (r.wie === "bijlage") gesprek.appendChild(r.url ? (r.video ? e("video", { class: "bijlage", src: r.url, controls: "" }) : e("img", { class: "bijlage", src: r.url })) : e("div", { class: "actie", tekst: r.tekst }));
      else { var b = e("div", { class: "ballon " + r.wie }); b.appendChild(opgemaakt(r.tekst)); gesprek.appendChild(b); }
    });
    if (s.status === "denkt") gesprek.appendChild(e("div", { class: "denkt" }, [e("span", { class: "draai" }), e("span", { tekst: "De Regisseur denkt na…" })]));
    if (s.status === "fout") gesprek.appendChild(e("div", { class: "mis", tekst: s.foutmelding || "Er ging iets mis." }));
    app.appendChild(gesprek);

    // Een vraag met keuzes (stemmen, creators, versies, storyboard, scène, tekst).
    if (s.vraag) {
      var v = s.vraag, kaart = e("div", { class: "vraagkaart" }, [e("div", { class: "naam", tekst: v.vraag })]);
      var opties = (v.opties || []).map(function (o) { return typeof o === "string" ? { label: o, waarde: o } : o; });
      var kies = function (o) { kaart.querySelectorAll("button").forEach(function (x) { x.disabled = true; }); regieActie({ actie: "antwoord", tekst: o.label, waarde: o.waarde }); };
      var sb = opties.find(function (o) { return o.storyboard; }), vid = opties.find(function (o) { return o.video; });
      if (sb) {
        var raster = e("div", { class: "raster", style: "grid-template-columns:repeat(auto-fill, minmax(170px, 1fr))" });
        sb.storyboard.forEach(function (sc, i) { raster.appendChild(e("div", { class: "kaart" }, [e("img", { class: "media scene", src: sc.url }), e("div", { class: "in" }, [e("div", { class: "klein" }, [e("b", { tekst: (i + 1) + ". " }), document.createTextNode(sc.tekst || "")])])])); });
        kaart.appendChild(raster);
      }
      if (vid) kaart.appendChild(e("video", { class: "media", style: "aspect-ratio:auto;max-height:340px", src: vid.video, controls: "", playsinline: "" }));
      if (opties.some(function (o) { return o.beeld; })) {
        var tegels = e("div", { class: "raster" });
        opties.forEach(function (o) { tegels.appendChild(e("div", { class: "kaart" }, [e("img", { class: "media staand", src: o.beeld, alt: o.label }), e("div", { class: "in" }, [e("div", { class: "naam", tekst: o.label }), o.uitleg ? e("div", { class: "klein", tekst: o.uitleg }) : null, e("div", { class: "knoppen" }, [e("button", { class: "blauw", tekst: "Kies", onclick: function () { kies(o); } })])])])); });
        kaart.appendChild(tegels);
      } else if (opties.some(function (o) { return o.geluid; })) {
        var lijst = e("div", { class: "lijst" });
        opties.forEach(function (o) {
          lijst.appendChild(e("div", { class: "rij" }, [
            e("div", { class: "wie", style: "flex:1" }, [e("div", { class: "naam", tekst: o.label }), o.uitleg ? e("div", { class: "klein", style: "white-space:normal", tekst: o.uitleg }) : null]),
            o.geluid ? e("button", { tekst: "▶ Luister", onclick: function () { if (speler) speler.pause(); speler = new Audio(o.geluid); speler.play(); } }) : null,
            e("button", { class: "blauw", tekst: "Kies", onclick: function () { kies(o); } }),
          ]));
        });
        kaart.appendChild(lijst);
      } else {
        var knoppen = e("div", { class: "opties" });
        opties.forEach(function (o) { var k = e("button", { class: o.storyboard || o.video ? (/goed/i.test(o.label) ? "blauw" : "") : "", onclick: function () { kies(o); } }); k.appendChild(document.createTextNode(o.label)); if (o.uitleg) k.appendChild(e("small", { tekst: o.uitleg })); knoppen.appendChild(k); });
        kaart.appendChild(knoppen);
      }
      app.appendChild(kaart);
    }

    // De bevestiging: wat er gemaakt wordt en wat het kost, één keer Start.
    if (s.bevestiging) {
      var bv = s.bevestiging, start = e("button", { class: "blauw", tekst: "▶ Start · " + bv.totaal + " credits" }), niet = e("button", { tekst: "Niet doen" });
      var auto = e("input", { type: "checkbox" }); if (s.automatisch) auto.checked = true;
      auto.onchange = function () { regieActie({ actie: "automatisch", ja: auto.checked }); };
      start.onclick = function () { start.disabled = true; niet.disabled = true; start.textContent = "Gestart…"; regieActie({ actie: "bevestig", ja: true }); };
      niet.onclick = function () { start.disabled = true; niet.disabled = true; regieActie({ actie: "bevestig", ja: false }); };
      var stappen = e("div", {});
      (bv.stappen || []).forEach(function (st) {
        stappen.appendChild(e("div", { class: "post" }, [e("span", { tekst: st.omschrijving }), e("b", { tekst: st.credits + " cr" })]));
        if (st.details && st.details.beelden && st.details.beelden.length) {
          var r = e("div", { style: "display:flex;gap:6px;margin:4px 0" });
          st.details.beelden.slice(0, 4).forEach(function (u) { r.appendChild(e("img", { src: u, style: "height:56px;border-radius:8px;border:1px solid var(--rand)" })); });
          stappen.appendChild(r);
        }
      });
      app.appendChild(e("div", { class: "prijs", style: "margin-bottom:10px" }, [
        e("div", { class: "naam", tekst: "De Regisseur wil dit maken" }), stappen,
        e("div", { class: "knoppen" }, [niet, start]),
        e("label", { class: "klein", style: "display:flex;gap:6px;align-items:center" }, [auto, document.createTextNode("Voortaan automatisch in dit project (niet meer per stap vragen)")]),
      ]));
    }

    // Wat er gemaakt is (of nog gemaakt wordt).
    if ((s.galerij || []).length) {
      var g = e("div", { class: "raster" });
      s.galerij.forEach(function (c) { g.appendChild(tegel(c)); });
      app.appendChild(e("div", { class: "dag", tekst: "In dit project" }));
      app.appendChild(g);
    }

    // Zelf iets zeggen tegen de Regisseur, zonder via Claude.
    var veld = e("input", { placeholder: s.vraag ? "Of typ je eigen antwoord…" : "Stuur de Regisseur een bericht…" });
    var stuur = e("button", { class: "blauw", tekst: "Stuur" });
    var verstuur = function () {
      var t = veld.value.trim(); if (!t) return;
      veld.disabled = true; stuur.disabled = true;
      var p = s.vraag ? regieActie({ actie: "antwoord", tekst: t }) : vraag("tools/call", { name: "regisseur", arguments: { bericht: t, project_id: s.project_id } }).then(function (r) { if (r && r.structuredContent) toon(r); });
      p.catch(function () { veld.disabled = false; stuur.disabled = false; });
    };
    stuur.onclick = verstuur; veld.onkeydown = function (ev) { if (ev.key === "Enter") verstuur(); };
    if (s.status !== "denkt" && s.status !== "wacht_op_maken") app.appendChild(e("div", { class: "invoer" }, [veld, stuur]));

    if (s.status === "denkt" || s.status === "wacht_op_maken") volgRegie();
    else if ((s.galerij || []).some(function (c) { return c.status === "bezig"; })) volgRegie();
  }

  // Precies zoals de officiële App-klasse (ext-apps): appInfo, geen clientInfo. Met een ander
  // veld keurt de Claude-app het af en blijft het scherm verborgen (24-10-2026).
  vraag("ui/initialize", { appCapabilities: {}, appInfo: { name: "Animideo", version: "1.0.0" }, protocolVersion: "2026-01-26" })
    .then(function (r) {
      var ctx = (r && r.hostContext) || {};
      thema(ctx.theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
      meld("ui/notifications/initialized", {});
      klaarVoorMaat = true;
      if (!huidig) app.innerHTML = '<div class="klein">Animideo is klaar.</div>';
      maat();
    })
    .catch(function () { app.innerHTML = '<div class="klein">Animideo kon niet starten in dit programma.</div>'; });
})();
</script>
</body>
</html>`;

// Het adres krijgt een vingerafdruk van de inhoud: de Claude-app bewaart een scherm onder
// zijn adres en haalde na een wijziging de oude versie uit zijn geheugen (24-10-2026).
export const STUDIO_URI = `ui://animideo/studio-${createHash("sha256").update(STUDIO_HTML).digest("hex").slice(0, 10)}`;
