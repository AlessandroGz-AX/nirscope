// Costruisce anatomia.nira senza BodyParts3D.
//
// L'archivio vero e' irraggiungibile da qui e il suo formato l'ho sbagliato
// quattro volte di fila, quindi le mesh si fanno a codice. Non e' un atlante:
// e' un modello stilizzato, ma con le forme giuste — il femore ha testa, collo,
// grande trocantere e condili, la scapola e' una lama, le coste sono archi, e i
// ventri muscolari sono fusi che si assottigliano ai capi invece di bastoni.
//
// Tutto in posizione anatomica, in centimetri, con x verso la sinistra del
// soggetto, y in avanti e z in alto. Il resto della catena non cambia: e'
// anatomia-mesh.js a dedurre assi, scala e articolazioni dalla geometria, come
// farebbe con l'archivio vero.
import { writeFileSync } from "node:fs";

// ── Costruzione ────────────────────────────────────────────────────
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const mul = (a, k) => [a[0]*k, a[1]*k, a[2]*k];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const lung = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const n = lung(a) || 1; return [a[0]/n, a[1]/n, a[2]/n]; };
const fra = (a, b, t) => [0,1,2].map(i => a[i] + (b[i]-a[i]) * t);

class Mesh {
  constructor() { this.V = []; this.F = []; }
  v(p) { this.V.push(p); return this.V.length - 1; }
  f(a, b, c) { this.F.push([a, b, c]); }
  quad(a, b, c, d) { this.f(a, b, c); this.f(a, c, d); }
  unisci(m) {
    const base = this.V.length;
    for (const p of m.V) this.V.push(p);
    for (const [a, b, c] of m.F) this.F.push([a + base, b + base, c + base]);
    return this;
  }
  get triangoli() { return this.F.length; }
}

/** Interpola una polilinea in `n` stazioni con spaziatura uniforme, cosi' che
 *  un profilo di raggi definito su [0,1] cada dove ci si aspetta. */
function ricampiona(punti, n) {
  const d = [0];
  for (let i = 1; i < punti.length; i++) d.push(d[i-1] + lung(sub(punti[i], punti[i-1])));
  const tot = d[d.length-1];
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = tot * i / (n - 1);
    let j = 1;
    while (j < d.length - 1 && d[j] < s) j++;
    const t = (s - d[j-1]) / ((d[j] - d[j-1]) || 1);
    out.push(fra(punti[j-1], punti[j], t));
  }
  return out;
}

/** Tubo a sezione ellittica lungo un percorso.
 *
 *  La terna trasversale viene trasportata da una stazione all'altra invece di
 *  essere ricostruita ogni volta: ricostruendola, dove il percorso curva la
 *  sezione ruota su se stessa e la superficie si attorciglia. */
function tubo(percorso, raggio, { lati = 12, stazioni = 14, rif = [0, 1, 0] } = {}) {
  const P = ricampiona(percorso, stazioni);
  const m = new Mesh();
  let normale = null;
  const anelli = [];
  for (let i = 0; i < P.length; i++) {
    const t = norm(sub(P[Math.min(i+1, P.length-1)], P[Math.max(i-1, 0)]));
    if (!normale) {
      let n = cross(t, rif);
      if (lung(n) < 1e-3) n = cross(t, [1, 0, 0]);
      normale = norm(n);
    } else {
      normale = norm(sub(normale, mul(t, dot(normale, t))));   // riproietta
    }
    const bin = norm(cross(t, normale));
    const s = i / (P.length - 1);
    const r = typeof raggio === "function" ? raggio(s) : raggio;
    const [ra, rb] = Array.isArray(r) ? r : [r, r];
    const anello = [];
    for (let k = 0; k < lati; k++) {
      const a = 2 * Math.PI * k / lati;
      anello.push(m.v(add(P[i], add(mul(normale, ra * Math.cos(a)), mul(bin, rb * Math.sin(a))))));
    }
    anelli.push(anello);
  }
  for (let i = 0; i < anelli.length - 1; i++) {
    for (let k = 0; k < lati; k++) {
      const k2 = (k + 1) % lati;
      m.quad(anelli[i][k], anelli[i][k2], anelli[i+1][k2], anelli[i+1][k]);
    }
  }
  // Tappi, altrimenti la mesh e' aperta e le normali all'estremita' sbagliano
  for (const [anello, fine] of [[anelli[0], false], [anelli[anelli.length-1], true]]) {
    const c = m.v(anello.reduce((a, i) => add(a, m.V[i]), [0,0,0]).map(x => x / lati));
    for (let k = 0; k < lati; k++) {
      const k2 = (k + 1) % lati;
      if (fine) m.f(c, anello[k], anello[k2]); else m.f(c, anello[k2], anello[k]);
    }
  }
  return m;
}

