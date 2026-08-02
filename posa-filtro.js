// Lisciatura temporale dei punti della posa.
//
// I 33 landmark di MediaPipe ballano di qualche millimetro anche a soggetto
// perfettamente fermo. Sul modello a bastoncini quasi non si nota; sulle mesh
// vere si nota moltissimo, perche' un femore lungo mezzo metro trasforma uno
// scarto di 3 mm all'anca in un tremolio di un centimetro al ginocchio.
//
// Una media mobile a peso fisso toglierebbe il tremolio ma metterebbe in
// ritardo ogni movimento vero: il modello arriverebbe sempre un decimo di
// secondo dopo la persona, ed e' la cosa che si vede di piu'.
//
// Il filtro "one euro" (Casiez, Roussel, Vogel, 2012) cambia la propria banda
// in base alla velocita' del punto: fermo liscia molto, in movimento lascia
// passare quasi tutto. E' quello che usano le applicazioni che seguono il
// corpo in tempo reale, ed e' il motivo per cui li' il modello sta fermo
// quando la persona sta ferma.

/** Peso del passo esponenziale per una data frequenza di taglio. */
const peso = (dt, taglio) => {
  const tau = 1 / (2 * Math.PI * taglio);
  return dt / (dt + tau);
};

/** Un filtro one euro su un singolo numero, con recupero del ritardo.
 *
 *  Il one euro liscio da solo puo' solo ritardare: qualunque taratura scambia
 *  tremolio contro ritardo lungo la stessa curva, e a 30 fotogrammi al secondo
 *  il meglio che si ottiene e' circa 3 volte meno rumore con 5 cm di ritardo su
 *  un gesto normale. Cinque centimetri al polso si vedono.
 *
 *  Ma il ritardo di un passo esponenziale su un movimento a velocita' costante
 *  vale esattamente velocita' x tau, e tau lo si conosce: e' la costante di
 *  tempo del filtro in questo istante. La derivata lisciata la si sta gia'
 *  calcolando per decidere la banda. Sommando dx * tau all'uscita il ritardo si
 *  cancella quasi del tutto.
 *
 *  Il rumore, pero', ha anche lui una derivata, e a soggetto fermo quella
 *  correzione rimetterebbe dentro il tremolio appena tolto. Per questo la
 *  correzione entra con un peso che vale quasi zero a bassa velocita' e quasi
 *  uno a velocita' di gesto: da fermo non si corregge nulla perche' non c'e'
 *  ritardo da correggere. */
class UnEuro {
  constructor(taglioMin, beta, taglioDeriv, vSoglia) {
    this.taglioMin = taglioMin;
    this.beta = beta;
    this.taglioDeriv = taglioDeriv;
    this.vSoglia = vSoglia;
    this.x = null;      // valore lisciato (stato interno)
    this.dx = 0;        // derivata lisciata
  }

  /** @param scalaTaglio moltiplicatore della banda: <1 liscia di piu'. */
  filtra(v, dt, scalaTaglio = 1) {
    if (this.x === null || !Number.isFinite(this.x)) { this.x = v; this.dx = 0; return v; }
    // Derivata grezza, poi lisciata a banda fissa: e' lei a decidere quanto
    // aprire il filtro principale, quindi non deve essere rumorosa a sua volta.
    const dGrezza = (v - this.x) / dt;
    this.dx += peso(dt, this.taglioDeriv) * (dGrezza - this.dx);
    const taglio = Math.max(0.05, (this.taglioMin + this.beta * Math.abs(this.dx)) * scalaTaglio);
    const a = peso(dt, taglio);
    this.x += a * (v - this.x);
    // Il recupero esce dall'uscita e non rientra nello stato: se rientrasse si
    // sommerebbe a se stesso fotogramma dopo fotogramma e il punto scapperebbe
    // avanti al soggetto.
    // Il peso va col quadrato della velocita': la derivata del solo rumore, a
    // soggetto fermo, vale qualche centimetro al secondo, e con un peso lineare
    // ne passerebbe abbastanza da rimettere in campo il tremolio appena tolto.
    // Col quadrato a quelle velocita' il peso e' praticamente zero, mentre a
    // velocita' di gesto e' quasi uno.
    const vel = this.dx / this.vSoglia;
    // Su un punto di cui non ci si fida si liscia di piu' E si estrapola di
    // meno: tirare avanti la posizione presunta di qualcosa che la telecamera
    // vede male e' il modo piu' rapido per far scattare un arto.
    const k = scalaTaglio * vel * vel / (vel * vel + 1);
    const tau = dt * (1 - a) / a;
    return this.x + k * this.dx * tau;
  }

  azzera() { this.x = null; this.dx = 0; }
}

