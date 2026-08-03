// Riduzione del numero di triangoli, senza sfondare la superficie.
//
// Il metodo e' il raggruppamento su griglia: si divide lo spazio in celle e
// tutti i vertici che cadono nella stessa cella diventano uno solo. E' semplice,
// non ha dipendenze e non si spaventa davanti alle mesh con buchi e facce
// degeneri di cui BodyParts3D e' pieno.
//
// Ha pero' un difetto che sul corpo umano si paga caro. Dove due falde di
// superficie si sfiorano — le due tavole di un osso piatto, la parete anteriore
// e posteriore di una cavita', due muscoli che si toccano — capita che finiscano
// nella stessa cella pur non essendo la stessa superficie. Fondendole si crea
// uno spigolo condiviso da quattro, sei, otto facce invece che da due: una
// giunzione non-manifold.
//
// La conseguenza non e' teorica. Su una giunzione cosi' il verso dei triangoli
// non si puo' piu' rendere coerente, e le normali dei vertici — che si
// calcolano sommando quelle delle facce vicine — si annullano fra facce girate
// al contrario. Il risultato e' una macchia nera sulla superficie: il cranio
// sembra bucato pur essendo chiuso e senza un solo spigolo di bordo. Nel
// modello a 629 strutture erano 369 le strutture rovinate cosi'.
//
// La correzione: due vertici si fondono solo se stanno nella stessa cella E
// sono connessi lungo la superficie. Cosi' due falde che si sfiorano restano
// due, e la superficie resta quella che era.

/** Insieme disgiunto con compressione di cammino: serve a raggruppare i
 *  vertici per "stessa cella e stessa falda" senza costruire liste. */
function radice(padre, i) {
  let r = i;
  while (padre[r] !== r) r = padre[r];
  while (padre[i] !== r) { const n = padre[i]; padre[i] = r; i = n; }
  return r;
}

/**
 * @param V coordinate, tre per vertice
 * @param F indici, tre per triangolo
 * @param celle quante celle sul lato piu' lungo: piu' alto = piu' dettaglio
 * @param connettivita se false si torna al vecchio comportamento, che fonde
 *        tutto quel che cade nella stessa cella. Serve solo alle prove, per
 *        misurare la differenza.
 */
export function riduci(V, F, celle, connettivita = true) {
  const n = V.length / 3;
  if (!n || !F.length) return { V, F };
  let mnx = Infinity, mny = Infinity, mnz = Infinity;
  let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = V[i*3], y = V[i*3+1], z = V[i*3+2];
    if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z;
    if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z;
  }
  const lato = Math.max(mxx - mnx, mxy - mny, mxz - mnz) / celle;
  if (!(lato > 0)) return { V, F };

  // Chiave numerica e non stringa: su una mesh da centomila vertici, ripetuta
  // per ogni passo della ricerca binaria, la differenza si sente.
  const passo = celle + 1;
  const cella = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const cx = Math.floor((V[i*3] - mnx) / lato);
    const cy = Math.floor((V[i*3+1] - mny) / lato);
    const cz = Math.floor((V[i*3+2] - mnz) / lato);
    cella[i] = (cx * passo + cy) * passo + cz;
  }

  const padre = new Uint32Array(n);
  for (let i = 0; i < n; i++) padre[i] = i;

  if (connettivita) {
    // Si uniscono solo i vertici che uno spigolo collega davvero e che stanno
    // nella stessa cella. Due falde che si sfiorano condividono la cella ma non
    // lo spigolo, quindi restano separate — ed e' esattamente quel che serve.
    for (let t = 0; t < F.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = F[t + k], b = F[t + (k + 1) % 3];
        if (cella[a] !== cella[b]) continue;
        const ra = radice(padre, a), rb = radice(padre, b);
        if (ra !== rb) padre[ra < rb ? rb : ra] = ra < rb ? ra : rb;
      }
    }
  } else {
    // Il vecchio comportamento: tutto quel che cade nella cella diventa uno.
    const primo = new Map();
    for (let i = 0; i < n; i++) {
      const c = cella[i], p = primo.get(c);
      if (p === undefined) primo.set(c, i);
      else padre[radice(padre, i)] = radice(padre, p);
    }
  }

  // Ogni gruppo diventa un vertice, nel suo baricentro.
  const idDi = new Int32Array(n).fill(-1);
  const somma = [], conta = [];
  const rimap = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const r = radice(padre, i);
    let id = idDi[r];
    if (id === -1) { id = conta.length; idDi[r] = id; somma.push(0, 0, 0); conta.push(0); }
    somma[id*3] += V[i*3]; somma[id*3+1] += V[i*3+1]; somma[id*3+2] += V[i*3+2];
    conta[id]++; rimap[i] = id;
  }
  const NV = new Float64Array(conta.length * 3);
  for (let i = 0; i < conta.length; i++) {
    NV[i*3] = somma[i*3] / conta[i];
    NV[i*3+1] = somma[i*3+1] / conta[i];
    NV[i*3+2] = somma[i*3+2] / conta[i];
  }
  // Le facce con due vertici finiti nello stesso gruppo sono degenerate.
  const tenute = [];
  for (let i = 0; i < F.length; i += 3) {
    const a = rimap[F[i]], b = rimap[F[i+1]], c = rimap[F[i+2]];
    if (a !== b && b !== c && a !== c) tenute.push(a, b, c);
  }
  return tenute.length ? { V: NV, F: new Uint32Array(tenute) } : { V, F };
}

/** La griglia piu' fine che sta nel budget di triangoli. Il numero di triangoli
 *  cresce con le celle in modo monotono, quindi si cerca per bisezione. */
export function riduciABudget(V, F, budget, connettivita = true) {
  if (F.length / 3 <= budget) return { V, F };
  let basso = 6, alto = 400, migliore = null;
  while (basso <= alto) {
    const mid = (basso + alto) >> 1;
    const r = riduci(V, F, mid, connettivita);
    if (r.F.length / 3 <= budget) { migliore = r; basso = mid + 1; } else alto = mid - 1;
  }
  return migliore || riduci(V, F, basso, connettivita);
}

/** Quanti spigoli sono condivisi da piu' di due facce: e' il numero che
 *  misura il danno, e quello che deve restare a zero. */
export function nonManifold(F) {
  const conta = new Map();
  for (let i = 0; i < F.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = F[i + k], b = F[i + (k + 1) % 3];
      const c = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      conta.set(c, (conta.get(c) || 0) + 1);
    }
  }
  let male = 0;
  for (const v of conta.values()) if (v > 2) male++;
  return male;
}

/** Quante coppie di facce confinanti sono percorse nello stesso verso, cioe'
 *  incoerenti fra loro. E' il difetto che produce le macchie nere. */
export function discordanze(F) {
  const visti = new Set();
  let male = 0;
  for (let i = 0; i < F.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const c = F[i + k] * 4294967296 + F[i + (k + 1) % 3];
      if (visti.has(c)) male++; else visti.add(c);
    }
  }
  return male;
}