/** Sfera o ellissoide, per teste articolari, condili e tuberosita'. */
function sfera(centro, raggi, suddiv = 2) {
  const t = (1 + 5 ** 0.5) / 2;
  let V = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],
           [t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(v => norm(v));
  let F = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],
           [10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],
           [2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for (let s = 0; s < suddiv; s++) {
    const memo = new Map(), nuove = [];
    const mezzo = (a, b) => {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      if (!memo.has(k)) { V.push(norm(mul(add(V[a], V[b]), 0.5))); memo.set(k, V.length - 1); }
      return memo.get(k);
    };
    for (const [a, b, c] of F) {
      const ab = mezzo(a,b), bc = mezzo(b,c), ca = mezzo(c,a);
      nuove.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
    }
    F = nuove;
  }
  const r = Array.isArray(raggi) ? raggi : [raggi, raggi, raggi];
  const m = new Mesh();
  for (const v of V) m.v([centro[0] + v[0]*r[0], centro[1] + v[1]*r[1], centro[2] + v[2]*r[2]]);
  for (const [a,b,c] of F) m.f(a, b, c);
  return m;
}

/** Lastra a spessore: serve alle ossa piatte — scapola, ala iliaca, sterno.
 *  Il contorno e' una lista di punti su un piano, dati come [u, v]. */
function lastra(contorno, origine, asseU, asseV, spessore) {
  const n = norm(cross(asseU, asseV));
  const m = new Mesh();
  const su = [], giu = [];
  for (const [u, v] of contorno) {
    const p = add(origine, add(mul(asseU, u), mul(asseV, v)));
    su.push(m.v(add(p, mul(n, spessore / 2))));
    giu.push(m.v(sub(p, mul(n, spessore / 2))));
  }
  const cs = m.v(add(su.reduce((a,i)=>add(a,m.V[i]),[0,0,0]).map(x=>x/su.length), [0,0,0]));
  const cg = m.v(add(giu.reduce((a,i)=>add(a,m.V[i]),[0,0,0]).map(x=>x/giu.length), [0,0,0]));
  const N = contorno.length;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    m.f(cs, su[i], su[j]);
    m.f(cg, giu[j], giu[i]);
    m.quad(su[i], giu[i], giu[j], su[j]);
  }
  return m;
}

/** Profilo fusiforme: sottile ai capi tendinei, pieno nel ventre. E' la forma
 *  che distingue un muscolo da un bastone. */
const fuso = (rMax, capo = 0.28) => (s) => {
  const f = Math.sin(Math.PI * Math.min(1, Math.max(0, s))) ** 0.65;
  return rMax * (capo + (1 - capo) * f);
};

// ── Il corpo ───────────────────────────────────────────────────────
// Statura 175 cm. Le articolazioni sono le stesse che usa il modello
// cinematico, cosi' le estremita' delle ossa lunghe ci cadono sopra.
const G = {
  anca:      (s) => [s * 9,    0, 95],
  ginocchio: (s) => [s * 9.5,  0, 51],
  caviglia:  (s) => [s * 9.5,  0, 8],
  spalla:    (s) => [s * 19,   0, 143],
  gomito:    (s) => [s * 21,   0, 113],
  polso:     (s) => [s * 22,   0, 85],
};
const LATI = [["dx", -1], ["sx", +1]];
const S = {};                      // nome → Mesh

// Curva della colonna: lordosi lombare in avanti, cifosi toracica indietro.
const vertebraZ = (i) => 97 + i * (146 - 97) / 23;
const vertebraY = (i) => {
  const t = i / 23;
  return -2.5 + 4.5 * Math.sin(Math.PI * t * 0.9) * (t < 0.45 ? 1 : -0.55);
};
const vertebra = (i) => [0, vertebraY(i), vertebraZ(i)];

