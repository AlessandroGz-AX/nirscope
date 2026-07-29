// Modello muscolare cinematico.
//
// Ogni muscolo e' una polilinea fra punti di attacco ancorati ai landmark della
// posa. I punti si esprimono nel sistema di riferimento del corpo — laterale,
// verticale, anteriore — e non in quello della fotocamera: cosi' un muscolo
// posteriore resta posteriore anche se il soggetto si gira, mentre con offset
// in coordinate immagine finirebbe davanti al torace appena ruota di novanta
// gradi.
//
// La lunghezza della polilinea approssima la lunghezza muscolo-tendinea. Il suo
// rapporto con la lunghezza a riposo dice se il muscolo si sta accorciando
// (contrazione concentrica) o allungando. E' la stessa grandezza che un
// simulatore muscoloscheletrico calcola come primo passo dagli angoli
// articolari; da li' in poi servirebbe la dinamica inversa per arrivare alle
// forze, e quella da un video non si ricava.

// Indici dei landmark di MediaPipe Pose
export const LM = {
  naso: 0,
  spallaSx: 11, spallaDx: 12,
  gomitoSx: 13, gomitoDx: 14,
  polsoSx: 15, polsoDx: 16,
  ancaSx: 23, ancaDx: 24,
  ginocchioSx: 25, ginocchioDx: 26,
  cavigliaSx: 27, cavigliaDx: 28,
  talloneSx: 29, talloneDx: 30,
  puntaSx: 31, puntaDx: 32,
};

// Regioni per il riconoscimento di cosa e' inquadrato.
export const REGIONI = [
  { nome: "Braccio destro",  punti: [12, 14, 16] },
  { nome: "Braccio sinistro", punti: [11, 13, 15] },
  { nome: "Mano destra",     punti: [16, 18, 20, 22] },
  { nome: "Mano sinistra",   punti: [15, 17, 19, 21] },
  { nome: "Busto",           punti: [11, 12, 23, 24] },
  { nome: "Gamba destra",    punti: [24, 26, 28] },
  { nome: "Gamba sinistra",  punti: [23, 25, 27] },
  { nome: "Piede destro",    punti: [28, 30, 32] },
  { nome: "Piede sinistro",  punti: [27, 29, 31] },
  { nome: "Testa",           punti: [0, 2, 5, 7, 8] },
];

// Un punto di attacco: landmark singolo o interpolazione fra due, piu' uno
// scostamento in metri.
//
// Lo scostamento vive nel sistema del corpo [laterale, verticale, anteriore],
// oppure — indicando `seg: [A, B]` — nel sistema locale di quel segmento
// [laterale, lungo l'asse, anteriore]. La distinzione non e' un dettaglio: nel
// sistema del corpo, "anteriore" sull'avambraccio resta anteriore *rispetto al
// torace* anche quando l'avambraccio ruota di novanta gradi, e l'inserzione
// finisce dalla parte sbagliata dell'osso. Per il quadricipite questo arrivava
// a invertire il segno della deformazione: in flessione del ginocchio risultava
// accorciamento invece dell'allungamento che avviene davvero.
const p = (lm, off, seg) => ({ lm, off: off || [0, 0, 0], seg });
const q = (a, b, t, off, seg) => ({ lerp: [a, b, t], off: off || [0, 0, 0], seg });

/** Costruisce i muscoli di un arto superiore. `s` vale +1 a sinistra del
 *  soggetto e -1 a destra, e moltiplica la componente laterale degli scostamenti. */
function braccio(lato, s, SP, GO, PO) {
  const OMERO = [SP, GO], RADIO = [GO, PO];
  return [
    { nome: "Bicipite brachiale", lato, gruppo: "Braccio", via: [
        p(SP, [0, 0, 0.03], OMERO), q(SP, GO, 0.45, [0, 0, 0.045], OMERO),
        q(GO, PO, 0.16, [0, 0, 0.022], RADIO) ] },
    // Inserzione sull'olecrano: dietro al gomito, oltre l'articolazione, dalla
    // parte opposta al polso. Modellato lungo gomito->polso si accorciava in
    // flessione, cioe' il contrario del vero.
    { nome: "Tricipite brachiale", lato, gruppo: "Braccio", via: [
        p(SP, [0, 0, -0.03], OMERO), q(SP, GO, 0.5, [0, 0, -0.045], OMERO),
        q(PO, GO, 1.10) ] },
    // Origine sull'acromion, che sta *lateralmente* al centro articolare: e' quel
    // pochi centimetri a rendere l'abduzione un accorciamento.
    { nome: "Deltoide", lato, gruppo: "Spalla", via: [
        p(SP, [0.02 * s, 0.025, 0]), q(SP, GO, 0.42, [0.022 * s, 0, 0], OMERO) ] },
    { nome: "Flessori avambraccio", lato, gruppo: "Avambraccio", via: [
        p(GO, [0, 0, 0.025], RADIO), q(GO, PO, 0.4, [0, 0, 0.03], RADIO), p(PO, [0, 0, 0.012], RADIO) ] },
    { nome: "Estensori avambraccio", lato, gruppo: "Avambraccio", via: [
        p(GO, [0, 0, -0.025], RADIO), q(GO, PO, 0.4, [0, 0, -0.03], RADIO), p(PO, [0, 0, -0.012], RADIO) ] },
  ];
}

