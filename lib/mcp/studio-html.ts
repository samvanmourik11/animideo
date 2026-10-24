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

export const STUDIO_URI = "ui://animideo/studio";

export const STUDIO_HTML = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Animideo</title>
<style>
  :root { --bg:#ffffff; --kaart:#f4f6fb; --rand:#e2e7f0; --tekst:#0f172a; --tekst2:#475569; --blauw:#1c72ed; --blauw2:#5a9df8; }
  :root[data-thema="dark"] { --bg:#0b1230; --kaart:#121b3f; --rand:#22305e; --tekst:#eef2ff; --tekst2:#a5b0d0; }
  * { box-sizing:border-box; }
  html { height:auto; }
  body { margin:0; padding:12px; font:14px/1.45 Inter, system-ui, -apple-system, sans-serif; background:var(--bg); color:var(--tekst); }
  .kop { display:flex; align-items:center; gap:8px; margin-bottom:10px; font-weight:600; }
  .logo { font-weight:800; letter-spacing:-.02em; } .logo b { color:var(--blauw); }
  .sub { color:var(--tekst2); font-size:12px; font-weight:400; }
  .raster { display:grid; gap:8px; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); }
  .kaart { background:var(--kaart); border:1px solid var(--rand); border-radius:14px; overflow:hidden; display:flex; flex-direction:column; }
  .kaart .in { padding:8px 10px; display:flex; flex-direction:column; gap:4px; flex:1; }
  .naam { font-weight:600; } .klein { font-size:12px; color:var(--tekst2); }
  .media { width:100%; aspect-ratio:1/1; object-fit:cover; background:#000; display:block; }
  .media.staand { aspect-ratio:3/4; }
  button { font:inherit; border:0; border-radius:10px; padding:7px 10px; cursor:pointer; background:var(--rand); color:var(--tekst); }
  button.blauw { background:var(--blauw); color:#fff; font-weight:600; }
  button:disabled { opacity:.5; cursor:default; }
  .knoppen { display:flex; gap:6px; margin-top:auto; padding-top:4px; }
  .knoppen button { flex:1; }
  .prijs { background:var(--kaart); border:1px solid var(--rand); border-radius:16px; padding:14px; display:flex; flex-direction:column; gap:10px; }
  .bedrag { font-size:22px; font-weight:800; } .bedrag span { font-size:13px; font-weight:500; color:var(--tekst2); }
  .laad { width:100%; aspect-ratio:1/1; display:flex; align-items:center; justify-content:center; background:linear-gradient(110deg, var(--kaart) 30%, var(--rand) 50%, var(--kaart) 70%); background-size:200% 100%; animation:glans 1.4s linear infinite; color:var(--tekst2); font-size:12px; }
  @keyframes glans { to { background-position:-200% 0; } }
  .mis { color:#dc2626; font-size:12px; }
  .lijst { display:flex; flex-direction:column; gap:8px; }
  .rij { display:flex; align-items:center; gap:10px; background:var(--kaart); border:1px solid var(--rand); border-radius:14px; padding:8px 10px; }
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

  function thema(t) { document.documentElement.setAttribute("data-thema", t === "dark" ? "dark" : "light"); }
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
    return e("div", { class: "kop" }, [e("span", { class: "logo", tekst: "Animideo" }), e("span", { tekst: "· " + titel }), sub ? e("span", { class: "sub", tekst: sub }) : null]);
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
    ({ stemmen: stemmen, creators: creators, galerij: galerij, prijs: prijs })[s.weergave] && ({ stemmen: stemmen, creators: creators, galerij: galerij, prijs: prijs })[s.weergave](s);
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

  // ── Galerij / stand ──
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
      var raster = e("div", { class: "raster" });
      items.forEach(function (c) { raster.appendChild(tegel(c)); });
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