// ── Cranio e mandibola ──
S.cranio = new Mesh()
  .unisci(sfera([0, -0.5, 163], [7.6, 8.4, 8.8], 3))
  .unisci(sfera([0, 5.5, 158], [5.2, 4.2, 5.0], 2))          // massiccio facciale
  .unisci(tubo([[0, -1, 154], [0, -1, 148.5]], 2.6, { lati: 10, stazioni: 4 }));  // occipite-atlante
S.mandibola = new Mesh()
  .unisci(tubo([[-5.4, 1.5, 154.5], [-4.6, 6.2, 152.2], [0, 8.0, 151.6],
                [4.6, 6.2, 152.2], [5.4, 1.5, 154.5]], (s) => [1.1, 1.5 - 0.4 * Math.abs(s - 0.5)],
               { lati: 10, stazioni: 16 }))
  .unisci(tubo([[-5.4, 1.5, 154.5], [-5.6, 0.5, 158.5]], 1.0, { lati: 8, stazioni: 4 }))
  .unisci(tubo([[5.4, 1.5, 154.5], [5.6, 0.5, 158.5]], 1.0, { lati: 8, stazioni: 4 }));

// ── Colonna: corpo, processo spinoso e trasversi per ogni vertebra ──
S.colonna = new Mesh();
for (let i = 0; i < 24; i++) {
  const c = vertebra(i);
  const r = 1.5 + 0.9 * (1 - i / 23);                        // lombari piu' grosse
  S.colonna.unisci(tubo([add(c, [0,0,-0.9]), add(c, [0,0,0.9])], [r, r * 0.85],
                        { lati: 10, stazioni: 3 }));
  S.colonna.unisci(tubo([add(c, [0,-r*0.6,0]), add(c, [0, -r - 2.2, -1.1])],
                        (s) => 0.75 - 0.35 * s, { lati: 8, stazioni: 4 }));   // spinoso
  for (const s of [-1, 1]) {
    S.colonna.unisci(tubo([add(c, [0,-r*0.4,0]), add(c, [s * (r + 1.4), -r * 0.8, 0.2])],
                          0.6, { lati: 6, stazioni: 3 }));
  }
}

// ── Coste e sterno ──
S.sterno = lastra([[-1.6,-8],[1.6,-8],[2.0,0],[1.5,6],[-1.5,6],[-2.0,0]],
                  [0, 9.6, 128], [1,0,0], [0,0,1], 1.3);
S.coste = new Mesh();
for (let i = 0; i < 12; i++) {
  const t = i / 11;
  const zPost = vertebraZ(23 - Math.round(t * 11) - 1);
  const largh = 12 + 5.5 * Math.sin(Math.PI * (0.25 + t * 0.62));
  const zAnt = zPost - 5 - t * 5;
  const avanti = 9.2 - t * 1.2;
  for (const [, s] of LATI) {
    const p = [
      [s * 1.8, vertebraY(23 - Math.round(t * 11) - 1) - 1.2, zPost],
      [s * largh * 0.62, -1.5, zPost - 1.2],
      [s * largh, 3.0, zPost - 3.0],
      [s * largh * 0.72, avanti - 1.5, zAnt + 0.5],
      [s * 2.4, avanti, zAnt],
    ];
    // Le ultime due paia sono fluttuanti: si fermano prima dello sterno.
    S.coste.unisci(tubo(i >= 10 ? p.slice(0, 3) : p, (u) => [0.62 - 0.18 * u, 0.42],
                        { lati: 8, stazioni: i >= 10 ? 8 : 16 }));
  }
}

// ── Sacro e bacino ──
S.sacro = new Mesh()
  .unisci(tubo([[0, -3.4, 99.5], [0, -1.6, 91]], (s) => [4.4 - 2.6 * s, 1.9 - 0.7 * s],
               { lati: 12, stazioni: 8 }));
