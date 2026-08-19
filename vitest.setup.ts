// De editor-store is browsercode: hij houdt een afspeelklok bij met
// requestAnimationFrame. De logica eromheen (ops, geschiedenis, selectie) is
// gewoon in Node te testen, dus we zetten hier alleen de twee browserfuncties
// klaar in plaats van een hele DOM op te tuigen.
//
// Bewust géén echte klok: tests die met tijd werken gebruiken de nep-timers van
// vitest, en een tikkende rAF zou daar dwars doorheen lopen.

if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number) as typeof requestAnimationFrame;
}

if (typeof globalThis.cancelAnimationFrame !== "function") {
  globalThis.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id as unknown as ReturnType<typeof setTimeout>)) as typeof cancelAnimationFrame;
}
