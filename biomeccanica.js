// Come si muove davvero la colonna, e come si spartiscono il movimento le
// articolazioni che una telecamera non vede separatamente.
//
// Finora il tronco era un segmento solo, rigido, dalle anche alle spalle:
// piegandosi in avanti si inclinava come un'asse. Una colonna vera si
// incurva, e non in modo uniforme — ogni livello ha una mobilita' sua, molto
// diversa dagli altri e diversa da piano a piano.
//
// Il fatto piu' importante, e quello che si vede di piu' se lo si sbaglia: le
// lombari quasi non ruotano. Circa due gradi per livello contro i dieci-dodici
// delle toraciche. Chi modella la colonna come un tubo uniforme fa ruotare il
// bacino insieme alle spalle, ed e' sbagliato: la torsione del tronco avviene
// quasi tutta nel torace.
//
// I numeri qui sotto vengono dalla letteratura, non da stime. Le fonti stanno
// nel README; in breve: White e Panjabi per le toraciche in flesso-estensione,
// l'analisi in vitro di Liebsch e colleghi (PLOS One, 2017) per i tre piani
// toracici, gli studi di cinematica lombare in vivo per L1-S1, e i valori
// classici della cinematica cervicale per C0-C7.

// Attenzione a una trappola in cui si casca facilmente: i valori per singolo
// livello che si trovano in letteratura vengono quasi tutti da prove IN VITRO,
// su segmenti di cadavere caricati con momenti noti. I totali di regione che si
// trovano accanto vengono invece da misure IN VIVO. Non sono confrontabili: un
// rachide vivo, con il tono muscolare e la gabbia toracica intatta, e' molto
// meno mobile di uno smontato sul banco. Sommando i valori in vitro delle
// toraciche vengono 95 gradi di flesso-estensione, contro i 28 che si misurano
// su una persona in piedi.
//
// Qui serve animare una persona viva, quindi comandano i totali in vivo. I
// valori per livello servono solo a dire come si spartisce il movimento dentro
// la regione — e quel profilo relativo, fra in vitro e in vivo, e' lo stesso.
// Percio': profilo per livello dalla letteratura, poi ogni regione riscalata
// perche' la sua somma faccia il totale clinico.

/** Profilo relativo dentro ogni regione: quanto e' mobile un livello rispetto
 *  ai suoi vicini. [flesso-estensione, inclinazione laterale, rotazione]. */
const PROFILO = {
  "C0": [25,  5,  5],
  "C1": [20,  5, 40],
  "C2": [10, 10,  5],
  "C3": [15, 11,  7],
  "C4": [17, 11,  7],
  "C5": [17,  8,  7],
  "C6": [17,  7,  6],
  "T1": [14, 12, 12], "T2":  [ 7, 12, 11], "T3":  [ 7, 11, 11],
  "T4": [ 7, 11, 11], "T5":  [ 7, 11, 11], "T6":  [ 7, 10, 11],
  "T7": [ 7, 10, 11], "T8":  [ 7,  9, 10], "T9":  [ 8,  9, 10],
  "T10":[ 8,  9,  8], "T11": [ 8,  8,  8], "T12": [ 8,  8,  7],
  "L1": [6.8, 6, 2], "L2": [8, 6, 2], "L3": [9, 6, 2],
  "L4": [9.7, 6, 2], "L5": [8.4, 5, 2],
};

/** Escursione totale di ciascuna regione su una persona viva, in gradi, come
 *  arco intero — flessione piu' estensione, destra piu' sinistra. Sono i
 *  valori che un fisioterapista misura con il goniometro. */
const TOTALI = {
  C: [110, 90, 160],   // collo: flette molto, ruota moltissimo
  T: [ 28, 36,  45],   // torace: la gabbia lo frena, ma in torsione e' il piu' mobile
  L: [ 60, 40,  13],   // lombi: flettono molto, non ruotano quasi
};

/** Mobilita' di ogni livello, in gradi, come [flesso-estensione, inclinazione
 *  laterale, rotazione assiale]. E' l'escursione dell'intero arco, non per
 *  lato. Il nome e' quello del disco: "L4" significa il livello L4-L5. */
