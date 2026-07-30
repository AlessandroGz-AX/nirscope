// Costruisce un .nira sintetico con le strutture in posizioni anatomicamente
// plausibili, ma in un sistema di coordinate scelto apposta scomodo: Z in su,
// unita' in centimetri, origine spostata e assi ruotati.
//
// Il punto e' proprio questo. L'archivio vero non ce l'ho sotto mano, quindi il
// codice non deve funzionare perche' indovina la convenzione di BodyParts3D:
// deve dedurla. Se qualcosa desse per scontato "Y in su" o "metri", qui si
// romperebbe subito.
import { writeFileSync } from "node:fs";

const P = Math.PI;
// Rotazione: prima Z diventa il verticale, poi si ruota di 0,4 rad attorno a
// esso, cosi' nemmeno gli assi orizzontali coincidono con quelli del mondo.
const c = Math.cos(0.4), s = Math.sin(0.4);
const SCALA = 0.1;                        // il modello e' in centimetri
const ORIGINE = [37.5, -12.25, 190.0];    // e non e' centrato sull'origine

/** Da coordinate anatomiche comode (x=verso la sua sinistra, y=avanti,
 *  z=in su, in cm) al sistema storto del finto archivio. */
function verso(p) {
  // La y anatomica (avanti) va all'indietro nel sistema del modello: con lo
  // stesso segno la terna verrebbe specchiata rispetto allo spazio vivo, dove
  // laterale, su e avanti sono x, y, z, e il modello uscirebbe riflesso.
  const x = p[0] * c + p[1] * s, y = p[0] * s - p[1] * c;
  return [x + ORIGINE[0], y + ORIGINE[1], p[2] + ORIGINE[2]];
}
export const VERI = {
  su: [0, 0, 1], laterale: [c, s, 0], avanti: [s, -c, 0], scala: SCALA, origine: ORIGINE,
};

function ellissoide(centro, raggi, suddiv = 2) {
  const t = (1 + 5 ** 0.5) / 2;
  let V = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],
           [0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]]
          .map(v => { const n = Math.hypot(...v); return v.map(x => x/n); });
  let F = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],
           [10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],
           [2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for (let k = 0; k < suddiv; k++) {
    const memo = new Map(), nuove = [];
    const mezzo = (a, b) => {
      const key = a < b ? a + "," + b : b + "," + a;
      if (!memo.has(key)) {
        const m = [0,1,2].map(i => (V[a][i] + V[b][i]) / 2);
        const n = Math.hypot(...m);
        V.push(m.map(x => x / n)); memo.set(key, V.length - 1);
      }
      return memo.get(key);
    };
    for (const [a, b, d] of F) {
      const ab = mezzo(a,b), bd = mezzo(b,d), da = mezzo(d,a);
      nuove.push([a,ab,da],[b,bd,ab],[d,da,bd],[ab,bd,da]);
    }
    F = nuove;
  }
  const pos = new Float32Array(V.length * 3);
  V.forEach((v, i) => {
    const p = verso([centro[0] + v[0]*raggi[0], centro[1] + v[1]*raggi[1], centro[2] + v[2]*raggi[2]]);
    pos[i*3] = p[0]; pos[i*3+1] = p[1]; pos[i*3+2] = p[2];
  });
  const idx = new Uint32Array(F.length * 3);
  F.forEach((f, i) => { idx[i*3] = f[0]; idx[i*3+1] = f[1]; idx[i*3+2] = f[2]; });
  return { pos, idx };
}

// Articolazioni in centimetri, corpo alto 175 cm, x positivo verso la sua
// sinistra. Sono i valori con cui il test confronta quel che il codice deduce.
export const GIUNTI = {
  anca_dx: [-9, 0, 95], anca_sx: [9, 0, 95],
  ginocchio_dx: [-9.5, 0, 51], ginocchio_sx: [9.5, 0, 51],
  caviglia_dx: [-9.5, 0, 8], caviglia_sx: [9.5, 0, 8],
  spalla_dx: [-19, 0, 143], spalla_sx: [19, 0, 143],
  gomito_dx: [-21, 0, 113], gomito_sx: [21, 0, 113],
  polso_dx: [-22, 0, 85], polso_sx: [22, 0, 85],
  cranio: [0, 0, 168],
};
const G = GIUNTI;
const fra = (a, b, t = 0.5) => [0,1,2].map(i => a[i] + (b[i]-a[i])*t);
// Scostamento anteriore/posteriore rispetto all'asse dell'osso: senza questo i
// ventri muscolari sarebbero concentrici all'osso e le prove sul lato in cui
// finiscono non verificherebbero nulla.
const davanti = (p, d) => [p[0], p[1] + d, p[2]];

