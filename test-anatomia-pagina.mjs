// Guida la pagina vera con un .nira sintetico e una posa iniettata, per
// verificare che le mesh finiscano davvero a schermo nel posto giusto — cosa
// che le prove sull'algebra da sole non dicono.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import http from "node:http";
import zlib from "node:zlib";
import { costruisci } from "./tools/prove/genera-nira.mjs";

/** Decodifica un PNG a 8 bit non interlacciato: quello che produce il browser.
 *  Serve perche' confrontare i byte compressi non dice niente — due immagini
 *  identiche danno lo stesso stream, ma due quasi identiche danno stream del
 *  tutto diversi, e la percentuale che ne uscirebbe sarebbe un numero senza
 *  significato. */
function leggiPng(buf) {
  let larg = 0, alt = 0, canali = 0, i = 8;
  const dati = [];
  while (i < buf.length) {
    const n = buf.readUInt32BE(i), tipo = buf.toString("ascii", i + 4, i + 8);
    const corpo = buf.subarray(i + 8, i + 8 + n);
    if (tipo === "IHDR") {
      larg = corpo.readUInt32BE(0); alt = corpo.readUInt32BE(4);
      if (corpo[8] !== 8) throw new Error("PNG non a 8 bit");
      if (corpo[12] !== 0) throw new Error("PNG interlacciato");
      canali = { 0: 1, 2: 3, 4: 2, 6: 4 }[corpo[9]];
      if (!canali) throw new Error("PNG con tavolozza");
    } else if (tipo === "IDAT") dati.push(corpo);
    else if (tipo === "IEND") break;
    i += 12 + n;
  }
  const grezzo = zlib.inflateSync(Buffer.concat(dati));
  const riga = larg * canali, out = Buffer.alloc(alt * riga);
  for (let y = 0; y < alt; y++) {
    const f = grezzo[y * (riga + 1)];
    const src = grezzo.subarray(y * (riga + 1) + 1, y * (riga + 1) + 1 + riga);
    for (let x = 0; x < riga; x++) {
      const a = x >= canali ? out[y * riga + x - canali] : 0;
      const b = y > 0 ? out[(y - 1) * riga + x] : 0;
      const c = (x >= canali && y > 0) ? out[(y - 1) * riga + x - canali] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      out[y * riga + x] = v & 255;
    }
  }
  return { larg, alt, canali, dati: out };
}

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

console.log("\n\x1b[1m7b. Nessun segmento resta senza le sue ancore vive\x1b[0m");
{
  // Il bug che questa prova impedisce: i segmenti mano e piede usano i
  // landmark 19, 20, 31 e 32, ma l'elenco di quelli passati alle mesh era
  // scritto a mano e si era fermato al 28. Mani e piedi non avevano l'ancora
  // distale e restavano invisibili — sul modello vero erano 193 strutture su
  // 629, quasi un terzo, e nessuna prova se ne accorgeva perche' il modello
  // sintetico non ha ne' mani ne' piedi.
  const mancanti = await page.evaluate(() => {
    const usati = new Set(window.__anatomia.landmarkUsati());
    const serve = new Set();
    for (const s of Object.values(window.__anatomia.segmenti()))
      for (const l of s.lm) if (typeof l === "number") serve.add(l);
    return [...serve].filter(l => !usati.has(l));
  });
  check("ogni landmark che serve a un segmento viene passato alle mesh",
        mancanti.length === 0, mancanti.length ? "mancano: " + mancanti.join(", ") : "");
}