export const MOBILITA = (() => {
  const somma = {};
  for (const [n, v] of Object.entries(PROFILO)) {
    const r = n[0];
    if (!somma[r]) somma[r] = [0, 0, 0];
    for (let k = 0; k < 3; k++) somma[r][k] += v[k];
  }
  const out = {};
  for (const [n, v] of Object.entries(PROFILO)) {
    const r = n[0];
    out[n] = v.map((x, k) => x * TOTALI[r][k] / somma[r][k]);
  }
  return out;
})();

export const FLESSIONE = 0, LATERALE = 1, ROTAZIONE = 2;

/** L'ordine dei livelli dal sacro in su. Sotto sta il sacro, che con l'osso
 *  iliaco fa corpo unico e non entra nella catena. */
export const LIVELLI = [
  "L5", "L4", "L3", "L2", "L1",
  "T12", "T11", "T10", "T9", "T8", "T7", "T6", "T5", "T4", "T3", "T2", "T1",
  "C6", "C5", "C4", "C3", "C2", "C1", "C0",
];

/** Quanto di un movimento complessivo tocca a ciascun livello.
 *
 *  Il criterio e' la mobilita' relativa: un livello che puo' fare il doppio
 *  degli altri ne prende il doppio. Non e' una scorciatoia — e' il modello
 *  usuale in cinematica spinale, e riproduce il fatto che a colonna flessa la
 *  curvatura si concentri in basso e in torsione in mezzo.
 *
 *  @param livelli i nomi dei livelli coinvolti, in ordine
 *  @param piano   FLESSIONE, LATERALE o ROTAZIONE
 *  @returns quote che sommano a uno */
export function quote(livelli, piano) {
  const m = livelli.map(n => (MOBILITA[n] || [0, 0, 0])[piano]);
  const s = m.reduce((a, b) => a + b, 0);
  if (!(s > 0)) return livelli.map(() => 1 / Math.max(1, livelli.length));
  return m.map(v => v / s);
}

/** L'angolo che tocca a ogni livello, in gradi, dato il totale.
 *  Si limita anche il singolo livello alla sua escursione: un tronco piegato
 *  oltre il possibile non deve produrre una vertebra piegata all'indietro. */
export function distribuisci(totale, livelli, piano) {
  const q = quote(livelli, piano);
  return livelli.map((n, i) => {
    const max = (MOBILITA[n] || [0, 0, 0])[piano];
    const a = totale * q[i];
    return Math.max(-max, Math.min(max, a));
  });
}

/** Quanto puo' piegarsi in tutto la catena, in gradi: la somma delle
 *  escursioni. Serve per sapere quando si sta chiedendo l'impossibile. */
export function escursione(livelli, piano) {
  return livelli.reduce((s, n) => s + (MOBILITA[n] || [0, 0, 0])[piano], 0);
}

// ── Ritmo scapolo-omerale ──────────────────────────────────────────
//
// Alzando il braccio la scapola non sta ferma: ruota verso l'alto e trascina
// la spalla. Sotto i 30 gradi il movimento e' quasi tutto dell'articolazione
// gleno-omerale; oltre, ogni due gradi di braccio ne tocca circa uno alla
// scapola. Su 180 gradi di elevazione totale, 120 sono gleno-omerali e 60
// scapolo-toracici.
//
// Senza questo, alzando le braccia la spalla resta inchiodata e il deltoide si
// stira in modo innaturale — ed e' uno degli errori che si notano subito
// perche' la clavicola non segue.

export const SOGLIA_SCAPOLA = 30;     // gradi: sotto, la scapola non si muove
export const RAPPORTO_SCAPOLA = 2;    // due di omero per uno di scapola

/** Rotazione verso l'alto della scapola, in gradi, data l'elevazione totale
 *  del braccio rispetto al tronco. */