// nome → [centro, raggi]. Le ossa lunghe sono ellissoidi allungati fra le due
// articolazioni, cosi' le estremita' dedotte devono ricadere sui giunti veri.
function osso(a, b, r) { return [fra(a, b), [r, r, 0].map((_,i)=> i===2 ? Math.abs(b[2]-a[2])/2 : r)]; }
const DEF = {
  cranio: [G.cranio, [8, 9, 10]],
  mandibola: [[0, 5, 160], [5, 4, 3]],
  colonna: [[0, -7, 120], [3, 3, 26]],          // sulla mediana, dietro

  coste: [[0, 2, 125], [14, 9, 16]],
  sterno: [[0, 9, 127], [3, 1.5, 11]],
  sacro: [[0, -4, 97], [5, 3, 6]],
};
for (const [lato, sgn] of [["dx", -1], ["sx", +1]]) {
  const L = (k) => G[k + "_" + lato];
  Object.assign(DEF, {
    ["bacino_" + lato]:    [[sgn*9, 0, 99], [7, 6, 8]],
    ["scapola_" + lato]:   [[sgn*13, -5, 140], [6, 2, 8]],
    ["clavicola_" + lato]: [[sgn*10, 5, 146], [8, 1.5, 1.5]],
    ["femore_" + lato]:    osso(L("anca"), L("ginocchio"), 3),
    ["rotula_" + lato]:    [[sgn*9.5, 4, 52], [2.5, 1.5, 2.5]],
    ["tibia_" + lato]:     osso(L("ginocchio"), L("caviglia"), 2.5),
    ["perone_" + lato]:    [fra(L("ginocchio"), L("caviglia")), [1.2, 1.2, 20]],
    ["omero_" + lato]:     osso(L("spalla"), L("gomito"), 2.5),
    ["radio_" + lato]:     osso(L("gomito"), L("polso"), 1.5),
    ["ulna_" + lato]:      osso(L("gomito"), L("polso"), 1.4),

    ["deltoide_" + lato]:     [[sgn*22, 0, 138], [5, 5, 9]],
    ["bicipite_" + lato]:     [davanti(fra(L("spalla"), L("gomito"), 0.55), +3.5), [3.5, 3, 12]],
    ["tricipite_" + lato]:    [davanti(fra(L("spalla"), L("gomito"), 0.5), -3.5), [3.5, 3, 13]],
    ["brachioradiale_" + lato]: [davanti(fra(L("gomito"), L("polso"), 0.35), +2), [2.5, 2, 9]],
    ["pettorale_" + lato]:    [[sgn*8, 9, 133], [8, 3, 8]],
    ["dentato_" + lato]:      [[sgn*13, 2, 124], [3, 7, 9]],
    ["trapezio_" + lato]:     [[sgn*8, -7, 141], [8, 3, 12]],
    ["obliquo_" + lato]:      [[sgn*11, 3, 110], [4, 6, 10]],
    ["gluteo_" + lato]:       [[sgn*10, -8, 97], [7, 5, 8]],
    ["adduttore_" + lato]:    [[sgn*4, 0, 72], [3.5, 4, 16]],
    ["retto_femorale_" + lato]: [davanti(fra(L("anca"), L("ginocchio"), 0.5), +4.5), [4, 3, 20]],
    ["vasto_" + lato]:        [davanti(fra(L("anca"), L("ginocchio"), 0.55), +3), [6, 4, 18]],
    ["bicipite_fem_" + lato]: [davanti(fra(L("anca"), L("ginocchio"), 0.5), -4.5), [4, 3, 19]],
    ["semitendinoso_" + lato]: [davanti(fra(L("anca"), L("ginocchio"), 0.55), -4), [3, 2.5, 18]],
    ["gastrocnemio_" + lato]: [davanti(fra(L("ginocchio"), L("caviglia"), 0.3), -4.5), [4.5, 3.5, 11]],
    ["soleo_" + lato]:        [davanti(fra(L("ginocchio"), L("caviglia"), 0.45), -4), [4, 3, 13]],
    ["tibiale_ant_" + lato]:  [davanti(fra(L("ginocchio"), L("caviglia"), 0.4), +3.5), [2.5, 2.5, 13]],
  });
}

const OSSA = new Set(["bacino","clavicola","colonna","coste","cranio","femore","mandibola",
                      "omero","perone","radio","rotula","sacro","scapola","sterno","tibia","ulna"]);
const base = (k) => k.endsWith("_dx") || k.endsWith("_sx") ? k.slice(0, -3) : k;

export function costruisci() {
  const strutture = Object.entries(DEF).map(([nome, [centro, raggi]]) => {
    const { pos, idx } = ellissoide(centro, raggi);
    return { nome, osso: OSSA.has(base(nome)), pos, idx };
  });
  const enc = new TextEncoder();
  let dim = 12;
  const meta = strutture.map(s => {
    const n = enc.encode(s.nome);
    const pad = (4 - ((n.length + 10) % 4)) % 4;
    dim += 10 + n.length + pad + s.pos.length * 4 + s.idx.length * 4;
    return { n, pad, s };
  });
  const buf = new ArrayBuffer(dim), dv = new DataView(buf), u8 = new Uint8Array(buf);
  u8.set(enc.encode("NIRANAT1"), 0);
  dv.setUint32(8, strutture.length, true);
  let o = 12;
  for (const { n, pad, s } of meta) {
    dv.setUint8(o, n.length); dv.setUint8(o + 1, s.osso ? 0 : 1);
    dv.setUint32(o + 2, s.pos.length / 3, true);
    dv.setUint32(o + 6, s.idx.length / 3, true);
    u8.set(n, o + 10); o += 10 + n.length + pad;
    new Float32Array(buf, o, s.pos.length).set(s.pos); o += s.pos.length * 4;
    new Uint32Array(buf, o, s.idx.length).set(s.idx);  o += s.idx.length * 4;
  }
  return { buf, strutture };
}

/** I giunti veri, portati nel sistema storto: e' il metro di paragone. */
export const GIUNTI_MODELLO = Object.fromEntries(
  Object.entries(GIUNTI).map(([k, v]) => [k, verso(v)]));

if (import.meta.url === `file://${process.argv[1]}`) {
  const { buf, strutture } = costruisci();
  writeFileSync(new URL("./finto.nira", import.meta.url), Buffer.from(buf));
  console.log(`finto.nira: ${strutture.length} strutture, ${(buf.byteLength/1e3).toFixed(0)} kB`);
}
