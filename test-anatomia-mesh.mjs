// Verifica l'aggancio delle mesh allo scheletro della posa.
//
// Le mesh di prova stanno in un sistema di coordinate scelto scomodo — Z in su,
// centimetri, origine spostata, assi ruotati di 0,4 rad — perche' il codice non
// deve funzionare per fortuna: deve dedurre orientamento, scala e articolazioni
// dalla geometria. Se desse per scontata una convenzione, qui si vedrebbe.
import { leggiNira, derivaScheletro, preparaLegami, matricePosa, applica,
         frameSegmento, LEGAMI, SEGMENTI } from "./anatomia-mesh.js";
import { costruisci, GIUNTI_MODELLO, VERI } from "./tools/prove/genera-nira.mjs";

let ok = 0, ko = 0;
const check = (n, c, e = "") => {
  if (c) { ok++; console.log(`  \x1b[32m✓\x1b[0m ${n}${e ? "  " + e : ""}`); }
  else { ko++; console.log(`  \x1b[31m✗\x1b[0m ${n}${e ? "  " + e : ""}`); }
};
const dist = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

const { buf } = costruisci();

// ── 1. Lettura del formato ─────────────────────────────────────────
console.log("\n\x1b[1m1. Lettura del formato\x1b[0m");
const strutture = leggiNira(buf);
check("60 strutture lette", strutture.length === 60, `${strutture.length}`);
check("26 ossa e 34 muscoli", strutture.filter(s => s.osso).length === 26,
      `${strutture.filter(s => s.osso).length} ossa`);
check("indici tutti dentro i vertici", strutture.every(s =>
  s.idx.every(i => i < s.pos.length / 3)));
check("nessuna coordinata non finita", strutture.every(s =>
  s.pos.every(Number.isFinite)));

for (const [nome, taglia] of [["intestazione sbagliata", 4], ["file troncato", buf.byteLength - 40]]) {
  let messaggio = "";
  try {
    const c = buf.slice(0, taglia);
    if (taglia === 4) leggiNira(new ArrayBuffer(12));
    else leggiNira(c);
  } catch (e) { messaggio = e.message; }
  check(`${nome}: errore comprensibile invece di dati a caso`, messaggio.length > 10, messaggio);
}

// ── 2. Orientamento dedotto ────────────────────────────────────────
console.log("\n\x1b[1m2. Orientamento e scala dedotti dalla geometria\x1b[0m");
const mappa = new Map(strutture.map(s => [s.nome, s]));
const sk = derivaScheletro(mappa);
check("verticale corretto", dot(sk.su, VERI.su) > 0.999,
      `scarto ${(Math.acos(Math.min(1,dot(sk.su, VERI.su)))*180/Math.PI).toFixed(2)}°`);
check("laterale corretto (punta alla sua sinistra)", dot(sk.laterale, VERI.laterale) > 0.999,
      `scarto ${(Math.acos(Math.min(1,dot(sk.laterale, VERI.laterale)))*180/Math.PI).toFixed(2)}°`);
check("anteriore corretto", dot(sk.avanti, VERI.avanti) > 0.999,
      `scarto ${(Math.acos(Math.min(1,dot(sk.avanti, VERI.avanti)))*180/Math.PI).toFixed(2)}°`);
check("terna ortonormale", Math.abs(dot(sk.su, sk.laterale)) < 1e-6 &&
      Math.abs(dot(sk.su, sk.avanti)) < 1e-6 && Math.abs(dot(sk.laterale, sk.avanti)) < 1e-6);
check("nessun avviso sulla mappa", sk.avvisi.length === 0, sk.avvisi.join("; "));