for (const [lato, s] of LATI) {
  const ala = lastra(
    [[-0.5,-6.5],[4.5,-5.0],[7.0,-0.5],[6.0,4.5],[2.0,7.0],[-2.5,5.5],[-3.5,0.5]],
    [s * 10.5, -0.5, 103], [0, 1, 0], [0, 0, 1], 1.5);                 // ala iliaca
  S["bacino_" + lato] = new Mesh().unisci(ala)
    .unisci(tubo([[s*11, 1.5, 97.5], [s*9.5, 2.0, 92.5], [s*5.5, 3.5, 89.5],
                  [s*1.5, 4.2, 90.5]], (u) => [1.5 - 0.4*u, 1.6 - 0.4*u],
                 { lati: 10, stazioni: 12 }))                          // ramo ischio-pubico
    .unisci(sfera([s * 9.6, 0.4, 95], [2.9, 2.9, 2.6], 2));            // acetabolo
}

// ── Cingolo scapolare ──
for (const [lato, s] of LATI) {
  S["scapola_" + lato] = new Mesh()
    .unisci(lastra([[-4.5,-7.5],[3.5,-6.0],[4.5,1.0],[2.0,6.5],[-3.0,5.5],[-5.0,-1.0]],
                   [s * 13, -5.5, 139], [s, 0, 0], [0, 0, 1], 1.0))
    .unisci(tubo([[s*7, -5.0, 143.5], [s*16.5, -4.0, 144.5]], (u) => [1.1, 1.6 - 0.5*u],
                 { lati: 8, stazioni: 6 }))                            // spina scapolare
    .unisci(sfera([s * 17.5, -1.5, 143], [2.4, 2.2, 2.6], 2));         // glena
  S["clavicola_" + lato] = tubo(
    [[s*0.8, 6.2, 146.5], [s*6, 7.0, 146.8], [s*12, 5.2, 145.6], [s*17, 2.2, 144.2]],
    (u) => [0.85 + 0.25*u, 0.75 + 0.2*u], { lati: 8, stazioni: 12 });
}

// ── Arto superiore ──
for (const [lato, s] of LATI) {
  const sp = G.spalla(s), go = G.gomito(s), po = G.polso(s);
  S["omero_" + lato] = new Mesh()
    .unisci(sfera(sp, [2.6, 2.4, 2.5], 2))                             // testa omerale
    .unisci(tubo([add(sp, [s*0.6, 0, -2.2]), fra(sp, go, 0.45), add(go, [0, 0, 1.5])],
                 (u) => [1.55 - 0.35*Math.sin(Math.PI*u), 1.5 - 0.3*Math.sin(Math.PI*u)],
                 { lati: 12, stazioni: 14 }))
    .unisci(sfera(add(go, [s*1.6, 0, 0.4]), [1.7, 1.7, 1.5], 2))       // epicondilo
    .unisci(sfera(add(go, [-s*1.5, 0, 0.4]), [1.5, 1.5, 1.4], 2));     // epitroclea
  S["radio_" + lato] = new Mesh()
    .unisci(tubo([add(go, [s*1.2, 0.6, -0.8]), fra(go, po, 0.5), add(po, [s*1.4, 0.4, 0.2])],
                 (u) => [0.75 + 0.5*u*u, 0.7 + 0.4*u*u], { lati: 10, stazioni: 12 }));
  S["ulna_" + lato] = new Mesh()
    .unisci(tubo([add(go, [-s*1.0, -1.6, 2.2]), add(go, [-s*1.0, -0.4, -0.6]),
                  fra(go, po, 0.55), add(po, [-s*1.3, 0.2, 0.4])],
                 (u) => [1.25 - 0.75*Math.min(1, u*2.2), 1.15 - 0.65*Math.min(1, u*2.2)],
                 { lati: 10, stazioni: 14 }));                         // olecrano poi affusolata
}

