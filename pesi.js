// I pesi con cui ogni vertice segue le ossa.
//
// Finora ogni struttura era agganciata rigidamente a un segmento solo. Il
// bicipite si spostava e si ingrossava, ma restava un blocco attaccato
// all'omero: piegando il gomito non si avvolgeva attorno all'articolazione, e
// al giunto si apriva la commessura fra un pezzo e l'altro.
//
// Qui ogni vertice puo' seguire piu' ossa con pesi diversi, come nelle
// applicazioni di anatomia fatte bene. Con una differenza che qui conta: le
// ossa restano rigide. In un personaggio animato tutta la superficie e' pelle e
// si piega dappertutto; qui un femore e' un femore, e mescolarlo fra due
// segmenti lo farebbe piegare come gomma — la testa del femore ruota col
// femore, non a meta' col bacino. Si deformano i tessuti molli: muscoli,
// cartilagini, legamenti.

import { SEGMENTI } from "./anatomia-mesh.js";

/** La catena articolare. Il giunto fra un segmento e suo padre e' sempre
 *  l'ancora prossimale del figlio: la spalla per l'omero, il ginocchio per la
 *  tibia, il collo per la testa. Per questo qui basta dire chi e' il padre: il
 *  punto dove si articolano lo dicono gia' le ancore dello scheletro. */
export const PADRE = {
  tronco: null,
  testa: "tronco",
  omero_dx: "tronco",           omero_sx: "tronco",
  avambraccio_dx: "omero_dx",   avambraccio_sx: "omero_sx",
  mano_dx: "avambraccio_dx",    mano_sx: "avambraccio_sx",
  femore_dx: "tronco",          femore_sx: "tronco",
  tibia_dx: "femore_dx",        tibia_sx: "femore_sx",
  piede_dx: "tibia_dx",         piede_sx: "tibia_sx",
};

/** Muscolo, cartilagine, legamento: quel che attraversa le articolazioni e si
 *  deve piegare. Osso e dente restano interi. */
export const DEFORMABILI = new Set([1, 2, 4]);

/** Fin dove dal giunto arriva la mescolanza, in frazione dell'osso piu' corto
 *  dei due. Piu' largo ammorbidisce di piu', ma porta a seguire l'altro osso
 *  anche carne lontana dall'articolazione, che non ha ragione di farlo. */
const RAGGIO = 0.35;

/** Al piu' quante ossa per vertice. Quattro e' il numero che usano tutti: oltre
 *  non cambia niente all'occhio e costa in memoria e in banda. */
export const MAX_OSSA = 4;

const dist = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);

/** Per ogni segmento, i suoi vicini nella catena, con il giunto che
 *  condividono e il raggio entro cui si mescolano. */
export function adiacenze(sk) {
  const anc = {}, lung = {};
  for (const [nome, seg] of Object.entries(SEGMENTI)) {
    const a = sk.ancore[seg.ancore[0]], b = sk.ancore[seg.ancore[1]];
    if (!a || !b) continue;
    const L = dist(a, b);
    if (!(L > 1e-9)) continue;
    anc[nome] = [a, b]; lung[nome] = L;
  }
  const vic = {};
  for (const nome of Object.keys(anc)) vic[nome] = [];
  for (const [figlio, padre] of Object.entries(PADRE)) {
    if (!padre || !anc[figlio] || !anc[padre]) continue;
    const giunto = anc[figlio][0];                    // ancora prossimale
    const raggio = RAGGIO * Math.min(lung[figlio], lung[padre]);
    if (!(raggio > 0)) continue;
    vic[figlio].push({ nome: padre,  giunto, raggio });
    vic[padre].push({ nome: figlio, giunto, raggio });
  }
  return vic;
}

/** I pesi di un singolo vertice: l'osso suo, piu' i vicini nella misura in cui
 *  il vertice sta addosso al giunto che condividono.
 *
 *  Il peso del vicino cade col quadrato della distanza dal giunto e si annulla
 *  al raggio. Proprio sul giunto vale uno come quello del segmento proprio,
 *  cioe' meta' per uno: e' il punto in cui la carne appartiene davvero a tutti
 *  e due, ed e' quello che fa piegare il ventre invece di spezzarlo.
 *
 *  Che sia la distanza dal GIUNTO e non dall'osso vicino e' voluto: cosi'
 *  l'influenza e' locale all'articolazione. Pesando sulla distanza dall'osso, a
 *  una costola toccherebbe un po' di omero solo perche' il braccio le passa
 *  accanto. */
export function pesiVertice(p, segmento, vic, max = MAX_OSSA) {
  const out = [{ nome: segmento, peso: 1 }];
  for (const v of (vic[segmento] || [])) {
    const d = dist(p, v.giunto);
    if (d >= v.raggio) continue;
    const t = 1 - d / v.raggio;
    out.push({ nome: v.nome, peso: t * t });
  }
  out.sort((a, b) => b.peso - a.peso);
  const tenuti = out.slice(0, max);
  let s = 0;
  for (const x of tenuti) s += x.peso;
  for (const x of tenuti) x.peso /= s;
  return tenuti;
}

/** Gli attributi di pelle per una geometria intera: quattro indici e quattro
 *  pesi per vertice, come li vuole il vertex shader.
 *
 *  `indice` porta dal nome del segmento alla sua casella nell'elenco delle
 *  ossa. `usate` torna indietro perche' chi disegna sappia quali matrici deve
 *  calcolare davvero: quasi sempre due o tre su quattordici. */
export function pesiGruppo(pos, segmento, vic, indice, deformabile, max = MAX_OSSA) {
  const n = pos.length / 3;
  const indici = new Uint8Array(n * 4);
  const pesi = new Float32Array(n * 4);
  const usate = new Set();
  const mio = indice[segmento] ?? 0;
  usate.add(mio);

  // Osso o dente: nessuna mescolanza, tutto il peso sul segmento suo. Costa
  // due attributi in piu' anche a loro, ma permette di disegnare tutto con lo
  // stesso materiale e la stessa strada, senza due casi da tenere allineati.
  if (!deformabile) {
    for (let i = 0; i < n; i++) { indici[i * 4] = mio; pesi[i * 4] = 1; }
    return { indici, pesi, usate };
  }

  const p = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    p[0] = pos[i*3]; p[1] = pos[i*3+1]; p[2] = pos[i*3+2];
    const w = pesiVertice(p, segmento, vic, max);
    for (let k = 0; k < w.length; k++) {
      const j = indice[w[k].nome];
      if (j === undefined) continue;
      indici[i*4 + k] = j;
      pesi[i*4 + k] = w[k].peso;
      usate.add(j);
    }
  }
  return { indici, pesi, usate };
}

/** Quanto del corpo finisce davvero mescolato: serve alla pagina per dirlo, e
 *  alle prove per accorgersi se un giorno smette di succedere. */
export function quantiMescolati(pesi) {
  let n = 0;
  for (let i = 0; i < pesi.length; i += 4) if (pesi[i] < 0.999) n++;
  return n;
}
