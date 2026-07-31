// Guida la pagina vera con un .nira sintetico e una posa iniettata, per
// verificare che le mesh finiscano davvero a schermo nel posto giusto — cosa
// che le prove sull'algebra da sole non dicono.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import http from "node:http";
import { costruisci } from "./tools/prove/genera-nira.mjs";

const DIR = process.env.NIRSCOPE_DIR || process.cwd();
const TIPI = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript",
               ".task":"application/octet-stream", ".wasm":"application/wasm",
               ".json":"application/json", ".data":"application/octet-stream" };
const server = http.createServer((req, res) => {
  const p = req.url.split("?")[0] === "/" ? "/anatomia.html" : decodeURIComponent(req.url.split("?")[0]);
  let corpo;
  try { corpo = readFileSync(DIR + p); } catch { res.writeHead(404); return res.end("no"); }
  const est = p.slice(p.lastIndexOf("."));
  res.writeHead(200, { "content-type": (TIPI[est] || "application/octet-stream") + "; charset=utf-8" });
  res.end(corpo);
});
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/anatomia.html`;

let ok = 0, ko = 0;
const check = (n, c, e = "") => {
  if (c) { ok++; console.log(`  \x1b[32m✓\x1b[0m ${n}${e ? "  " + e : ""}`); }
  else { ko++; console.log(`  \x1b[31m✗\x1b[0m ${n}${e ? "  " + e : ""}`); }
};

const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const errori = [];
page.on("pageerror", e => errori.push(String(e)));
page.on("console", m => {
  const t = m.text(), u = m.location()?.url || "";
  if (m.type() === "error" && !/favicon/.test(u) &&
      !/WebGL|GroupMarker|Automatic fallback|SwiftShader/.test(t)) errori.push(t + " <" + u + ">");
});
page.on("requestfailed", r => errori.push("richiesta fallita: " + r.url()));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => !!window.__anatomia, null, { timeout: 30000 });

// Una posa in piedi con le braccia lungo i fianchi, nel sistema di MediaPipe:
// metri, origine fra le anche, y verso il basso, z profondita'.
const POSA = (() => {
  const p = new Array(33).fill(null).map(() => [0, 0, 0]);
  const set = (i, x, y, z) => { p[i] = [x, y, z]; };
  set(0,  0.00, -0.72, -0.06);          // naso
  set(11, 0.19, -0.48, 0); set(12, -0.19, -0.48, 0);       // spalle sx, dx
  set(13, 0.21, -0.18, 0); set(14, -0.21, -0.18, 0);       // gomiti
  set(15, 0.22,  0.10, 0); set(16, -0.22,  0.10, 0);       // polsi
  set(23, 0.09,  0.00, 0); set(24, -0.09,  0.00, 0);       // anche
  set(25, 0.095, 0.44, 0); set(26, -0.095, 0.44, 0);       // ginocchia
  set(27, 0.095, 0.87, 0); set(28, -0.095, 0.87, 0);       // caviglie
  set(29, 0.095, 0.92, 0.03); set(30, -0.095, 0.92, 0.03); // talloni
  set(31, 0.095, 0.90, -0.12); set(32, -0.095, 0.90, -0.12);
  return p;
})();

console.log("\n\x1b[1m1. La pagina carica le mesh\x1b[0m");
const { buf } = costruisci();
const esito = await page.evaluate(async (arr) => {
  const b = new Uint8Array(arr).buffer;
  return { caricato: window.__anatomia.caricaMesh(b),
           stato: document.getElementById("status").textContent };
}, Array.from(new Uint8Array(buf)));
check("caricamento riuscito", esito.caricato === true, esito.stato);
check("nessun errore di pagina", errori.length === 0, errori.slice(0, 2).join(" | "));

console.log("\n\x1b[1m2. Con una posa, le mesh compaiono al posto giusto\x1b[0m");
await page.evaluate((posa) => {
  window.__posaTest = posa;
  window.__anatomia.avviaSenzaCamera();
}, POSA);
await page.waitForTimeout(1500);
const s = await page.evaluate(() => window.__anatomia.statoMesh());
check("60 strutture agganciate", s?.strutture === 60, `${s?.strutture}`);
check("tutte e 60 visibili nei loro gruppi", s?.visibili === s?.gruppi,
      `${s?.visibili} di ${s?.gruppi} gruppi`);
check("nessun avviso", (s?.avvisi || []).length === 0, (s?.avvisi || []).join("; "));

// La posa e' alta 1,75 m: nella scena il modello va da circa -0,95 (piedi) a
// +0,75 (testa) attorno all'origine fra le anche.
const [mn, mx] = [s.ingombro.min, s.ingombro.max];
check("altezza complessiva fra 1,5 e 2 m", mx[1] - mn[1] > 1.5 && mx[1] - mn[1] < 2.0,
      `${(mx[1] - mn[1]).toFixed(2)} m`);
check("larghezza plausibile", mx[0] - mn[0] > 0.3 && mx[0] - mn[0] < 1.0,
      `${(mx[0] - mn[0]).toFixed(2)} m`);
check("spessore plausibile", mx[2] - mn[2] > 0.1 && mx[2] - mn[2] < 0.7,
      `${(mx[2] - mn[2]).toFixed(2)} m`);
check("il modello e' centrato sull'origine, non alla deriva",
      Math.abs(mx[0] + mn[0]) < 0.25 && Math.abs(mx[2] + mn[2]) < 0.4,
      `centro x ${((mx[0]+mn[0])/2).toFixed(2)}, z ${((mx[2]+mn[2])/2).toFixed(2)}`);

console.log("\n\x1b[1m3. Ogni pezzo dove ce lo si aspetta\x1b[0m");
const P = s.posizioni;
// Nella scena: y in alto, x verso la sinistra dello schermo negativo... la
// destra del soggetto ha x negativo perche' guarda l'obiettivo.
check("il cranio e' la struttura piu' in alto",
      Object.entries(P).filter(([,v]) => v).every(([n, v]) => n === "cranio" || v[1] <= P.cranio[1]),
      `cranio a ${P.cranio[1].toFixed(2)} m`);
check("le caviglie sono in basso: tibie sotto i femori",
      P.tibia_dx[1] < P.femore_dx[1] && P.tibia_sx[1] < P.femore_sx[1]);
check("gli omeri stanno sopra gli avambracci", P.omero_dx[1] > P.radio_dx[1]);
check("le strutture destre a destra del soggetto, le sinistre a sinistra",
      P.femore_dx[0] < 0 && P.femore_sx[0] > 0 && P.omero_dx[0] < 0 && P.omero_sx[0] > 0,
      `femore dx x=${P.femore_dx[0].toFixed(2)}, sx x=${P.femore_sx[0].toFixed(2)}`);
check("i femori sono distanti quanto le anche",
      Math.abs(P.femore_sx[0] - P.femore_dx[0]) > 0.1,
      `${Math.abs(P.femore_sx[0] - P.femore_dx[0]).toFixed(2)} m`);
check("la rotula davanti al femore", P.rotula_dx[2] > P.femore_dx[2]);
check("il gastrocnemio dietro la tibia", P.gastrocnemio_dx[2] < P.tibia_dx[2]);
check("il bicipite davanti al tricipite", P.bicipite_dx[2] > P.tricipite_dx[2]);

await page.screenshot({ path: "/tmp/anatomia-mesh.png" });
await page.evaluate(() => { window.__anatomia.orbita?.(0.9, 0.15); });
await page.waitForTimeout(250);
await page.screenshot({ path: "/tmp/anatomia-mesh-lato.png" });
await page.evaluate(() => { window.__anatomia.orbita?.(0, 0.05); });
await page.waitForTimeout(250);

console.log("\n\x1b[1m4. I cilindri si tolgono di mezzo\x1b[0m");
const c = await page.evaluate(() => window.__anatomia.conteggi());
check("nessun cilindro schematico resta visibile", c.meshVisibili === 0, `${c.meshVisibili}`);

console.log("\n\x1b[1m5. Le viste filtrano anche le mesh\x1b[0m");
for (const [vista, atteso] of [["ossa", 26], ["muscoli", 34], ["tutto", 60]]) {
  await page.click(`[data-v="${vista}"]`);
  await page.waitForTimeout(250);
  const st = await page.evaluate(() => window.__anatomia.statoMesh());
  const n = Object.values(st.posizioni).filter(Boolean).length;
  check(`vista "${vista}": ${atteso} strutture`, n === atteso, `${n}`);
}

console.log("\n\x1b[1m6. Il movimento muove le mesh\x1b[0m");
const prima = await page.evaluate(() => window.__anatomia.statoMesh().posizioni.tibia_dx);
await page.evaluate(() => {
  const p = window.__posaTest.map(v => v.slice());
  p[26] = [-0.10, 0.40, -0.22];       // ginocchio dx avanti e in alto
  p[28] = [-0.10, 0.84,  0.05];       // caviglia indietro: ginocchio flesso
  window.__posaTest = p;
});
await page.waitForTimeout(400);
const dopo = await page.evaluate(() => window.__anatomia.statoMesh().posizioni.tibia_dx);
const spost = Math.hypot(dopo[0]-prima[0], dopo[1]-prima[1], dopo[2]-prima[2]);
check("la tibia destra segue il ginocchio", spost > 0.05, `spostata di ${spost.toFixed(3)} m`);
const femSx = await page.evaluate(() => window.__anatomia.statoMesh().posizioni.tibia_sx);
check("la gamba sinistra resta ferma", Math.abs(femSx[1] - prima[1]) < 0.05);

console.log("\n\x1b[1m7. Con la posa che balla, le mesh stanno ferme\x1b[0m");
{
  // La prova sul filtro da sola dice che i punti si lisciano. Questa dice che
  // il tremolio non arriva alle mesh, che e' poi la cosa che si vede: in mezzo
  // ci sono lo scheletro dedotto e le matrici di posa, che un movimento
  // millimetrico all'anca lo amplificano al ginocchio.
  const misura = await page.evaluate(async (posa) => {
    const base = posa.map(p => p.slice());
    let seme = 12345;
    const caso = () => { seme = (seme * 1664525 + 1013904223) >>> 0; return seme / 4294967296 - 0.5; };
    const gen = () => base.map(p => [p[0] + caso() * 0.012,
                                     p[1] + caso() * 0.012,
                                     p[2] + caso() * 0.012]);
    const raccogli = async (rumoroso) => {
      // Il ciclo rilegge __posaTest a ogni fotogramma: con un getter il rumore
      // e' diverso ogni volta, come dalla fotocamera vera.
      Object.defineProperty(window, "__posaTest", {
        configurable: true, get: () => rumoroso ? gen() : base,
      });
      await new Promise(r => setTimeout(r, 900));            // assestamento
      const serie = [];
      for (let i = 0; i < 40; i++) {
        serie.push(window.__anatomia.statoMesh().posizioni.tibia_dx);
        await new Promise(r => requestAnimationFrame(r));
      }
      const m = [0, 1, 2].map(k => serie.reduce((s, v) => s + v[k], 0) / serie.length);
      const sq = serie.reduce((s, v) =>
        s + (v[0]-m[0])**2 + (v[1]-m[1])**2 + (v[2]-m[2])**2, 0) / serie.length;
      return Math.sqrt(sq) * 1000;                            // in millimetri
    };
    const fermo = await raccogli(false);
    const ballerino = await raccogli(true);
    Object.defineProperty(window, "__posaTest",
                          { configurable: true, value: base, writable: true });
    return { fermo, ballerino };
  }, POSA);
  check("a posa immobile la tibia non si muove affatto", misura.fermo < 0.5,
        `${misura.fermo.toFixed(2)} mm`);
  check("con 12 mm di rumore sui punti la tibia balla meno di 5 mm",
        misura.ballerino < 5, `${misura.ballerino.toFixed(1)} mm`);
}

console.log("\n\x1b[1m8. Un file rovinato non rompe la pagina\x1b[0m");
const rotto = await page.evaluate(() => {
  const b = new Uint8Array(64); b.set([78,73,82,65,78,65,84,49]); // magia giusta, resto no
  new DataView(b.buffer).setUint32(8, 5, true);
  const esito = window.__anatomia.caricaMesh(b.buffer);
  return { esito, stato: document.getElementById("status").textContent };
});
check("rifiutato con un messaggio, senza eccezioni", rotto.esito === false && /non si caricano/.test(rotto.stato),
      rotto.stato);
check("nessun errore di pagina in tutto il giro", errori.length === 0, errori.slice(0, 2).join(" | "));

await page.screenshot({ path: "/tmp/anatomia-schema.png" });   // dopo il ripiego
await browser.close(); server.close();
console.log(`\n\x1b[1m${ok} verifiche superate, ${ko} fallite\x1b[0m\n`);
process.exit(ko ? 1 : 0);