function gamba(lato, s, AN, GI, CA, TA, PU) {
  const FEMORE = [AN, GI], TIBIA = [GI, CA], PIEDE = [CA, PU];
  return [
    // Il punto sul condilo femorale e' agganciato alla coscia, la tuberosita'
    // tibiale alla gamba: e' la rotazione relativa fra i due sistemi a produrre
    // l'allungamento in flessione, come fa il tendine rotuleo scavalcando il
    // ginocchio.
    { nome: "Retto femorale", lato, gruppo: "Coscia", via: [
        p(AN, [0, 0, 0.035], FEMORE), q(AN, GI, 0.55, [0, 0, 0.06], FEMORE),
        p(GI, [0, 0, 0.05], FEMORE), q(GI, CA, 0.15, [0, 0, 0.04], TIBIA) ] },
    { nome: "Ischiocrurali", lato, gruppo: "Coscia", via: [
        p(AN, [0, 0, -0.05], FEMORE), q(AN, GI, 0.55, [0, 0, -0.055], FEMORE),
        q(GI, CA, 0.15, [0, 0, -0.035], TIBIA) ] },
    { nome: "Adduttori", lato, gruppo: "Coscia", via: [
        p(AN, [-0.03 * s, 0.01, 0]), q(AN, GI, 0.45, [-0.045 * s, 0, 0.01], FEMORE) ] },
    { nome: "Grande gluteo", lato, gruppo: "Anca", via: [
        p(AN, [-0.02 * s, 0.05, -0.05]), p(AN, [0.045 * s, 0, -0.055]),
        q(AN, GI, 0.3, [0.03 * s, 0, -0.035], FEMORE) ] },
    { nome: "Gastrocnemio", lato, gruppo: "Polpaccio", via: [
        p(GI, [0, 0, -0.045], FEMORE), q(GI, CA, 0.35, [0, 0, -0.05], TIBIA), p(TA) ] },
    { nome: "Tibiale anteriore", lato, gruppo: "Polpaccio", via: [
        q(GI, CA, 0.15, [0.018 * s, 0, 0.030], TIBIA), q(GI, CA, 0.60, [0.014 * s, 0, 0.032], TIBIA),
        q(GI, CA, 0.90, [0, 0, 0.015], TIBIA), q(CA, PU, 0.50, [0, 0, 0.020], PIEDE) ] },
  ];
}

export const MUSCOLI = [
  ...braccio("Sx", +1, LM.spallaSx, LM.gomitoSx, LM.polsoSx),
  ...braccio("Dx", -1, LM.spallaDx, LM.gomitoDx, LM.polsoDx),
  ...gamba("Sx", +1, LM.ancaSx, LM.ginocchioSx, LM.cavigliaSx, LM.talloneSx, LM.puntaSx),
  ...gamba("Dx", -1, LM.ancaDx, LM.ginocchioDx, LM.cavigliaDx, LM.talloneDx, LM.puntaDx),

  { nome: "Gran pettorale", lato: "Sx", gruppo: "Torace", via: [
      q(LM.spallaSx, LM.spallaDx, 0.55, [0, -0.04, 0.05]), p(LM.spallaSx, [0, 0, 0.045]) ] },
  { nome: "Gran pettorale", lato: "Dx", gruppo: "Torace", via: [
      q(LM.spallaDx, LM.spallaSx, 0.55, [0, -0.04, 0.05]), p(LM.spallaDx, [0, 0, 0.045]) ] },
  { nome: "Gran dorsale", lato: "Sx", gruppo: "Dorso", via: [
      p(LM.ancaSx, [0, 0.04, -0.05]), q(LM.ancaSx, LM.spallaSx, 0.6, [0, 0, -0.06]), p(LM.spallaSx, [0, 0, -0.04]) ] },
  { nome: "Gran dorsale", lato: "Dx", gruppo: "Dorso", via: [
      p(LM.ancaDx, [0, 0.04, -0.05]), q(LM.ancaDx, LM.spallaDx, 0.6, [0, 0, -0.06]), p(LM.spallaDx, [0, 0, -0.04]) ] },
  { nome: "Trapezio", lato: "Sx", gruppo: "Dorso", via: [
      q(LM.spallaSx, LM.spallaDx, 0.5, [0, 0.1, -0.03]), p(LM.spallaSx, [0, 0.01, -0.03]) ] },
  { nome: "Trapezio", lato: "Dx", gruppo: "Dorso", via: [
      q(LM.spallaDx, LM.spallaSx, 0.5, [0, 0.1, -0.03]), p(LM.spallaDx, [0, 0.01, -0.03]) ] },
  { nome: "Retto addominale", lato: "—", gruppo: "Addome", via: [
      q(LM.spallaSx, LM.spallaDx, 0.5, [0, -0.05, 0.055]),
      q(LM.ancaSx, LM.ancaDx, 0.5, [0, 0.02, 0.05]) ] },
  { nome: "Obliquo", lato: "Sx", gruppo: "Addome", via: [
      p(LM.spallaSx, [-0.01, -0.09, 0.035]), p(LM.ancaSx, [0, 0.03, 0.04]) ] },
  { nome: "Obliquo", lato: "Dx", gruppo: "Addome", via: [
      p(LM.spallaDx, [0.01, -0.09, 0.035]), p(LM.ancaDx, [0, 0.03, 0.04]) ] },
];