export function rotazioneScapola(elevazione) {
  const e = Math.abs(elevazione);
  if (e <= SOGLIA_SCAPOLA) return 0;
  // L'elevazione che si vede e' la somma delle due: braccio piu' scapola. Se
  // il braccio ne fa il doppio, alla scapola tocca un terzo di quel che resta
  // oltre la soglia. A 180 gradi fanno 50 di scapola e 130 di gleno-omerale.
  return Math.sign(elevazione) * (e - SOGLIA_SCAPOLA) / (RAPPORTO_SCAPOLA + 1);
}

// ── Ritmo lombo-pelvico ────────────────────────────────────────────
//
// Piegandosi in avanti, tronco e bacino si spartiscono il movimento, ma non in
// parti fisse: all'inizio comanda la colonna (circa quattro a uno), a meta' si
// pareggiano, alla fine comanda il bacino che ruota sulle anche (circa uno a
// due e mezzo). E' quello che protegge il disco L5-S1 nella parte finale.
//
// Serve perche' una telecamera sola non vede la meta' della schiena: non ci
// sono punti fra le anche e le spalle. L'inclinazione complessiva del tronco
// si misura, ma quanta ne sia flessione della colonna e quanta rotazione
// dell'anca va dedotto — e questo e' il modo con cui lo si deduce.

const FASI = [
  { fino: 1 / 3, rapporto: 4.0 },
  { fino: 2 / 3, rapporto: 1.0 },
  { fino: 1.0,   rapporto: 0.4 },
];

/** Quale frazione di un'inclinazione del tronco e' flessione della colonna,
 *  e quale rotazione del bacino sulle anche.
 *  @param frazione a che punto si e' del piegamento, da 0 a 1 */
export function quotaLombare(frazione) {
  const f = Math.max(0, Math.min(1, frazione));
  const fase = FASI.find(x => f <= x.fino) || FASI[FASI.length - 1];
  return fase.rapporto / (1 + fase.rapporto);
}

/** Integra il ritmo lungo tutto il piegamento: di un'inclinazione totale del
 *  tronco, quanti gradi vengono dalla colonna. Si integra invece di prendere
 *  la quota istantanea perche' il rapporto cambia strada facendo, e quel che
 *  interessa e' la posizione raggiunta, non la velocita'. */
export function flessioneSpinale(inclinazione, passi = 60) {
  let acc = 0;
  for (let i = 0; i < passi; i++) acc += quotaLombare((i + 0.5) / passi) / passi;
  return inclinazione * acc;
}

// ── Limiti articolari ──────────────────────────────────────────────
//
// I landmark tremolano e ogni tanto sbagliano di parecchio, soprattutto in
// profondita'. Senza un freno, un ginocchio puo' risultare piegato dalla parte
// sbagliata, e il modello fa una cosa che un corpo non fa. Sono le escursioni
// fisiologiche medie di un adulto sano.
export const LIMITI = {
  gomito:     { min: 0,    max: 150 },   // niente iperestensione
  ginocchio:  { min: 0,    max: 140 },
  anca:       { min: -20,  max: 125 },   // negativo: estensione
  spalla:     { min: -60,  max: 180 },
  caviglia:   { min: -50,  max: 20  },   // flessione plantare negativa
  polso:      { min: -80,  max: 70  },
};

/** Riporta un angolo dentro l'escursione del suo giunto. */
export function limita(gradi, giunto) {
  const l = LIMITI[giunto];
  if (!l) return gradi;
  return Math.max(l.min, Math.min(l.max, gradi));
}

// ── Catena ─────────────────────────────────────────────────────────

const RAD = Math.PI / 180;

/** Ruota un vettore attorno a un asse unitario, di un angolo in gradi.
 *  Formula di Rodrigues. */
export function ruota(v, asse, gradi) {
  const t = gradi * RAD, c = Math.cos(t), s = Math.sin(t);
  const d = asse[0]*v[0] + asse[1]*v[1] + asse[2]*v[2];
  return [
    v[0]*c + (asse[1]*v[2] - asse[2]*v[1])*s + asse[0]*d*(1 - c),
    v[1]*c + (asse[2]*v[0] - asse[0]*v[2])*s + asse[1]*d*(1 - c),
    v[2]*c + (asse[0]*v[1] - asse[1]*v[0])*s + asse[2]*d*(1 - c),
  ];
}

