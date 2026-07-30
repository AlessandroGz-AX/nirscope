// Prova di prepara.html contro archivi finti ma realistici: nomi BPxxxx.obj
// veri, percorsi annidati, deflate, file di contorno, e una variante ZIP64.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import http from "node:http";

const DIR = process.env.NIRSCOPE_DIR || process.cwd();      // la pagina
const PROVE = `${DIR}/tools/prove`;                          // archivi finti e attesi
const atteso = JSON.parse(readFileSync(`${PROVE}/atteso.json`, "utf8"));
const MAPPA = JSON.parse(readFileSync(`${DIR}/tools/mappa-bodyparts3d.json`, "utf8"));

let ok = 0, ko = 0;
const check = (nome, cond, extra = "") => {
  if (cond) { ok++; console.log(`  \x1b[32m✓\x1b[0m ${nome}${extra ? "  " + extra : ""}`); }
  else { ko++; console.log(`  \x1b[31m✗\x1b[0m ${nome}${extra ? "  " + extra : ""}`); }
};

// Un server minimo: file:// non lascia leggere il documento in alcuni casi e
// vogliamo le stesse condizioni della pagina pubblicata.
const server = http.createServer((req, res) => {
  const p = req.url.split("?")[0] === "/" ? "/prepara.html" : req.url.split("?")[0];
  let corpo;
  try { corpo = readFileSync(DIR + p); } catch { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(corpo);
});
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/prepara.html`;

const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
const page = await browser.newPage();
const errori = [];
page.on("pageerror", e => errori.push(String(e)));
page.on("console", m => {
  if (m.type() === "error" && !/favicon/.test(m.location()?.url || "")) errori.push("console: " + m.text());
});

// Legge il .nira prodotto e ne restituisce i metadati, tenendo i megabyte
// dentro la pagina invece di trascinarli fuori.
const ANALIZZA = async () => page.evaluate(async () => {
  const b = window.__prep.risultato;
  if (!b) return null;
  const buf = await b.arrayBuffer();
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const magia = new TextDecoder().decode(u8.subarray(0, 8));
  const n = dv.getUint32(8, true);
  const out = [];
  let o = 12, indiciFuori = 0, nanTrovati = 0;
  for (let i = 0; i < n; i++) {
    const lnNome = dv.getUint8(o), tipo = dv.getUint8(o + 1);
    const nv = dv.getUint32(o + 2, true), nt = dv.getUint32(o + 6, true);
    const nome = new TextDecoder().decode(u8.subarray(o + 10, o + 10 + lnNome));
    const pad = (4 - ((lnNome + 10) % 4)) % 4;
    o += 10 + lnNome + pad;
    const pos = new Float32Array(buf, o, nv * 3); o += nv * 12;
    const idx = new Uint32Array(buf, o, nt * 3);  o += nt * 12;

    const bb = [Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    for (let j = 0; j < pos.length; j++) {
      if (!Number.isFinite(pos[j])) nanTrovati++;
      const a = j % 3;
      if (pos[j] < bb[a]) bb[a] = pos[j];
      if (pos[j] > bb[3+a]) bb[3+a] = pos[j];
    }
    let vol = 0;
    for (let j = 0; j < idx.length; j += 3) {
      const a = idx[j], c = idx[j+1], d = idx[j+2];
      if (a >= nv || c >= nv || d >= nv) { indiciFuori++; continue; }
      const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2];
      const bx=pos[c*3],by=pos[c*3+1],bz=pos[c*3+2];
      const cx=pos[d*3],cy=pos[d*3+1],cz=pos[d*3+2];
      vol += (ax*(by*cz-bz*cy) - ay*(bx*cz-bz*cx) + az*(bx*cy-by*cx)) / 6;
    }
    out.push({ nome, tipo, nv, nt, bb, vol: Math.abs(vol) });
  }
  return { magia, n, byte: buf.byteLength, letti: o, strutture: out, indiciFuori, nanTrovati };
});

const esegui = async (zip) => {
  await page.goto(url, { waitUntil: "load" });
  await page.setInputFiles("#zip", `${PROVE}/${zip}`);
  await page.waitForFunction(
    () => /^(Pronto:|Errore:|Nessuna|Nomi diversi|File di testo)/.test(document.getElementById("stato").textContent),
    null, { timeout: 300000 });
  return {
    stato: await page.textContent("#stato"),
    log: await page.textContent("#log"),
    dati: await ANALIZZA(),   // null quando non si e' prodotto nulla
  };
};

// ── 1. La mappa ────────────────────────────────────────────────────
console.log("\n\x1b[1m1. Mappa e classificazione\x1b[0m");
await page.goto(url, { waitUntil: "load" });
const c = await page.evaluate(() => window.__prep.conteggi());
check("60 strutture", c.strutture === 60, `${c.strutture}`);
check("126 file", c.file === 126, `${c.file}`);
check("26 ossa / 34 muscoli", c.ossa === 26, `${c.ossa} ossa`);
const tib = await page.evaluate(() => [window.__prep.isOsso("tibia_dx"),
                                       window.__prep.isOsso("tibiale_ant_dx"),
                                       window.__prep.isOsso("bicipite_fem_dx")]);
check("tibia=osso, tibiale_ant=muscolo, bicipite_fem=muscolo",
      tib[0] === true && tib[1] === false && tib[2] === false, JSON.stringify(tib));

// ── 2. Archivio normale ────────────────────────────────────────────
console.log("\n\x1b[1m2. Archivio deflate normale\x1b[0m");
const t0 = Date.now();
const r1 = await esegui("finto_bp3d.zip");
console.log(`  (${((Date.now()-t0)/1000).toFixed(1)} s)`);
check("nessun errore di pagina", errori.length === 0, errori.slice(0,2).join(" | "));
check("stato finale a buon fine", /^Pronto:/.test(r1.stato), r1.stato);
check("magia NIRANAT1", r1.dati?.magia === "NIRANAT1", r1.dati?.magia);
check("60 strutture nel file", r1.dati?.n === 60, `${r1.dati?.n}`);
check("nessuna struttura mancante", !/senza file/.test(r1.log));
check("lunghezza esatta (nessun byte avanzato)", r1.dati.letti === r1.dati.byte,
      `${r1.dati.letti} / ${r1.dati.byte}`);
check("nessun indice fuori intervallo", r1.dati.indiciFuori === 0, `${r1.dati.indiciFuori}`);
check("nessuna coordinata non finita", r1.dati.nanTrovati === 0, `${r1.dati.nanTrovati}`);
console.log(`  file prodotto: ${(r1.dati.byte/1e6).toFixed(2)} MB`);

// ── 3. Budget di triangoli ─────────────────────────────────────────
console.log("\n\x1b[1m3. Budget rispettato e riduzione avvenuta\x1b[0m");
const perNome = Object.fromEntries(r1.dati.strutture.map(s => [s.nome, s]));
let sforati = [], nonRidotti = [], tipiSbagliati = [];
for (const [k, a] of Object.entries(atteso)) {
  const s = perNome[k];
  if (!s) { sforati.push(k + " assente"); continue; }
  const budget = a.osso ? 8000 : 4000;
  if (s.nt > budget) sforati.push(`${k} ${s.nt}>${budget}`);
  if (a.tri > budget && s.nt >= a.tri) nonRidotti.push(`${k} ${a.tri}→${s.nt}`);
  if ((s.tipo === 0) !== a.osso) tipiSbagliati.push(k);
}
check("ogni struttura entro il proprio budget", sforati.length === 0, sforati.slice(0,3).join(", "));
check("ogni struttura effettivamente ridotta", nonRidotti.length === 0, nonRidotti.slice(0,3).join(", "));
check("tipo osso/muscolo corretto in tutte", tipiSbagliati.length === 0, tipiSbagliati.join(", "));
const tot = r1.dati.strutture.reduce((s,x)=>s+x.nt,0);
const totOrig = Object.values(atteso).reduce((s,a)=>s+a.tri,0);
console.log(`  triangoli ${totOrig.toLocaleString("it")} → ${tot.toLocaleString("it")}`);

// ── 4. Volume: la geometria sopravvive alla riduzione ──────────────
// Solo sulle ossa da un pezzo solo: sono ellissoidi chiusi e isolati, quindi
// il teorema della divergenza vale senza ambiguita'.
console.log("\n\x1b[1m4. Volume conservato (ossa a pezzo unico)\x1b[0m");
let peggio = 0, peggioNome = "";
for (const [k, a] of Object.entries(atteso)) {
  if (!a.osso || a.capi !== 1) continue;
  const s = perNome[k];
  const err = Math.abs(s.vol - a.vol) / a.vol;
  if (err > peggio) { peggio = err; peggioNome = k; }
}
check("errore di volume sotto il 5%", peggio < 0.05,
      `peggiore ${peggioNome} ${(peggio*100).toFixed(2)}%`);

// ── 5. Unione dei capi muscolari ───────────────────────────────────
// I capi sono sfalsati di 55 unita' lungo Y: se l'unione non fosse avvenuta,
// o se gli indici non fossero stati spostati, l'ingombro non li coprirebbe.
console.log("\n\x1b[1m5. Unione dei capi\x1b[0m");
let unioniOk = 0, unioniKo = [];
for (const [k, a] of Object.entries(atteso)) {
  if (a.capi < 2) continue;
  const s = perNome[k];
  const spanY = s.bb[4] - s.bb[1];
  const minimo = 2 * a.raggi[1] + 55 * (a.capi - 1) - 12;   // margine per la griglia
  if (spanY >= minimo) unioniOk++; else unioniKo.push(`${k} ${spanY.toFixed(0)}<${minimo.toFixed(0)}`);
}
check(`i ${unioniOk} muscoli a piu' capi coprono tutti i capi`,
      unioniKo.length === 0, unioniKo.slice(0,3).join(", "));