// Segmenti scheletrici, per il disegno delle ossa.
export const OSSA = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [28, 30], [30, 32],
];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
const norm = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** Sistema di riferimento del corpo dai landmark.
 *
 *  Il verso anteriore si decide guardando dove sta il naso rispetto alle
 *  spalle, invece di fissarlo per convenzione: cosi' resta corretto anche
 *  quando il soggetto e' di spalle, dove un segno fisso metterebbe i muscoli
 *  posteriori sul davanti. */
export function frameCorpo(pts) {
  const spSx = pts[LM.spallaSx], spDx = pts[LM.spallaDx];
  const anSx = pts[LM.ancaSx], anDx = pts[LM.ancaDx];
  if (!spSx || !spDx || !anSx || !anDx) return null;

  const midSpalle = [(spSx[0]+spDx[0])/2, (spSx[1]+spDx[1])/2, (spSx[2]+spDx[2])/2];
  const midAnche  = [(anSx[0]+anDx[0])/2, (anSx[1]+anDx[1])/2, (anSx[2]+anDx[2])/2];

  const su = norm(sub(midSpalle, midAnche));
  let laterale = norm(sub(spSx, spDx));            // verso la sinistra del soggetto
  // Ortogonalizza il laterale rispetto al verticale (Gram-Schmidt): le spalle
  // non sono mai perfettamente perpendicolari al tronco, e senza questo il
  // sistema si deforma.
  laterale = norm(sub(laterale, [su[0]*dot(laterale,su), su[1]*dot(laterale,su), su[2]*dot(laterale,su)]));
  let avanti = norm(cross(laterale, su));

  const naso = pts[LM.naso];
  if (naso && dot(sub(naso, midSpalle), avanti) < 0) {
    avanti = [-avanti[0], -avanti[1], -avanti[2]];
  }
  return { laterale, su, avanti, midSpalle, midAnche };
}

/** Terna locale di un segmento osseo: asse lungo l'osso, piu' due direzioni
 *  perpendicolari agganciate al sistema del corpo per non ruotare a caso
 *  attorno all'asse. */
function frameSegmento(A, B, F) {
  const asse = norm(sub(B, A));
  let lat = cross(F.su, asse);
  if (Math.hypot(lat[0], lat[1], lat[2]) < 0.15) lat = cross(F.avanti, asse); // asse quasi verticale
  lat = norm(lat);
  const avanti = norm(cross(asse, lat));
  return { laterale: lat, su: asse, avanti };
}

function risolvi(a, pts, F) {
  let base;
  if (a.lm !== undefined) {
    base = pts[a.lm];
  } else {
    const [i, j, t] = a.lerp;
    const A = pts[i], B = pts[j];
    if (!A || !B) return null;
    base = [A[0] + (B[0]-A[0])*t, A[1] + (B[1]-A[1])*t, A[2] + (B[2]-A[2])*t];
  }
  if (!base) return null;

  let R = F;
  if (a.seg) {
    const A = pts[a.seg[0]], B = pts[a.seg[1]];
    if (!A || !B) return null;
    R = frameSegmento(A, B, F);
  }
  const [l, u, f] = a.off;
  return [
    base[0] + R.laterale[0]*l + R.su[0]*u + R.avanti[0]*f,
    base[1] + R.laterale[1]*l + R.su[1]*u + R.avanti[1]*f,
    base[2] + R.laterale[2]*l + R.su[2]*u + R.avanti[2]*f,
  ];
}

/** Punti e lunghezza di un muscolo nella posa corrente. */
export function tracciaMuscolo(m, pts, F) {
  const punti = [];
  for (const a of m.via) {
    const v = risolvi(a, pts, F);
    if (!v) return null;
    punti.push(v);
  }
  let len = 0;
  for (let i = 1; i < punti.length; i++) {
    len += Math.hypot(punti[i][0]-punti[i-1][0], punti[i][1]-punti[i-1][1], punti[i][2]-punti[i-1][2]);
  }
  return { punti, len };
}

/** Deformazione rispetto alla lunghezza a riposo.
 *  Negativa = accorciamento (contrazione concentrica), positiva = allungamento. */
export function deformazione(len, riposo) {
  if (!riposo || riposo < 1e-6) return 0;
  return (len - riposo) / riposo;
}