// ── Arto inferiore ──
for (const [lato, s] of LATI) {
  const an = G.anca(s), gi = G.ginocchio(s), ca = G.caviglia(s);
  const troc = [s * 15, 0, 90.5];
  S["femore_" + lato] = new Mesh()
    .unisci(sfera(an, [2.5, 2.5, 2.4], 2))                             // testa
    .unisci(tubo([an, fra(an, troc, 0.6)], 1.5, { lati: 10, stazioni: 4 }))   // collo
    .unisci(sfera(troc, [2.2, 2.0, 2.6], 2))                           // grande trocantere
    .unisci(tubo([add(troc, [0,0,-1]), [s*13, -0.8, 75], [s*11, -0.4, 60], add(gi, [0,0,2.5])],
                 (u) => [1.75 - 0.45*Math.sin(Math.PI*u), 1.7 - 0.4*Math.sin(Math.PI*u)],
                 { lati: 12, stazioni: 16 }))
    .unisci(sfera(add(gi, [s*2.2, -0.3, 0.6]), [2.1, 2.5, 2.3], 2))    // condilo laterale
    .unisci(sfera(add(gi, [-s*2.2, -0.3, 0.6]), [2.1, 2.5, 2.3], 2));  // condilo mediale
  S["rotula_" + lato] = lastra([[-2.2,-2.4],[2.2,-2.4],[2.6,1.2],[0,3.0],[-2.6,1.2]],
                               add(gi, [0, 3.4, 1.2]), [s,0,0], [0,0,1], 1.6);
  S["tibia_" + lato] = new Mesh()
    .unisci(tubo([add(gi, [-s*2.4, 0, -0.4]), add(gi, [s*2.4, 0, -0.4])], [2.3, 2.2],
                 { lati: 10, stazioni: 3 }))                           // piatto tibiale
    .unisci(tubo([add(gi, [0, 0.6, -1.2]), [s*9.5, 0.9, 35], add(ca, [s*0.4, 0.2, 1.2])],
                 (u) => [1.65 - 0.55*Math.sin(Math.PI*u), 1.5 - 0.4*Math.sin(Math.PI*u)],
                 { lati: 12, stazioni: 14 }))
    .unisci(sfera(add(ca, [-s*1.6, 0, 0.6]), [1.4, 1.5, 2.0], 2));     // malleolo mediale
  S["perone_" + lato] = new Mesh()
    .unisci(tubo([add(gi, [s*3.2, -0.4, -2.2]), [s*12.2, 0.2, 32], add(ca, [s*2.6, 0, 0.4])],
                 (u) => [0.72 + 0.35*u*u, 0.68 + 0.3*u*u], { lati: 8, stazioni: 12 }))
    .unisci(sfera(add(ca, [s*2.6, 0, 0.2]), [1.2, 1.3, 1.9], 2));      // malleolo laterale
}

