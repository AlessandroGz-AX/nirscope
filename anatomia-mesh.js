// Aggancio delle mesh anatomiche vere allo scheletro della posa.
//
// Le mesh arrivano da BodyParts3D in posizione anatomica, in un sistema di
// coordinate e con un'unita' di misura che non conosciamo a priori: potrebbero
// essere millimetri con Y in su, o qualunque altra convenzione. Qui non se ne
// assume nessuna. Verso verticale, verso laterale e posizione delle
// articolazioni vengono *dedotti dalle mesh stesse*, perche' l'alternativa —
// numeri scritti a mano — sarebbe indovinata, e su un archivio che non ho sotto
// mano indovinare significa sbagliare.
//
// Ogni struttura viene poi legata a un segmento fra due landmark. A ogni
// fotogramma si calcola la trasformazione rigida che porta il segmento a riposo
// su quello vivo e la si applica alla mesh: le ossa restano rigide, i muscoli
// si allungano lungo l'asse e si ingrossano quando si accorciano.

export const MAGIA = "NIRANAT1";

/** Legge il formato prodotto da prepara.html. */
export function leggiNira(buffer) {
  const dv = new DataView(buffer), u8 = new Uint8Array(buffer);
  const dec = new TextDecoder();
  if (dec.decode(u8.subarray(0, 8)) !== MAGIA) {
    throw new Error("Non e' un file di mesh anatomiche (manca l'intestazione).");
  }
  const n = dv.getUint32(8, true);
  if (!n || n > 4096) throw new Error("Intestazione incoerente: " + n + " strutture.");

  const out = [];
  let o = 12;
  for (let i = 0; i < n; i++) {
    if (o + 10 > buffer.byteLength) throw new Error("File troncato alla struttura " + i + ".");
    const lnNome = dv.getUint8(o), tipo = dv.getUint8(o + 1);
    const nv = dv.getUint32(o + 2, true), nt = dv.getUint32(o + 6, true);
    const nome = dec.decode(u8.subarray(o + 10, o + 10 + lnNome));
    o += 10 + lnNome + ((4 - ((lnNome + 10) % 4)) % 4);
    if (o + nv * 12 + nt * 12 > buffer.byteLength) {
      throw new Error("File troncato dentro '" + nome + "'.");
    }
    const pos = new Float32Array(buffer, o, nv * 3); o += nv * 12;
    const idx = new Uint32Array(buffer, o, nt * 3);  o += nt * 12;
    out.push({ nome, osso: tipo === 0, pos, idx });
  }
  return out;
}

// ── Algebra minima, su array semplici ──────────────────────────────
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const mul = (a, k) => [a[0]*k, a[1]*k, a[2]*k];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const n = len(a) || 1; return [a[0]/n, a[1]/n, a[2]/n]; };
const meta = (a, b) => mul(add(a, b), 0.5);

function baricentro(s) {
  let x = 0, y = 0, z = 0;
  const n = s.pos.length / 3;
  for (let i = 0; i < n; i++) { x += s.pos[i*3]; y += s.pos[i*3+1]; z += s.pos[i*3+2]; }
  return [x/n, y/n, z/n];
}

/** Estremo di una mesh lungo una direzione: baricentro della frazione di
 *  vertici piu' avanzati, non il singolo vertice piu' esterno. Un vertice solo
 *  puo' essere un artefatto della riduzione; una coda di vertici no. */
function estremo(s, dir, frazione = 0.03, verso = 1) {
  const n = s.pos.length / 3;
  const proiez = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    proiez[i] = verso * (s.pos[i*3]*dir[0] + s.pos[i*3+1]*dir[1] + s.pos[i*3+2]*dir[2]);
  }
  const ord = Array.from(proiez).sort((a, b) => b - a);
  const soglia = ord[Math.max(0, Math.min(n - 1, Math.floor(n * frazione)))];
  let x = 0, y = 0, z = 0, c = 0;
  for (let i = 0; i < n; i++) {
    if (proiez[i] >= soglia) { x += s.pos[i*3]; y += s.pos[i*3+1]; z += s.pos[i*3+2]; c++; }
  }
  return c ? [x/c, y/c, z/c] : baricentro(s);
}