/** Percorre la colonna dal basso verso l'alto applicando, a ogni livello, la
 *  sua quota di rotazione. Ogni vertebra porta con se' tutto quel che le sta
 *  sopra: e' questo che trasforma tante rotazioni piccole in una curva invece
 *  che in un'asse inclinata.
 *
 *  Ogni livello ruota attorno al proprio punto, non attorno all'origine: e'
 *  quello che tiene le vertebre attaccate fra loro. La rotazione si compone a
 *  destra di quella accumulata, quindi gli assi restano quelli a riposo — e'
 *  la catena stessa a portarli nella posa, come succede ai veri assi
 *  articolari, che ruotano con la vertebra su cui stanno.
 *
 *  @param punti   posizione a riposo di ogni livello, dal basso in su
 *  @param angoli  per ogni livello, i gradi nei tre piani
 *  @param assi    {laterale, avanti, su} del bacino, a riposo
 *  @returns per ogni livello la trasformazione {R, t}: q ↦ R·q + t */
export function catena(punti, angoli, assi) {
  let R = [[1,0,0],[0,1,0],[0,0,1]];
  let t = [0, 0, 0];
  const out = [];
  for (let i = 0; i < punti.length; i++) {
    out.push({ R: R.map(r => r.slice()), t: t.slice() });
    const a = angoli[i] || [0, 0, 0];
    // La rotazione di questo livello, nei tre piani, attorno al suo punto.
    let Ri = rodrigues(assi.laterale, a[FLESSIONE]);
    Ri = componi(rodrigues(assi.avanti, a[LATERALE]), Ri);
    Ri = componi(rodrigues(assi.su, a[ROTAZIONE]), Ri);
    const p = punti[i];
    // A_i(q) = Ri·(q − p) + p, cioe' {Ri, p − Ri·p}
    const ti = [p[0] - (Ri[0][0]*p[0] + Ri[0][1]*p[1] + Ri[0][2]*p[2]),
                p[1] - (Ri[1][0]*p[0] + Ri[1][1]*p[1] + Ri[1][2]*p[2]),
                p[2] - (Ri[2][0]*p[0] + Ri[2][1]*p[1] + Ri[2][2]*p[2])];
    // T ∘ A_i
    t = [t[0] + R[0][0]*ti[0] + R[0][1]*ti[1] + R[0][2]*ti[2],
         t[1] + R[1][0]*ti[0] + R[1][1]*ti[1] + R[1][2]*ti[2],
         t[2] + R[2][0]*ti[0] + R[2][1]*ti[1] + R[2][2]*ti[2]];
    R = componi(R, Ri);
  }
  return out;
}

/** Applica una trasformazione della catena a un punto. */
export function applicaCatena(T, q) {
  return [T.R[0][0]*q[0] + T.R[0][1]*q[1] + T.R[0][2]*q[2] + T.t[0],
          T.R[1][0]*q[0] + T.R[1][1]*q[1] + T.R[1][2]*q[2] + T.t[1],
          T.R[2][0]*q[0] + T.R[2][1]*q[1] + T.R[2][2]*q[2] + T.t[2]];
}

function rodrigues(asse, gradi) {
  const t = gradi * RAD, c = Math.cos(t), s = Math.sin(t), u = 1 - c;
  const [x, y, z] = asse;
  return [
    [c + x*x*u,     x*y*u - z*s,  x*z*u + y*s],
    [y*x*u + z*s,   c + y*y*u,    y*z*u - x*s],
    [z*x*u - y*s,   z*y*u + x*s,  c + z*z*u  ],
  ];
}

function componi(A, B) {
  const C = [[0,0,0],[0,0,0],[0,0,0]];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      C[r][c] = A[r][0]*B[0][c] + A[r][1]*B[1][c] + A[r][2]*B[2][c];
  return C;
}