// ── Muscoli: ventri fusiformi lungo i loro percorsi ──
// I percorsi rispecchiano quelli del modello cinematico, cosi' i capi cadono
// sulle inserzioni giuste e la mesh finisce dove finiva il cilindro.
const M = {};
for (const [lato, s] of LATI) {
  const sp = G.spalla(s), go = G.gomito(s), po = G.polso(s);
  const an = G.anca(s), gi = G.ginocchio(s), ca = G.caviglia(s);
  const L = (k) => k + "_" + lato;

  M[L("deltoide")]  = [[add(sp, [s*1.5, -3.5, 3.5]), add(sp, [s*4.5, 0, 1]),
                        add(sp, [s*2.5, 3.5, 3.0]), fra(sp, go, 0.42)], 3.9, 0.18];
  M[L("bicipite")]  = [[add(sp, [0, 2.6, -1.5]), fra(add(sp,[0,3.4,0]), add(go,[0,3.0,0]), 0.5),
                        fra(go, po, 0.14)], 3.1, 0.22];
  M[L("tricipite")] = [[add(sp, [0, -3.0, -1.5]), fra(add(sp,[0,-3.6,0]), add(go,[0,-3.2,0]), 0.5),
                        add(go, [0, -2.0, 1.6])], 3.2, 0.22];
  M[L("brachioradiale")] = [[add(go, [s*1.8, 2.2, -1.5]), fra(go, po, 0.4).map((v,i)=>v+[s*1.6,2.4,0][i]),
                            add(po, [s*0.8, 1.4, 0])], 2.0, 0.2];
  M[L("pettorale")] = [[[s*1.5, 8.5, 132], [s*7, 8.0, 134], add(sp, [-s*1.5, 5.0, -1])], 4.2, 0.25];
  M[L("dentato")]   = [[[s*10, 2.0, 130], [s*13, 1.5, 124], [s*11, 0.5, 118]], 2.6, 0.3];
  M[L("trapezio")]  = [[[0, -4.0, 150], [s*7, -6.0, 143], add(sp, [-s*2, -4.0, 0])], 4.0, 0.28];
  M[L("obliquo")]   = [[add(sp, [-s*3, 3.0, -14]), [s*11, 4.5, 112], [s*8, 4.0, 100]], 3.4, 0.3];
  M[L("gluteo")]    = [[[s*4, -6.0, 100], [s*11, -7.5, 96], add(an, [s*2.5, -3.5, -6])], 4.6, 0.3];
  M[L("adduttore")] = [[[s*3.5, 1.5, 91], fra(an, gi, 0.45).map((v,i)=>v+[-s*2.5,0.5,0][i]),
                        add(gi, [-s*2.0, 0, 6])], 3.4, 0.24];
  M[L("retto_femorale")] = [[add(an, [0, 3.2, -2]), fra(an, gi, 0.5).map((v,i)=>v+[0,4.4,0][i]),
                            add(gi, [0, 3.2, 2])], 3.2, 0.22];
  M[L("vasto")]     = [[add(an, [s*3.5, 1.5, -6]), fra(an, gi, 0.55).map((v,i)=>v+[s*3.2,2.8,0][i]),
                        add(gi, [s*1.5, 2.6, 3])], 4.0, 0.24];
  M[L("bicipite_fem")] = [[add(an, [s*1.5, -3.5, -3]), fra(an, gi, 0.5).map((v,i)=>v+[s*2.0,-4.2,0][i]),
                           add(gi, [s*2.2, -2.4, 1])], 3.1, 0.22];
  M[L("semitendinoso")] = [[add(an, [-s*1.0, -3.5, -3]), fra(an, gi, 0.55).map((v,i)=>v+[-s*2.0,-4.0,0][i]),
                            add(gi, [-s*2.0, -2.2, 0])], 2.4, 0.2];
  M[L("gastrocnemio")] = [[add(gi, [-s*2.4, -3.2, 1]), add(gi, [s*2.4, -3.2, 1]),
                           fra(gi, ca, 0.3).map((v,i)=>v+[0,-4.2,0][i]),
                           add(ca, [0, -2.0, 1])], 4.2, 0.16];
  M[L("soleo")]     = [[fra(gi, ca, 0.22).map((v,i)=>v+[0,-2.8,0][i]),
                        fra(gi, ca, 0.5).map((v,i)=>v+[0,-3.6,0][i]),
                        add(ca, [0, -1.8, 0.5])], 3.3, 0.18];
  M[L("tibiale_ant")] = [[fra(gi, ca, 0.12).map((v,i)=>v+[s*1.8,2.6,0][i]),
                          fra(gi, ca, 0.5).map((v,i)=>v+[s*1.4,3.0,0][i]),
                          add(ca, [s*0.4, 1.6, 0.5])], 2.3, 0.16];
}
for (const [nome, [percorso, rMax, capo]] of Object.entries(M)) {
  S[nome] = tubo(percorso, fuso(rMax, capo), { lati: 12, stazioni: 16 });
}

// ── Scrittura ──────────────────────────────────────────────────────
const OSSA = new Set(["bacino","clavicola","colonna","coste","cranio","femore","mandibola",
                      "omero","perone","radio","rotula","sacro","scapola","sterno","tibia","ulna"]);
const base = (k) => k.endsWith("_dx") || k.endsWith("_sx") ? k.slice(0, -3) : k;

export function costruisci() {
  const strutture = Object.entries(S).map(([nome, m]) => {
    const pos = new Float32Array(m.V.length * 3);
    m.V.forEach((p, i) => { pos[i*3] = p[0]; pos[i*3+1] = p[1]; pos[i*3+2] = p[2]; });
    const idx = new Uint32Array(m.F.length * 3);
    m.F.forEach((f, i) => { idx[i*3] = f[0]; idx[i*3+1] = f[1]; idx[i*3+2] = f[2]; });
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const { buf, strutture } = costruisci();
  const dest = new URL("../anatomia.nira", import.meta.url);
  writeFileSync(dest, Buffer.from(buf));
  const tri = strutture.reduce((a, s) => a + s.idx.length / 3, 0);
  const ossa = strutture.filter(s => s.osso).length;
  console.log(`${strutture.length} strutture (${ossa} ossa, ${strutture.length - ossa} muscoli)`);
  console.log(`${tri.toLocaleString("it")} triangoli, ${(buf.byteLength/1e6).toFixed(2)} MB`);
}