/** Le due estremita' di un osso lungo, prossimale per prima.
 *  Prossimale = quella dal lato della testa: in posizione anatomica tutti gli
 *  arti pendono, quindi basta la componente verticale per distinguerle. */
function estremita(s, su) {
  return [estremo(s, su, 0.03, +1), estremo(s, su, 0.03, -1)];
}

/** Sistema di riferimento e articolazioni dedotti dalle mesh.
 *
 *  Nessuna convenzione data per scontata: ne' quale asse sia il verticale, ne'
 *  l'unita' di misura, ne' la mano del sistema di coordinate. Tutto viene da
 *  due fatti anatomici che non dipendono da come e' stato esportato l'archivio:
 *  il cranio sta sopra il bacino, e lo sterno sta davanti alla colonna.
 *
 *  I femori servono poi come controprova: se dicono il contrario, non e' la
 *  geometria a essere strana — sono le etichette destra/sinistra della mappa a
 *  essere scambiate, ed e' un errore che altrimenti passerebbe inosservato
 *  perche' uno scheletro specchiato sembra normale. */
export function derivaScheletro(mappa) {
  const avvisi = [];
  const c = (k) => mappa.has(k) ? baricentro(mappa.get(k)) : null;

  const bacino = (() => {
    const p = [c("bacino_dx"), c("bacino_sx"), c("sacro")].filter(Boolean);
    if (!p.length) return null;
    return mul(p.reduce(add, [0,0,0]), 1/p.length);
  })();
  const testa = c("cranio") || c("mandibola");
  if (!bacino || !testa) {
    throw new Error("Servono almeno bacino e cranio per orientare il modello.");
  }
  const su = norm(sub(testa, bacino));

  // Un asse laterale qualsiasi, solo per avere una terna su cui lavorare.
  const coppia = (a, b) => {
    const A = c(a), B = c(b);
    return A && B ? sub(B, A) : null;
  };
  let latGrezzo = coppia("femore_dx", "femore_sx") || coppia("scapola_dx", "scapola_sx")
                || coppia("omero_dx", "omero_sx") || coppia("bacino_dx", "bacino_sx");
  if (!latGrezzo) throw new Error("Servono le ossa pari per capire destra e sinistra.");
  let laterale = norm(sub(latGrezzo, mul(su, dot(latGrezzo, su))));   // Gram-Schmidt

  // Verso anteriore: una struttura davanti meno una dietro. Della differenza si
  // tiene solo la componente lungo il terzo asse, cioe' in pratica il segno:
  // cosi' non conta dove esattamente sia il baricentro della colonna, che non
  // e' detto stia sulla linea mediana.
  const terzo = norm(cross(su, laterale));
  const anteriori = coppia("colonna", "sterno") || coppia("trapezio_dx", "pettorale_dx")
                 || coppia("colonna", "coste") || coppia("femore_dx", "rotula_dx");
  let avanti;
  if (anteriori) {
    const segno = dot(anteriori, terzo);
    if (Math.abs(segno) < len(anteriori) * 0.05) {
      avvisi.push("il verso anteriore e' incerto: le strutture di riferimento sono quasi allineate");
    }
    avanti = segno >= 0 ? terzo : mul(terzo, -1);
  } else {
    avvisi.push("nessuna struttura utile a stabilire il davanti: assunto per convenzione");
    avanti = terzo;
  }

  // Ora il laterale si ricava dalla terna anatomica, e i femori diventano la
  // controprova. Se non concordano, la mappa ha destra e sinistra scambiate.
  //
  // L'ordine del prodotto vettore non e' indifferente: cross(su, avanti) da' la
  // sinistra del soggetto con la stessa mano dello spazio vivo, dove laterale,
  // su e avanti sono x, y, z. Scritto al contrario da' la destra, e sui dati
  // veri di BodyParts3D faceva scattare un allarme di lati scambiati che non
  // c'era — le prove non lo vedevano perche' il modello sintetico era
  // specchiato quanto la formula.
  const lateraleAnat = norm(cross(su, avanti));            // verso la sua sinistra
  const scambiaLati = dot(lateraleAnat, laterale) < 0;
  if (scambiaLati) {
    avvisi.push("le etichette destra/sinistra della mappa risultano scambiate rispetto "
              + "all'anatomia: le strutture vengono agganciate al lato opposto");
  }
  laterale = lateraleAnat;

  const separazione = len(latGrezzo), altezza = len(sub(testa, bacino));
  if (separazione < altezza * 0.02) {
    avvisi.push("le ossa pari risultano quasi sovrapposte: la mappa destra/sinistra e' sospetta");
  }

  // Articolazioni dalle estremita' delle ossa lunghe.
  const A = {};
  const lungo = (nome) => mappa.has(nome) ? estremita(mappa.get(nome), su) : null;
  for (const lato of ["dx", "sx"]) {
    const fem = lungo("femore_" + lato), tib = lungo("tibia_" + lato);
    const ome = lungo("omero_" + lato), rad = lungo("radio_" + lato) || lungo("ulna_" + lato);
    if (fem) { A["anca_" + lato] = fem[0]; A["ginocchio_" + lato] = fem[1]; }
    if (tib) {
      // Il ginocchio lo vedono sia il femore che la tibia: la media dei due e'
      // piu' stabile di uno solo.
      A["ginocchio_" + lato] = fem ? meta(fem[1], tib[0]) : tib[0];
      A["caviglia_" + lato] = tib[1];
    }
    if (ome) { A["spalla_" + lato] = ome[0]; A["gomito_" + lato] = ome[1]; }
    if (rad) {
      A["gomito_" + lato] = ome ? meta(ome[1], rad[0]) : rad[0];
      A["polso_" + lato] = rad[1];
    }
    for (const g of ["anca", "ginocchio", "caviglia", "spalla", "gomito", "polso"]) {
      if (!A[g + "_" + lato]) avvisi.push(`manca l'osso per ricavare ${g} ${lato}`);
    }
  }

  if (A.anca_dx && A.anca_sx) A.midAnche = meta(A.anca_dx, A.anca_sx);
  if (A.spalla_dx && A.spalla_sx) A.midSpalle = meta(A.spalla_dx, A.spalla_sx);
  if (!A.midAnche) A.midAnche = bacino;
  if (!A.midSpalle) A.midSpalle = add(bacino, mul(su, len(sub(testa, bacino)) * 0.62));
  A.testa = testa;

  return { su, laterale, avanti, ancore: A, bacino, avvisi, scambiaLati,
           altezzaTronco: len(sub(A.midSpalle, A.midAnche)) };
}