// ── 3. Articolazioni ritrovate ─────────────────────────────────────
// Le ossa lunghe sono ellissoidi fra due giunti: le estremita' dedotte devono
// ricadere sui giunti veri, a meno del raggio trasversale dell'ellissoide.
console.log("\n\x1b[1m3. Articolazioni ritrovate dalle estremita' delle ossa\x1b[0m");
let peggio = 0, quale = "";
for (const g of ["anca", "ginocchio", "caviglia", "spalla", "gomito", "polso"]) {
  for (const lato of ["dx", "sx"]) {
    const k = g + "_" + lato;
    const d = dist(sk.ancore[k], GIUNTI_MODELLO[k]);
    if (d > peggio) { peggio = d; quale = k; }
  }
}
// 175 cm di statura: 4 cm sono poco piu' del 2% e stanno dentro lo spessore
// dell'osso, che e' quanto ci si puo' aspettare da un estremo di superficie.
check("tutte le 12 articolazioni entro 4 cm dal vero", peggio < 4,
      `peggiore ${quale}: ${peggio.toFixed(1)} cm`);
const altezza = dist(sk.ancore.midSpalle, sk.ancore.midAnche);
check("altezza del tronco plausibile (48 cm veri)", Math.abs(altezza - 48) < 3,
      `${altezza.toFixed(1)} cm`);
check("anca destra e sinistra distinte e dal verso giusto",
      dot([sk.ancore.anca_sx[0]-sk.ancore.anca_dx[0],
           sk.ancore.anca_sx[1]-sk.ancore.anca_dx[1],
           sk.ancore.anca_sx[2]-sk.ancore.anca_dx[2]], sk.laterale) > 10);

// ── 3bis. Un modello con destra e sinistra scambiate ───────────────
// Uno scheletro specchiato sembra normale a occhio: se le etichette della
// mappa fossero invertite non se ne accorgerebbe nessuno, e il modello
// seguirebbe la gamba sbagliata per sempre. Qui si scambiano apposta.
console.log("\n\x1b[1m3bis. Etichette destra/sinistra invertite\x1b[0m");
const scambiate = new Map();
for (const [k, v] of mappa) {
  const alt = k.endsWith("_dx") ? k.slice(0,-3) + "_sx"
            : k.endsWith("_sx") ? k.slice(0,-3) + "_dx" : k;
  scambiate.set(alt, { ...v, nome: alt });
}
const skS = derivaScheletro(scambiate);
check("lo scambio viene rilevato", skS.scambiaLati === true);
check("e detto in chiaro", skS.avvisi.some(a => /scambiate/.test(a)), skS.avvisi.join("; "));
check("il verso anteriore resta corretto anche cosi'", dot(skS.avanti, VERI.avanti) > 0.999);
const rS = preparaLegami([...scambiate.values()], skS);
check("tutte agganciate lo stesso", rS.pronte.length === 60, `${rS.pronte.length}`);
// La mesh chiamata "femore_sx" sta davvero sulla gamba destra: deve finire
// agganciata al segmento del femore destro.
check("la mesh finisce sulla gamba giusta nonostante il nome",
      rS.pronte.find(p => p.nome === "femore_sx")?.segmento === "femore_dx",
      rS.pronte.find(p => p.nome === "femore_sx")?.segmento);

// ── 4. Legami ──────────────────────────────────────────────────────
console.log("\n\x1b[1m4. Legami\x1b[0m");
const { pronte, fuori } = preparaLegami(strutture, sk);
check("tutte e 60 le strutture agganciate", pronte.length === 60, `${pronte.length}, fuori: ${fuori.join(", ")}`);
check("ogni segmento nominato esiste", Object.values(LEGAMI).every(v => SEGMENTI[v]));
const usati = new Set(pronte.map(p => p.segmento));
check("tutti e dieci i segmenti in uso", usati.size === 10, `${usati.size}`);

// ── 5. La posa: le ancore finiscono sui landmark ───────────────────
// E' la verifica che conta. Se la matrice e' giusta, l'estremita' prossimale
// della mesh cade sul landmark prossimale e quella distale sul distale, per
// costruzione — quindi un errore qualsiasi nell'algebra si vede subito.
console.log("\n\x1b[1m5. Posa: le estremita' cadono sui landmark\x1b[0m");
const su1 = [0, 1, 0], avanti1 = [0, 0, 1];       // riferimenti del mondo vivo
const scalaCorpo = 0.01;                           // da centimetri a metri