// ── 6. ZIP64 ───────────────────────────────────────────────────────
// Tre forme diverse dello stesso archivio. Il risultato deve essere identico
// byte per byte a quello dell'archivio normale: e' la verifica piu' stretta
// possibile, perche' un solo indirizzo letto male sposta tutto.
console.log("\n\x1b[1m6. Varianti ZIP64\x1b[0m");
for (const [nome, descr] of [["zip64_pieno.zip",    "tre campi saturi"],
                             ["zip64_parziale.zip", "solo la posizione, extra da 8 byte"],
                             ["zip64_largo.zip",    "solo la posizione, extra da 24 byte"]]) {
  const r2 = await esegui(nome);
  const uguale = r2.dati && r2.dati.byte === r1.dati.byte &&
    r1.dati.strutture.every((s, i) => s.nome === r2.dati.strutture[i].nome &&
      s.nt === r2.dati.strutture[i].nt && s.nv === r2.dati.strutture[i].nv &&
      Math.abs(s.vol - r2.dati.strutture[i].vol) < 1e-6);
  check(`${descr}: riconosciuto`, /ZIP64/.test(r2.log), r2.log.split("\n")[1]);
  check(`${descr}: risultato identico al normale`, uguale,
        uguale ? "" : `${r2.stato}`);
}