/** Nome della struttura col lato scambiato, quando la mappa risulta specchiata. */
const altroLato = (n) => n.endsWith("_dx") ? n.slice(0, -3) + "_sx"
                       : n.endsWith("_sx") ? n.slice(0, -3) + "_dx" : n;

// ── A quale segmento e' legata ogni struttura ──────────────────────
// Il tronco (colonna, coste, bacino, scapole…) segue il segmento anche-spalle;
// gli arti seguono l'osso che li porta. Un muscolo biarticolare viene legato al
// segmento su cui giace il ventre: la lunghezza vera la misura comunque il
// modello cinematico, qui si decide solo dove sta la carne.
const TRONCO = "tronco", TESTA = "testa";
const perLato = (lato) => ({
  ["omero_" + lato]:        "omero_" + lato,
  ["radio_" + lato]:        "avambraccio_" + lato,
  ["ulna_" + lato]:         "avambraccio_" + lato,
  ["scapola_" + lato]:      TRONCO,
  ["clavicola_" + lato]:    TRONCO,
  ["bacino_" + lato]:       TRONCO,
  ["femore_" + lato]:       "femore_" + lato,
  ["rotula_" + lato]:       "femore_" + lato,
  ["tibia_" + lato]:        "tibia_" + lato,
  ["perone_" + lato]:       "tibia_" + lato,

  ["deltoide_" + lato]:     "omero_" + lato,
  ["bicipite_" + lato]:     "omero_" + lato,
  ["tricipite_" + lato]:    "omero_" + lato,
  ["brachioradiale_" + lato]: "avambraccio_" + lato,
  ["pettorale_" + lato]:    TRONCO,
  ["dentato_" + lato]:      TRONCO,
  ["trapezio_" + lato]:     TRONCO,
  ["obliquo_" + lato]:      TRONCO,
  ["gluteo_" + lato]:       "femore_" + lato,
  ["adduttore_" + lato]:    "femore_" + lato,
  ["retto_femorale_" + lato]: "femore_" + lato,
  ["vasto_" + lato]:        "femore_" + lato,
  ["bicipite_fem_" + lato]: "femore_" + lato,
  ["semitendinoso_" + lato]: "femore_" + lato,
  ["gastrocnemio_" + lato]: "tibia_" + lato,
  ["soleo_" + lato]:        "tibia_" + lato,
  ["tibiale_ant_" + lato]:  "tibia_" + lato,
});

