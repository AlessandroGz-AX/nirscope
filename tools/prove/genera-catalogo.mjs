// Un .nira col catalogo completo: 629 strutture coi nomi veri di BodyParts3D.
//
// Le forme sono blocchetti, non anatomia — quel che si prova qui e' che
// seicento strutture reggano la catena: riconoscimento dello scheletro dai nomi
// inglesi, assegnazione automatica al segmento, fusione per gruppi, posa. Le
// mesh vere non le ho, ma i nomi sono quelli, ed e' sui nomi che il codice
// decide.
import { readFileSync, writeFileSync } from "node:fs";

const CAT = JSON.parse(readFileSync(new URL("../mappa-completa.json", import.meta.url), "utf8"));
const REGOLE = eval(readFileSync(new URL("../../anatomia-mesh.js", import.meta.url), "utf8")
  .split("const REGOLE = ")[1].split("\n];")[0] + "\n]");
const DX = /(^|_)(dx|right)(_|$)/, SX = /(^|_)(sx|left)(_|$)/;

// Scheletro a riposo in centimetri: x verso la sua sinistra, y all'indietro
// (come nel file, dove l'avanti e' -y), z in alto.
const seg = (a, b) => ({ a, b });
const L = (s) => ({
  tronco:      seg([0, 0, 95], [0, -3, 143]),
  testa:       seg([0, -3, 143], [0, -6, 168]),
  ["omero_" + s.k]:       seg([s.v*19, 0, 143], [s.v*21, 0, 113]),
  ["avambraccio_" + s.k]: seg([s.v*21, 0, 113], [s.v*22, 0, 85]),
  ["mano_" + s.k]:        seg([s.v*22, 0, 85],  [s.v*22, -2, 68]),
  ["femore_" + s.k]:      seg([s.v*9, 0, 95],   [s.v*9.5, 0, 51]),
  ["tibia_" + s.k]:       seg([s.v*9.5, 0, 51], [s.v*9.5, 0, 8]),
  ["piede_" + s.k]:       seg([s.v*9.5, 0, 8],  [s.v*9.5, -12, 3]),
});
const SEG = { ...L({k:"dx", v:-1}), ...L({k:"sx", v:1}) };

function segmentoDi(k) {
  const lato = DX.test(k) ? "dx" : SX.test(k) ? "sx" : null;
  for (const [re, base, bil] of REGOLE) {
    if (!re.test(k)) continue;
    if (!bil) return base;
    if (lato) return base + "_" + lato;
    break;
  }
  return lato ? "femore_" + lato : "tronco";   // ripiego per i pochi senza regola
}

// Un blocchetto per struttura, sparso lungo il suo segmento: cosi' anche la
// via per vicinanza trova qualcosa di sensato.
function blocco(c, r) {
  const V = [], F = [];
  for (const [sx, sy, sz] of [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
                              [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]])
    V.push([c[0]+sx*r[0], c[1]+sy*r[1], c[2]+sz*r[2]]);
  for (const [a,b,d,e] of [[0,1,2,3],[5,4,7,6],[4,5,1,0],[3,2,6,7],[4,0,3,7],[1,5,6,2]])
    F.push([a,b,d],[a,d,e]);
  return { V, F };
}

let n = 0;
const strutture = Object.entries(CAT).map(([nome, v]) => {
  const tipo = +v[0];
  const s = SEG[segmentoDi(nome)] || SEG.tronco;
  const t = (n * 0.6180339887 % 1);                 // sparsi, non ammucchiati
  // Uno scostamento avanti/dietro anatomico: senza, sterno e colonna cadono
  // nello stesso punto e il verso anteriore resta indeterminato — il modello
  // non sarebbe abbastanza tridimensionale per provare l'orientamento.
  const av = /sternum|manubrium|xiphoid|costal_cartilage|pectoralis|rectus_abdominis|patella|quadriceps|rectus_femoris|vastus|tibialis_anterior|biceps_brachii/.test(nome) ? -6
           : /vertebra|erector|multifidus|trapezius|latissimus|gluteus|gastrocnemius|triceps_brachii|semitendinosus|biceps_femoris/.test(nome) ? +6 : 0;
  const c = [0,1,2].map(i => s.a[i] + (s.b[i]-s.a[i]) * t + ((n % 5) - 2) * 0.7 + (i === 1 ? av : 0));
  n++;
  const r = tipo === 0 ? [1.4, 1.4, 2.2] : tipo === 1 ? [1.8, 1.8, 2.6] : [0.8, 0.8, 1.0];
  const { V, F } = blocco(c, r);
  const pos = new Float32Array(V.length * 3);
  V.forEach((p, i) => { pos[i*3]=p[0]; pos[i*3+1]=p[1]; pos[i*3+2]=p[2]; });
  const idx = new Uint32Array(F.length * 3);
  F.forEach((f, i) => { idx[i*3]=f[0]; idx[i*3+1]=f[1]; idx[i*3+2]=f[2]; });
  return { nome, tipo, pos, idx };
});

const enc = new TextEncoder();
let dim = 12;
const meta = strutture.map(s => {
  const nb = enc.encode(s.nome);
  const pad = (4 - ((nb.length + 10) % 4)) % 4;
  dim += 10 + nb.length + pad + s.pos.length * 4 + s.idx.length * 4;
  return { nb, pad, s };
});
const buf = new ArrayBuffer(dim), dv = new DataView(buf), u8 = new Uint8Array(buf);
u8.set(enc.encode("NIRANAT1"), 0);
dv.setUint32(8, strutture.length, true);
let o = 12;
for (const { nb, pad, s } of meta) {
  dv.setUint8(o, nb.length); dv.setUint8(o + 1, s.tipo);
  dv.setUint32(o + 2, s.pos.length / 3, true);
  dv.setUint32(o + 6, s.idx.length / 3, true);
  u8.set(nb, o + 10); o += 10 + nb.length + pad;
  new Float32Array(buf, o, s.pos.length).set(s.pos); o += s.pos.length * 4;
  new Uint32Array(buf, o, s.idx.length).set(s.idx);  o += s.idx.length * 4;
}
writeFileSync(new URL("./catalogo.nira", import.meta.url), Buffer.from(buf));
console.log(`catalogo.nira: ${strutture.length} strutture, ${(buf.byteLength/1e3).toFixed(0)} kB`);