// ── 7. File mancanti e voci non compresse ──────────────────────────
console.log("\n\x1b[1m7. Buchi nell'archivio e voci non compresse\x1b[0m");
const r3 = await esegui("finto_buchi.zip");
const nomi3 = new Set(r3.dati.strutture.map(s => s.nome));
check("va comunque a buon fine", /^Pronto:/.test(r3.stato), r3.stato);
check("femore_dx (unico file assente) segnalato mancante", !nomi3.has("femore_dx"));
check("tricipite_dx (tutti e tre i capi assenti) segnalato mancante", !nomi3.has("tricipite_dx"));
check("bicipite_dx tenuto con il capo superstite", nomi3.has("bicipite_dx"));
check("le mancanze sono elencate nel registro", /2 strutture senza file/.test(r3.log),
      (r3.log.match(/\d+ strutture senza file/) || ["-"])[0]);
check("58 strutture su 60", r3.dati.n === 58, `${r3.dati.n}`);
// I due file scritti senza compressione devono essere letti lo stesso.
check("femore_sx non compresso letto correttamente",
      nomi3.has("femore_sx") && perNome["femore_sx"] &&
      Math.abs(r3.dati.strutture.find(s=>s.nome==="femore_sx").vol - atteso["femore_sx"].vol)
        / atteso["femore_sx"].vol < 0.05);
check("bicipite_sx (un capo non compresso) letto correttamente",
      r3.dati.strutture.find(s=>s.nome==="bicipite_sx")?.nt > 0);

// ── 8. File che non sono l'archivio giusto ─────────────────────────
console.log("\n\x1b[1m8. File che non sono l'archivio giusto\x1b[0m");
await page.goto(url, { waitUntil: "load" });
const binario = await page.evaluate(async () => {
  const b = new Uint8Array(600); for (let i = 0; i < b.length; i++) b[i] = i % 251;
  await window.__prep.elabora(new File([b], "roba.zip"));
  return document.getElementById("stato").textContent;
});
check("un file binario qualsiasi: messaggio chiaro, non un crash",
      /Non sembra un archivio ZIP/.test(binario), binario);