function provaPosa(nome, giunti) {
  let peggioA = 0, peggioB = 0, quale = "";
  for (const l of pronte) {
    const seg = SEGMENTI[l.segmento];
    const a1 = giunti[seg.ancore[0]], b1 = giunti[seg.ancore[1]];
    if (!a1 || !b1) continue;
    const M = matricePosa(l, a1, b1, su1, avanti1, scalaCorpo);
    if (!M) { ko++; console.log(`  \x1b[31m✗\x1b[0m ${l.nome}: matrice nulla`); return; }
    const b0 = [l.ancoraA[0] + l.frame.asse[0]*l.lunghezzaRiposo,
                l.ancoraA[1] + l.frame.asse[1]*l.lunghezzaRiposo,
                l.ancoraA[2] + l.frame.asse[2]*l.lunghezzaRiposo];
    const dA = dist(applica(M, l.ancoraA), a1);
    const dB = dist(applica(M, b0), b1);
    if (dA > peggioA) peggioA = dA;
    if (dB > peggioB) { peggioB = dB; quale = l.nome; }
  }
  check(`${nome}: estremita' prossimali sui landmark`, peggioA < 1e-6, `${peggioA.toExponential(1)} m`);
  check(`${nome}: estremita' distali sui landmark`, peggioB < 1e-6,
        `${peggioB.toExponential(1)} m (${quale})`);
}

// Posa in piedi, in metri, con Y in su: nulla a che vedere col sistema del modello.
const inPiedi = {};
for (const [k, v] of Object.entries({
  anca_dx: [-0.09, 0.95, 0], anca_sx: [0.09, 0.95, 0],
  ginocchio_dx: [-0.095, 0.51, 0], ginocchio_sx: [0.095, 0.51, 0],
  caviglia_dx: [-0.095, 0.08, 0], caviglia_sx: [0.095, 0.08, 0],
  spalla_dx: [-0.19, 1.43, 0], spalla_sx: [0.19, 1.43, 0],
  gomito_dx: [-0.21, 1.13, 0], gomito_sx: [0.21, 1.13, 0],
  polso_dx: [-0.22, 0.85, 0], polso_sx: [0.22, 0.85, 0],
  naso: [0, 1.68, 0.08],
})) inPiedi[k] = v;
inPiedi.midAnche = [0, 0.95, 0]; inPiedi.midSpalle = [0, 1.43, 0];
inPiedi.testa = inPiedi.naso;
provaPosa("in piedi", inPiedi);

// Posa piegata: ginocchia e gomiti flessi, torso ruotato. Le mesh devono
// seguire comunque.
const piegata = JSON.parse(JSON.stringify(inPiedi));
piegata.ginocchio_dx = [-0.10, 0.55, 0.22]; piegata.ginocchio_sx = [0.10, 0.55, 0.22];
piegata.caviglia_dx = [-0.10, 0.12, -0.05]; piegata.caviglia_sx = [0.10, 0.12, -0.05];
piegata.gomito_dx = [-0.24, 1.16, 0.05]; piegata.gomito_sx = [0.24, 1.16, 0.05];
piegata.polso_dx = [-0.18, 1.05, 0.30]; piegata.polso_sx = [0.18, 1.05, 0.30];
piegata.midSpalle = [0.05, 1.41, 0.06];
provaPosa("piegata", piegata);