// Sotto questa visibilita' il punto e' inventato dal modello, non visto: va
// tenuto fermo, non inseguito.
const VIS_MINIMA = 0.15;
// Sopra questa si fida piena: banda intera.
const VIS_PIENA = 0.6;

export const NUCLEO = [11, 12, 23, 24];              // spalle e anche
export const ARTI = [13, 14, 15, 16, 25, 26, 27, 28];

export class FiltroPosa {
  /**
   * @param taglioMin  banda a soggetto fermo, in hertz. Piu' basso = piu'
   *                   liscio e piu' lento a partire.
   * @param beta       quanto si apre la banda con la velocita', in hertz per
   *                   metro al secondo. Piu' alto = meno ritardo, piu' rumore
   *                   durante il movimento.
   * @param attesa     per quanti millisecondi tenere l'ultima posa buona
   *                   quando il rilevatore non trova nessuno.
   */
  // I valori di partenza non sono a occhio: escono da una scansione dello
  // spazio dei parametri contro rumore misurato di 4 mm a 30 fotogrammi al
  // secondo, scegliendo il punto che tiene insieme poco tremolio da fermo,
  // poco ritardo in movimento e poca sovraelongazione quando ci si ferma.
  // Vedere test-posa-filtro.mjs, che li verifica tutti e tre.
  constructor({ taglioMin = 0.3, beta = 8.0, taglioDeriv = 2.5,
                vSoglia = 1.1, attesa = 400 } = {}) {
    this.taglioMin = taglioMin;
    this.beta = beta;
    this.taglioDeriv = taglioDeriv;
    this.vSoglia = vSoglia;
    this.attesa = attesa;
    this.filtri = null;      // 33 x 3
    this.valore = null;      // ultima posa lisciata
    this.tPrec = null;
    this.tUltimoVisto = null;
  }

  azzera() {
    this.filtri = null; this.valore = null; this.tPrec = null; this.tUltimoVisto = null;
  }

  /**
   * @param pts array di [x,y,z] (o null nelle caselle mancanti), oppure null
   *            se il rilevatore non ha trovato nessuno in questo fotogramma.
   * @param vis array parallelo di visibilita' 0..1, oppure null.
   * @param t   tempo in millisecondi, monotono.
   * @returns {{pts, fresco, eta, fiducia, fermi}} — `pts` e' null solo se non
   *          c'e' proprio nulla da mostrare; `fresco` dice se questo
   *          fotogramma ha visto davvero la persona; `eta` e' da quanti
   *          millisecondi non la si vede; `fermi` sono gli indici tenuti fermi
   *          perche' non visibili.
   */
  applica(pts, vis, t) {
    if (!pts) {
      const eta = this.tUltimoVisto === null ? Infinity : t - this.tUltimoVisto;
      // Il rilevatore perde la persona per un fotogramma ogni tanto anche
      // quando e' li' ferma. Sparire e riapparire e' peggio che restare un
      // momento sull'ultima posa buona.
      if (this.valore && eta <= this.attesa) {
        return { pts: this.valore, fresco: false, eta, fiducia: 0, fermi: [] };
      }
      if (eta > this.attesa) this.azzera();
      return { pts: null, fresco: false, eta, fiducia: 0, fermi: [] };
    }

    const n = pts.length;
    if (!this.filtri || this.filtri.length !== n) {
      const nuovo = () => new UnEuro(this.taglioMin, this.beta, this.taglioDeriv, this.vSoglia);
      this.filtri = Array.from({ length: n }, () => [nuovo(), nuovo(), nuovo()]);
      this.valore = null;
    }

    // Primo fotogramma o ripresa dopo un buco: nessun passo da fare, si parte
    // da qui. Un dt inventato darebbe una derivata enorme e un salto.
    let dt = this.tPrec === null ? 0 : (t - this.tPrec) / 1000;
    if (!(dt > 0)) dt = 1 / 30;
    dt = Math.min(dt, 0.2);          // dopo una pausa lunga non si estrapola
    this.tPrec = t;
    this.tUltimoVisto = t;

    const prec = this.valore;
    const fuori = [];
    const usc = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (!p) { usc[i] = prec ? prec[i] : null; continue; }
      const v = vis ? (vis[i] ?? 1) : 1;
      if (v < VIS_MINIMA && prec && prec[i]) {
        // Punto non visto: il modello lo indovina, e la sua ipotesi salta da un
        // fotogramma all'altro. Meglio l'ultima posizione vista.
        usc[i] = prec[i];
        fuori.push(i);
        continue;
      }
      // Fra visibilita' minima e piena si stringe la banda in proporzione: il
      // punto continua a seguire, ma con molta piu' inerzia.
      const scala = v >= VIS_PIENA ? 1
        : 0.15 + 0.85 * Math.max(0, (v - VIS_MINIMA) / (VIS_PIENA - VIS_MINIMA));
      const f = this.filtri[i];
      usc[i] = [f[0].filtra(p[0], dt, scala),
                f[1].filtra(p[1], dt, scala),
                f[2].filtra(p[2], dt, scala)];
    }