// Le tabelle di corrispondenza di BodyParts3D sono file di testo: invece di
// rifiutarle se ne mostra l'inizio, perche' sono l'unico posto dove sta scritto
// come i modelli si chiamano davvero.
const testo = await page.evaluate(async () => {
  const t = "FMA7207\tBP8920\tfemur\nFMA9611\tBP5558\tbiceps brachii\n";
  await window.__prep.elabora(new File([t], "partof_parts_list_e.txt"));
  return { stato: document.getElementById("stato").textContent,
           log: document.getElementById("log").textContent };
});
// Troppo corto per essere la tabella dei nomi: non la si spaccia per tale, ma
// se ne mostrano comunque le righe, che e' quello che serve per capire cos'e'.
check("un testo che non e' la tabella non viene spacciato per tale",
      /Non riesco a leggerla come tabella/.test(testo.stato), testo.stato);
check("se ne vedono comunque le righe",
      /biceps brachii/.test(testo.log) && /FMA7207/.test(testo.log));

// ── 9. Archivio con nomi diversi da quelli attesi ──────────────────
// E' il caso che si e' presentato davvero: l'archivio c'e' ma usa un'altra
// convenzione di nomi. Senza diagnostica l'unica informazione sarebbe "non
// trovato", che non basta a capire cosa fare.
console.log("\n\x1b[1m9. Archivio con nomi diversi\x1b[0m");
const r4 = await esegui("finto_nomi_diversi.zip");
check("lo dice invece di fallire in silenzio", /Nomi diversi/.test(r4.stato), r4.stato);
check("mostra cartelle, estensioni e forma dei nomi", /forma nomi/.test(r4.log));
check("mostra i primi nomi veri", /FJ3000\.obj/.test(r4.log));
check("dice se i numeri cercati compaiono altrove", /numeri cercati/.test(r4.log),
      (r4.log.match(/numeri cercati.*/) || [""])[0]);


// ── 10. Riconoscimento per nome anatomico ──────────────────────────
// La via che rende la pagina indipendente dal pacchetto: si carica la tabella
// dei nomi e le strutture si riconoscono da "femur", non da un identificativo.
// L'archivio di prova usa identificativi di forma diversa da quelli della mappa
// scritta a mano, cosi' se funzionasse solo perche' coincidono non passerebbe.
console.log("\n\x1b[1m10. Riconoscimento per nome anatomico\x1b[0m");
await page.goto(url, { waitUntil: "load" });
await page.setInputFiles("#zip", `${PROVE}/finto_parts_list.txt`);
await page.waitForFunction(
  () => /^(Tabella|Errore|Non riesco)/.test(document.getElementById("stato").textContent),
  null, { timeout: 60000 });
const tab = { stato: await page.textContent("#stato"), log: await page.textContent("#log") };
check("tabella letta", /Tabella pronta/.test(tab.stato), tab.stato);
check("60 strutture riconosciute dai nomi", /60 strutture riconosciute su 60/.test(tab.log),
      (tab.log.match(/\d+ strutture riconosciute su \d+/) || ["-"])[0]);
check("nessuna struttura data per mancante", !/non trovate nella tabella/.test(tab.log));

await page.setInputFiles("#zip", `${PROVE}/finto_per_nome.zip`);
await page.waitForFunction(
  () => /^(Pronto:|Errore:|Nessun|Nomi diversi)/.test(document.getElementById("stato").textContent),
  null, { timeout: 300000 });
const perNomeLog = await page.textContent("#log");
const d = await ANALIZZA();
check("l'archivio viene letto con quegli identificativi",
      /identificativi presi dalla tabella/.test(perNomeLog));
check("60 strutture estratte", d?.n === 60, `${d?.n}`);
check("nessuna parte data per non trovata", !/non trovati/.test(perNomeLog),
      (perNomeLog.match(/.*non trovati.*/) || [""])[0].trim());
check("tipi osso/muscolo corretti", d.strutture.filter(x => x.tipo === 0).length === 26,
      `${d.strutture.filter(x => x.tipo === 0).length} ossa`);
// Tendini e legamenti portano il nome del muscolo: non devono finirci dentro.
check("tendini, legamenti e fasce restano fuori",
      !/tendon|ligament|fascia/.test(perNomeLog));

await browser.close();
server.close();
console.log(`\n\x1b[1m${ok} verifiche superate, ${ko} fallite\x1b[0m\n`);
process.exit(ko ? 1 : 0);