console.log("\n\x1b[1m8. La deformazione arriva davvero a schermo\x1b[0m");
{
  // Prova indispensabile. Da quando la posa la applica il vertex shader, la
  // matrice della mesh resta l'identita' per sempre: se il programma non
  // compilasse, o gli attributi dei pesi non arrivassero, il corpo resterebbe
  // disegnato nella posizione a riposo — e tutte le prove qui sopra
  // passerebbero lo stesso, perche' leggono le posizioni calcolate, non i
  // pixel. L'unico modo di accorgersene e' guardare l'immagine.
  // L'inquadratura si riassesta da sola su ogni nuova posa, e finche' si muove
  // cambia ogni pixel dell'immagine: confrontare troppo presto misurerebbe lo
  // spostamento della telecamera invece della deformazione. Si aspetta che
  // l'immagine smetta di cambiare.
  const scatta = async (posa) => {
    await page.evaluate(p => { window.__posaTest = p; }, posa);
    let prec = null;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(120);
      const img = leggiPng(await page.locator("#scena").screenshot());
      if (prec && diversi(prec, img).q < 0.0005) return img;
      prec = img;
    }
    throw new Error("l'inquadratura non si e' mai fermata");
  };
  /** Quanti pixel cambiano, e dove: la meta' alta dell'immagine contro quella
   *  bassa. Alzando un braccio deve muoversi la parte alta, non le gambe. */
  const diversi = (a, b) => {
    const c = a.canali;
    let n = 0, tot = 0, alto = 0, basso = 0;
    for (let y = 0; y < a.alt; y++) {
      for (let x = 0; x < a.larg; x++) {
        const i = (y * a.larg + x) * c;
        tot++;
        if (Math.abs(a.dati[i] - b.dati[i]) > 8 ||
            Math.abs(a.dati[i+1] - b.dati[i+1]) > 8 ||
            Math.abs(a.dati[i+2] - b.dati[i+2]) > 8) {
          n++;
          if (y < a.alt / 2) alto++; else basso++;
        }
      }
    }
    return { q: n / tot, alto, basso };
  };
  // A inquadratura libera la telecamera si riquadra da sola a ogni posa e
  // cambierebbe tutti i pixel anche se il corpo restasse immobile: cosi' la
  // prova non distinguerebbe niente. Bloccandola, l'unica cosa che puo' ancora
  // muovere l'immagine e' la trasformazione dentro il shader.
  // Solo ossa: i ventri muscolari cambiano colore da soli quando cambia la
  // lunghezza, e quel colore da solo muoverebbe i pixel anche con la geometria
  // ferma. Le ossa hanno un materiale a tinta fissa, quindi se cambiano loro e'
  // perche' si sono davvero spostate.
  await page.click('[data-v="ossa"]');
  await page.evaluate(() => window.__anatomia.bloccaInquadratura(true));
  const dritto = await scatta(POSA);
  const alzato = POSA.map(p => p.slice());
  alzato[14] = [-0.26, -0.48, 0]; alzato[16] = [-0.28, -0.78, 0];   // braccio dx su
  const conBraccio = await scatta(alzato);
  const d = diversi(dritto, conBraccio);
  check("a telecamera ferma e a tinta fissa, alzare il braccio muove i pixel",
        d.q > 0.004, `${(d.q * 100).toFixed(1)}% dei pixel`);
  check("e si muove la parte alta dell'immagine, non le gambe",
        d.alto > d.basso * 3, `${d.alto} pixel in alto contro ${d.basso} in basso`);

  const uguale = await scatta(POSA);
  // Non si pretende l'identita' al pixel: la lisciatura si riassesta con un
  // residuo che sta sotto la soglia di stabilita' stessa. Si pretende che lo
  // scarto sia due ordini di grandezza sotto il movimento del braccio.
  const rit = diversi(dritto, uguale).q;
  check("tornando alla posa di prima l'immagine ci ritorna sopra",
        rit < d.q / 20, `${(rit * 100).toFixed(3)}% contro ${(d.q * 100).toFixed(1)}%`);
  await page.evaluate(() => window.__anatomia.bloccaInquadratura(false));
  await page.click('[data-v="tutto"]');

  // I pesi devono esistere davvero sul modello vero, non solo in teoria.
  const st = await page.evaluate(() => window.__anatomia.statoMesh());
  check("una parte dei vertici e' agganciata a piu' di un osso",
        st.mescolati > 0 && st.mescolati < st.vertici,
        `${st.mescolati} di ${st.vertici} vertici`);
}

console.log("\n\x1b[1m9. Un file rovinato non rompe la pagina\x1b[0m");
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