export const LEGAMI = {
  colonna: TRONCO, coste: TRONCO, sterno: TRONCO, sacro: TRONCO,
  cranio: TESTA, mandibola: TESTA,
  ...perLato("dx"), ...perLato("sx"),
};

// Ogni segmento: le due ancore a riposo e i due landmark vivi che lo guidano.
// I landmark sono gli indici di MediaPipe Pose.
export const SEGMENTI = {
  tronco:          { ancore: ["midAnche", "midSpalle"], lm: ["midAnche", "midSpalle"] },
  // Il cranio e' rigido: la sua dimensione segue la corporatura, non la
  // distanza naso-spalle, che cambia solo perche' si inclina la testa. Senza
  // questo la testa si allunga fino a sembrare un uovo.
  testa:           { ancore: ["midSpalle", "testa"],    lm: ["midSpalle", "naso"], rigido: true },
  omero_dx:        { ancore: ["spalla_dx", "gomito_dx"],   lm: [12, 14] },
  omero_sx:        { ancore: ["spalla_sx", "gomito_sx"],   lm: [11, 13] },
  avambraccio_dx:  { ancore: ["gomito_dx", "polso_dx"],    lm: [14, 16] },
  avambraccio_sx:  { ancore: ["gomito_sx", "polso_sx"],    lm: [13, 15] },
  femore_dx:       { ancore: ["anca_dx", "ginocchio_dx"],  lm: [24, 26] },
  femore_sx:       { ancore: ["anca_sx", "ginocchio_sx"],  lm: [23, 25] },
  tibia_dx:        { ancore: ["ginocchio_dx", "caviglia_dx"], lm: [26, 28] },
  tibia_sx:        { ancore: ["ginocchio_sx", "caviglia_sx"], lm: [25, 27] },
};

/** Terna ortonormale di un segmento: l'asse, piu' due direzioni trasversali
 *  agganciate a un riferimento esterno per non ruotare a caso attorno all'asse. */
export function frameSegmento(a, b, rifSu, rifAvanti) {
  const asse = norm(sub(b, a));
  // Se l'asse e' quasi parallelo al riferimento verticale, il prodotto vettore
  // degenera: si passa all'altro riferimento.
  let lat = cross(rifSu, asse);
  if (len(lat) < 0.15) lat = cross(rifAvanti, asse);
  lat = norm(lat);
  return { asse, laterale: lat, avanti: norm(cross(asse, lat)) };
}

/** Prepara, per ogni struttura, quel che serve a posizionarla a ogni
 *  fotogramma: il segmento, le ancore a riposo, la terna a riposo e la
 *  lunghezza a riposo. */
