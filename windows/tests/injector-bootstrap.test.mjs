import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { earlyPayloadFor } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const source = await fs.readFile(injectorPath, "utf8");

function createFixture({ documentReady = true } = {}) {
  const observers = [];
  const timers = new Map();
  const listeners = new Map();
  let nextTimer = 1;
  const markers = { shell: false, sidebar: false };
  const document = {
    documentElement: documentReady ? {} : null,
    body: documentReady ? {} : null,
    querySelector(selector) {
      if (selector === "main.main-surface") return markers.shell ? {} : null;
      if (selector === "aside.app-shell-left-panel") return markers.sidebar ? {} : null;
      return null;
    },
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type, callback) {
      if (listeners.get(type) === callback) listeners.delete(type);
    },
  };
  const context = {
    window: { installs: [] },
    document,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.connected = true;
        observers.push(this);
      }
      observe() {}
      disconnect() { this.connected = false; }
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const fireDOMContentLoaded = () => {
    document.documentElement = {};
    document.body = {};
    listeners.get("DOMContentLoaded")?.();
  };
  return { context, markers, observers, fireDOMContentLoaded };
}

const guarded = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("guarded")', "guarded"), guarded.context);
assert.deepEqual(guarded.context.window.installs, [], "Auxiliary app targets must remain untouched.");
guarded.markers.shell = true;
guarded.observers[0].callback([]);
assert.deepEqual(guarded.context.window.installs, [], "A main surface without the Codex sidebar is not sufficient.");
guarded.markers.sidebar = true;
guarded.observers[0].callback([]);
assert.deepEqual(guarded.context.window.installs, ["guarded"], "The guarded payload should install once the shell is complete.");

const generations = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("old")', "old"), generations.context);
vm.runInNewContext(earlyPayloadFor('window.installs.push("new")', "new"), generations.context);
generations.markers.shell = true;
generations.markers.sidebar = true;
for (const observer of generations.observers) observer.callback([]);
assert.deepEqual(
  generations.context.window.installs,
  ["new"],
  "A stale early script must yield to the newest watcher generation.",
);
assert.equal(generations.context.window.__CODEX_DREAM_SKIN_EARLY_APPLIED__, "new");

const documentStart = createFixture({ documentReady: false });
vm.runInNewContext(earlyPayloadFor('window.installs.push("document-start")', "document-start"), documentStart.context);
assert.equal(documentStart.observers.length, 0, "Document-start injection must wait until a root exists.");
documentStart.fireDOMContentLoaded();
assert.equal(documentStart.observers.length, 1, "DOMContentLoaded must begin watching for the Codex shell.");
documentStart.markers.shell = true;
documentStart.markers.sidebar = true;
documentStart.observers[0].callback([]);
assert.deepEqual(
  documentStart.context.window.installs,
  ["document-start"],
  "The registered early payload must survive full document reload timing.",
);

const registrationStart = source.indexOf("earlyScriptId = await registerEarlyPayload");
const evaluateStart = source.indexOf("await session.evaluate(earlyPayloadFor", registrationStart);
const probeStart = source.indexOf("const probe = await waitForCodexProbe", registrationStart);
assert.ok(registrationStart >= 0 && evaluateStart > registrationStart && probeStart > evaluateStart,
  "New targets must register and run the early payload before full shell probing.");
assert.match(source, /if \(earlyInjectionFallback\) attachLoadFallback\(/,
  "Load-event reinjection must be attached only when early injection falls back.");
assert.match(source, /if \(!fallbackTargets\.get\(id\)\) return;/,
  "Fallback listeners must stay inert after a successful early registration.");
assert.match(source, /Page\.removeScriptToEvaluateOnNewDocument/,
  "Watcher shutdown and theme refresh must unregister persistent Page scripts.");

console.log("PASS: Windows early injection is shell-guarded, generation-safe, ordered before probing, and fallback-scoped.");