// ── 6. Rigidita' e volume ──────────────────────────────────────────
// Un osso non deve deformarsi: fra due pose diverse le distanze interne
// possono solo scalare tutte dello stesso fattore.
console.log("\n\x1b[1m6. Le ossa restano rigide\x1b[0m");
const femore = pronte.find(p => p.nome === "femore_dx");
function campiona(M, s, quanti = 60) {
  const n = s.pos.length / 3, out = [];
  for (let i = 0; i < quanti; i++) {
    const j = Math.floor(i * n / quanti);
    out.push(applica(M, [s.pos[j*3], s.pos[j*3+1], s.pos[j*3+2]]));
  }
  return out;
}
const M1 = matricePosa(femore, inPiedi.anca_dx, inPiedi.ginocchio_dx, su1, avanti1, scalaCorpo);
const M2 = matricePosa(femore, piegata.anca_dx, piegata.ginocchio_dx, su1, avanti1, scalaCorpo);
const P1 = campiona(M1, femore), P2 = campiona(M2, femore);
let rapMin = Infinity, rapMax = 0;
for (let i = 0; i < P1.length; i++) {
  for (let j = i + 1; j < P1.length; j++) {
    const d1 = dist(P1[i], P1[j]), d2 = dist(P2[i], P2[j]);
    if (d1 < 1e-4) continue;
    const r = d2 / d1;
    if (r < rapMin) rapMin = r; if (r > rapMax) rapMax = r;
  }
}
// La coscia si accorcia un po' in prospettiva fra le due pose, quindi il
// fattore assiale cambia: la forma resta la stessa a meno di quello.
check("nessuna distorsione oltre lo stiramento assiale", rapMax / rapMin < 1.15,
      `rapporti da ${rapMin.toFixed(3)} a ${rapMax.toFixed(3)}`);
const dritto = matricePosa(femore, inPiedi.anca_dx, inPiedi.ginocchio_dx, su1, avanti1, scalaCorpo);
const Q = campiona(dritto, femore);
const lunghezzaViva = dist(inPiedi.anca_dx, inPiedi.ginocchio_dx);
check("il femore posato e' lungo quanto il segmento vivo",
      Math.abs(dist(applica(dritto, femore.ancoraA),
                    applica(dritto, [femore.ancoraA[0] + femore.frame.asse[0]*femore.lunghezzaRiposo,
                                     femore.ancoraA[1] + femore.frame.asse[1]*femore.lunghezzaRiposo,
                                     femore.ancoraA[2] + femore.frame.asse[2]*femore.lunghezzaRiposo]))
               - lunghezzaViva) < 1e-9,
      `${lunghezzaViva.toFixed(3)} m`);
check("il femore posato sta dove deve (dimensioni umane)",
      Q.every(p => Math.abs(p[0]) < 0.6 && p[1] > 0.2 && p[1] < 1.3), "");

// ── 6bis. Rotazione attorno all'asse dell'osso ─────────────────────
// L'asse dice dove punta l'osso ma non come e' ruotato attorno a se stesso, e
// quel grado di liberta' lo fissa il riferimento anteriore. Se fosse invertito
// tutto starebbe ancora fra i giunti giusti — con la rotula dietro il ginocchio
// e i bicipiti dietro le braccia. Si verifica sulle strutture il cui lato
// anatomico si conosce.
console.log("\n\x1b[1m6bis. Le strutture stanno dal lato giusto dell'osso\x1b[0m");
const posa = (nome, a, b) => {
  const l = pronte.find(p => p.nome === nome);
  const M = matricePosa(l, a, b, su1, avanti1, scalaCorpo);
  const n = l.pos.length / 3;
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < n; i++) {
    const p = applica(M, [l.pos[i*3], l.pos[i*3+1], l.pos[i*3+2]]);
    x += p[0]; y += p[1]; z += p[2];
  }
  return [x/n, y/n, z/n];
};
const F = [inPiedi.anca_dx, inPiedi.ginocchio_dx];
const O = [inPiedi.spalla_dx, inPiedi.gomito_dx];
const T = [inPiedi.ginocchio_dx, inPiedi.caviglia_dx];
const TR = [inPiedi.midAnche, inPiedi.midSpalle];
// avanti1 e' +z, quindi "davanti" vuol dire z maggiore.
check("la rotula sta davanti al femore", posa("rotula_dx", ...F)[2] > posa("femore_dx", ...F)[2] + 0.02,
      `${posa("rotula_dx", ...F)[2].toFixed(3)} contro ${posa("femore_dx", ...F)[2].toFixed(3)}`);
check("il bicipite davanti, il tricipite dietro l'omero",
      posa("bicipite_dx", ...O)[2] > posa("omero_dx", ...O)[2] &&
      posa("tricipite_dx", ...O)[2] < posa("bicipite_dx", ...O)[2]);