export function preparaLegami(strutture, sk) {
  const fuori = [];
  const pronte = [];
  for (const s of strutture) {
    // Se i lati sono scambiati si aggancia al segmento dell'altro lato: la mesh
    // di quello che la mappa chiama femore destro sta davvero sulla gamba
    // sinistra, e li' deve seguire i landmark.
    const chiave = sk.scambiaLati ? altroLato(s.nome) : s.nome;
    const nomeSeg = LEGAMI[chiave];
    const seg = nomeSeg && SEGMENTI[nomeSeg];
    if (!seg) { fuori.push(s.nome); continue; }
    const a = sk.ancore[seg.ancore[0]], b = sk.ancore[seg.ancore[1]];
    if (!a || !b) { fuori.push(s.nome); continue; }
    const L = len(sub(b, a));
    if (!(L > 1e-9)) { fuori.push(s.nome); continue; }
    pronte.push({
      ...s, segmento: nomeSeg, lm: seg.lm,
      ancoraA: a, lunghezzaRiposo: L,
      frame: frameSegmento(a, b, sk.su, sk.avanti),
    });
  }
  return { pronte, fuori };
}

/** Matrice che porta la struttura dalla posizione anatomica alla posa viva.
 *
 *  Si costruisce come: porta l'ancora prossimale nell'origine, esprimi tutto
 *  nella terna del segmento a riposo, scala, rientra nella terna del segmento
 *  vivo, trasla sull'ancora viva. Lungo l'asse la scala e' quella che fa
 *  combaciare le due estremita'; di traverso e' la scala generale del corpo,
 *  cosi' le ossa non si assottigliano quando l'arto e' scorciato dalla
 *  prospettiva.
 *
 *  Restituisce 16 numeri per colonne, come li vuole Matrix4.
 *
 *  `ingrosso` moltiplica le sole direzioni trasversali: serve ai ventri
 *  muscolari, che si gonfiano accorciandosi. */
export function matricePosa(l, a1, b1, rifSu, rifAvanti, scalaCorpo, ingrosso = 1, rigido = false) {
  const L1 = len(sub(b1, a1));
  if (!(L1 > 1e-9)) return null;
  const F1 = frameSegmento(a1, b1, rifSu, rifAvanti);
  const F0 = l.frame;

  // La scala lungo l'asse segue la lunghezza vera del segmento, ma con un
  // limite: i landmark tremolano e un arto quasi puntato verso l'obiettivo
  // viene stimato corto, il che senza freno stirerebbe l'osso a fisarmonica.
  const kA = rigido ? scalaCorpo
    : Math.max(scalaCorpo * 0.7, Math.min(scalaCorpo * 1.4, L1 / l.lunghezzaRiposo));
  const kL = scalaCorpo * ingrosso;
  const S = [kL, kA, kL];

  // M3 = F1 · S · F0ᵀ, dove le colonne di F sono laterale, asse, avanti.
  const c0 = [F0.laterale, F0.asse, F0.avanti];
  const c1 = [F1.laterale, F1.asse, F1.avanti];
  const M3 = [[0,0,0],[0,0,0],[0,0,0]];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += c1[k][r] * S[k] * c0[k][c];
      M3[r][c] = v;
    }
  }
  const a0 = l.ancoraA;
  const t = [
    a1[0] - (M3[0][0]*a0[0] + M3[0][1]*a0[1] + M3[0][2]*a0[2]),
    a1[1] - (M3[1][0]*a0[0] + M3[1][1]*a0[1] + M3[1][2]*a0[2]),
    a1[2] - (M3[2][0]*a0[0] + M3[2][1]*a0[1] + M3[2][2]*a0[2]),
  ];
  return [M3[0][0], M3[1][0], M3[2][0], 0,
          M3[0][1], M3[1][1], M3[2][1], 0,
          M3[0][2], M3[1][2], M3[2][2], 0,
          t[0], t[1], t[2], 1];
}

/** Applica una matrice a un punto. Utile alle prove e al posizionamento. */
export function applica(M, p) {
  return [
    M[0]*p[0] + M[4]*p[1] + M[8]*p[2]  + M[12],
    M[1]*p[0] + M[5]*p[1] + M[9]*p[2]  + M[13],
    M[2]*p[0] + M[6]*p[1] + M[10]*p[2] + M[14],
  ];
}