    this.valore = usc;
    return { pts: usc, fresco: true, eta: 0, fiducia: fiduciaPosa(vis), fermi: fuori };
  }
}

/** Quanto ci si puo' fidare dell'inquadratura: media della visibilita' del
 *  tronco, che deve esserci sempre, e degli arti, che dicono se la persona e'
 *  inquadrata tutta. */
export function fiduciaPosa(vis) {
  if (!vis) return 1;
  const media = (idx) => {
    let s = 0, n = 0;
    for (const i of idx) { if (vis[i] != null) { s += vis[i]; n++; } }
    return n ? s / n : 0;
  };
  return 0.6 * media(NUCLEO) + 0.4 * media(ARTI);
}

// ── Di quali segmenti ci si puo' fidare ────────────────────────────
//
// Quando una parte del corpo esce dall'inquadratura, MediaPipe non smette di
// dare i punti: continua a darli, inventati, con visibilita' bassa. Tutto
// quello che ci sta agganciato finisce dove capita — ed e' quel che si vede
// nelle riprese da seduti, con le gambe fuori campo e le ossa del bacino
// sparse per la scena.
//
// Un modello anatomico che mostra un femore nel posto sbagliato e' peggio di
// uno che non lo mostra: il primo dice una cosa falsa, il secondo dice che non
// sa. Quindi si misura quanto la telecamera vede davvero i punti che guidano
// ogni segmento, e chi non e' visto non si disegna.

/** Le ancore che non sono landmark singoli ma medie di piu' punti. */
export const LM_COMPOSTI = {
  midAnche: [23, 24], midSpalle: [11, 12], naso: [0], testa: [0],
  midOrecchie: [7, 8],
};

/** Quanto ci si puo' fidare di ogni segmento, da 0 a 1.
 *
 *  Vale il PIU' BASSO dei due punti che lo guidano, non la media: un segmento
 *  con un capo visto benissimo e l'altro non visto per niente non e' mezzo
 *  buono, e' inutilizzabile. E' la sua direzione a essere sbagliata, e la
 *  direzione la decidono tutti e due i capi.
 *
 *  @param segmenti la tabella dei segmenti, con i loro `lm`
 *  @param vis      visibilita' dei 33 landmark, oppure null se non si sa */
export function visibilitaSegmenti(segmenti, vis) {
  const out = {};
  if (!vis) { for (const n of Object.keys(segmenti)) out[n] = 1; return out; }
  const perAncora = (a) => {
    const idx = typeof a === "number" ? [a] : (LM_COMPOSTI[a] || []);
    if (!idx.length) return 1;
    let s = 0;
    for (const i of idx) s += vis[i] ?? 0;
    return s / idx.length;
  };
  for (const [nome, seg] of Object.entries(segmenti))
    out[nome] = Math.min(...seg.lm.map(perAncora));
  return out;
}

/** Decide se un segmento va mostrato, con isteresi.
 *
 *  Due soglie invece di una: chi e' gia' visibile resta visibile fino a una
 *  soglia piu' bassa. Con una soglia sola, un punto che oscilla attorno ad essa
 *  farebbe lampeggiare mezzo scheletro, che da' molto piu' fastidio di un
 *  femore fermo un attimo di troppo.
 */
export const VIS_ACCENDI = 0.55, VIS_SPEGNI = 0.35;

export function mostraSegmento(affidabilita, eraVisibile) {
  return eraVisibile ? affidabilita > VIS_SPEGNI : affidabilita >= VIS_ACCENDI;
}

/** Che cosa dire a chi si sta inquadrando, guardando quali parti mancano.
 *  Un messaggio solo, quello che serve adesso: un elenco di problemi non lo
 *  legge nessuno mentre si sta in piedi davanti alla telecamera. */
export function consiglioInquadratura(vis) {
  if (!vis) return null;
  const v = (i) => vis[i] ?? 0;
  const tronco = (v(11) + v(12) + v(23) + v(24)) / 4;
  if (tronco < 0.5) return "Mettiti davanti alla telecamera, di fronte.";
  const piedi = (v(27) + v(28)) / 2;
  const mani = (v(15) + v(16)) / 2;
  if (piedi < 0.5) return "Allontanati: le gambe restano fuori inquadratura.";
  if (mani < 0.5) return "Tieni le braccia dove la telecamera le vede.";
  return null;
}