check("il gastrocnemio sta dietro alla tibia",
      posa("gastrocnemio_dx", ...T)[2] < posa("tibia_dx", ...T)[2],
      `${posa("gastrocnemio_dx", ...T)[2].toFixed(3)} contro ${posa("tibia_dx", ...T)[2].toFixed(3)}`);
check("il tibiale anteriore sta davanti alla tibia",
      posa("tibiale_ant_dx", ...T)[2] > posa("tibia_dx", ...T)[2]);
check("lo sterno davanti alla colonna", posa("sterno", ...TR)[2] > posa("colonna", ...TR)[2]);
check("il pettorale davanti, il trapezio dietro",
      posa("pettorale_dx", ...TR)[2] > posa("trapezio_dx", ...TR)[2]);
// E il lato: le strutture "dx" devono stare sulla destra del soggetto, che
// nella posa di prova ha x negativo.
check("le strutture destre stanno a destra del soggetto",
      posa("femore_dx", ...F)[0] < 0 && posa("vasto_dx", ...F)[0] < 0 &&
      posa("omero_dx", ...O)[0] < 0);

// ── 7. Ingrossamento del ventre muscolare ──────────────────────────
console.log("\n\x1b[1m7. Il ventre si ingrossa accorciandosi\x1b[0m");
const bicipite = pronte.find(p => p.nome === "bicipite_dx");
const sottile = matricePosa(bicipite, inPiedi.spalla_dx, inPiedi.gomito_dx, su1, avanti1, scalaCorpo, 1.0);
const grosso  = matricePosa(bicipite, inPiedi.spalla_dx, inPiedi.gomito_dx, su1, avanti1, scalaCorpo, 1.3);
const raggio = (M) => {
  const pts = campiona(M, bicipite, 200);
  const asse = [0,1,2].map(i => (inPiedi.gomito_dx[i] - inPiedi.spalla_dx[i]));
  const nA = Math.hypot(...asse).valueOf();
  const u = asse.map(x => x / nA);
  let max = 0;
  for (const p of pts) {
    const d = [0,1,2].map(i => p[i] - inPiedi.spalla_dx[i]);
    const lungo = dot(d, u);
    const trasv = Math.hypot(d[0]-u[0]*lungo, d[1]-u[1]*lungo, d[2]-u[2]*lungo);
    if (trasv > max) max = trasv;
  }
  return max;
};
const r1 = raggio(sottile), r2 = raggio(grosso);
check("l'ingrossamento allarga solo di traverso", Math.abs(r2 / r1 - 1.3) < 0.02,
      `${(r2/r1).toFixed(3)}× invece di 1.300×`);
const lungoA = dist(applica(sottile, bicipite.ancoraA), inPiedi.spalla_dx);
const lungoB = dist(applica(grosso, bicipite.ancoraA), inPiedi.spalla_dx);
check("l'ingrossamento non sposta gli attacchi", Math.abs(lungoA - lungoB) < 1e-9);

// ── 8. Modello incompleto ──────────────────────────────────────────
console.log("\n\x1b[1m8. Modello incompleto\x1b[0m");
const senzaTibia = new Map(mappa);
senzaTibia.delete("tibia_dx"); senzaTibia.delete("perone_dx");
const sk2 = derivaScheletro(senzaTibia);
check("segnala l'articolazione che non riesce a ricavare",
      sk2.avvisi.some(a => /caviglia dx/.test(a)), sk2.avvisi.join("; "));
const r = preparaLegami([...senzaTibia.values()], sk2);
check("mette da parte solo le strutture senza segmento, non tutto",
      r.pronte.length >= 50 && r.fuori.every(n => /_dx$/.test(n)),
      `${r.pronte.length} agganciate, fuori: ${r.fuori.join(", ") || "nessuna"}`);
let errCranio = "";
try { derivaScheletro(new Map([["femore_dx", mappa.get("femore_dx")]])); }
catch (e) { errCranio = e.message; }
check("senza bacino e cranio lo dice invece di produrre spazzatura",
      /bacino e cranio/.test(errCranio), errCranio);

console.log(`\n\x1b[1m${ok} verifiche superate, ${ko} fallite\x1b[0m\n`);
process.exit(ko ? 1 : 0);
