// Prove sui pesi di deformazione.
//
// Le cose che devono valere, e che una svista renderebbe subito false:
// un osso non si piega mai; un muscolo si piega solo vicino
// all'articolazione; nessuna struttura prende peso da un osso con cui non si
// articola; e la somma dei pesi fa uno dappertutto, altrimenti la carne si
// rimpicciolisce o esplode a seconda di dove sta.
import { adiacenze, pesiVertice, pesiGruppo, quantiMescolati, PADRE, DEFORMABILI, MAX_OSSA }
  from "./pesi.js";
import { SEGMENTI, matricePosa, matriceNormali, applica, frameSegmento } from "./anatomia-mesh.js";

let ok = 0, ko = 0;
const check = (n, c, e = "") => {
  if (c) { ok++; console.log(`  \x1b[32m✓\x1b[0m ${n}${e ? "  " + e : ""}`); }
  else { ko++; console.log(`  \x1b[31m✗\x1b[0m ${n}${e ? "  " + e : ""}`); }
};

// Uno scheletro a riposo plausibile, in metri, in piedi, y in alto.
// Non serve che sia BodyParts3D: serve che le ancore stiano dove stanno in un
// corpo, perche' e' da quelle che nascono i giunti e i raggi.
const A = {
  midAnche: [0, 0.95, 0],      midSpalle: [0, 1.42, 0],   testa: [0, 1.60, 0.06],
  spalla_dx: [-0.18, 1.40, 0], gomito_dx: [-0.20, 1.13, 0], polso_dx: [-0.21, 0.87, 0],
  spalla_sx: [ 0.18, 1.40, 0], gomito_sx: [ 0.20, 1.13, 0], polso_sx: [ 0.21, 0.87, 0],
  mano_dx: [-0.21, 0.70, 0],   mano_sx: [ 0.21, 0.70, 0],
  anca_dx: [-0.09, 0.93, 0],   ginocchio_dx: [-0.10, 0.50, 0], caviglia_dx: [-0.10, 0.08, 0],
  anca_sx: [ 0.09, 0.93, 0],   ginocchio_sx: [ 0.10, 0.50, 0], caviglia_sx: [ 0.10, 0.08, 0],
  piede_dx: [-0.10, 0.03, 0.14], piede_sx: [ 0.10, 0.03, 0.14],
};
const SK = { ancore: A, su: [0, 1, 0], avanti: [0, 0, 1] };
const VIC = adiacenze(SK);
const NOMI = Object.keys(SEGMENTI);
const INDICE = Object.fromEntries(NOMI.map((n, i) => [n, i]));

console.log("\n\x1b[1m1. La catena articolare e' quella giusta\x1b[0m");
{
  check("tutti e 14 i segmenti hanno dei vicini", NOMI.every(n => (VIC[n] || []).length > 0),
        `${NOMI.filter(n => !(VIC[n] || []).length).join(", ") || "nessuno scoperto"}`);
  const nomi = (s) => (VIC[s] || []).map(v => v.nome).sort().join(",");
  check("l'omero destro confina con tronco e avambraccio",
        nomi("omero_dx") === "avambraccio_dx,tronco", nomi("omero_dx"));
  check("il tronco confina con testa, due omeri e due femori",
        nomi("tronco") === "femore_dx,femore_sx,omero_dx,omero_sx,testa", nomi("tronco"));
  check("la tibia destra confina con femore e piede",
        nomi("tibia_dx") === "femore_dx,piede_dx", nomi("tibia_dx"));
  check("il giunto omero-avambraccio e' il gomito",
        VIC.omero_dx.find(v => v.nome === "avambraccio_dx").giunto === A.gomito_dx);
  check("il giunto omero-tronco e' la spalla, non la meta' delle spalle",
        VIC.omero_dx.find(v => v.nome === "tronco").giunto === A.spalla_dx);
  check("nessun segmento e' vicino di se stesso",
        NOMI.every(n => !(VIC[n] || []).some(v => v.nome === n)));
  check("la parentela e' completa: ogni segmento c'e'",
        NOMI.every(n => n in PADRE), NOMI.filter(n => !(n in PADRE)).join(", "));
}

console.log("\n\x1b[1m2. Un osso non si piega mai\x1b[0m");
{
  // Un femore che arriva fin dentro l'anca e fin dentro il ginocchio: se la
  // regola non tenesse, i vertici alle due estremita' prenderebbero peso dal
  // bacino e dalla tibia.
  const pos = new Float32Array([
    -0.09, 0.93, 0,      // proprio sul giunto dell'anca
    -0.10, 0.70, 0,      // meta' femore
    -0.10, 0.50, 0,      // proprio sul ginocchio
  ]);
  const r = pesiGruppo(pos, "femore_dx", VIC, INDICE, false);
  check("tutto il peso resta sul femore, anche dentro le articolazioni",
        [0, 1, 2].every(i => r.pesi[i*4] === 1 && r.indici[i*4] === INDICE.femore_dx));
  check("nessun altro osso viene coinvolto", r.usate.size === 1, `${r.usate.size}`);
  check("nessun vertice risulta mescolato", quantiMescolati(r.pesi) === 0);
}

console.log("\n\x1b[1m3. Un muscolo si piega, ma solo all'articolazione\x1b[0m");
{
  // Un bicipite lungo tutto l'omero: la pancia sta a meta', i capi arrivano
  // alla spalla e al gomito.
  const pos = new Float32Array([
    -0.18, 1.40, 0,      // esattamente sul centro della spalla
    -0.18, 1.40, 0.03,   // origine, appena davanti alla spalla
    -0.19, 1.32, 0.04,   // vicino alla spalla
    -0.19, 1.27, 0.05,   // pancia alta
    -0.20, 1.13, 0,      // esattamente sul centro del gomito
  ]);
  const r = pesiGruppo(pos, "omero_dx", VIC, INDICE, true);
  const peso = (i, osso) => {
    for (let k = 0; k < 4; k++) if (r.indici[i*4+k] === INDICE[osso]) return r.pesi[i*4+k];
    return 0;
  };
  check("sul centro della spalla la carne e' meta' e meta'",
        Math.abs(peso(0, "tronco") - 0.5) < 1e-6, `tronco ${peso(0, "tronco").toFixed(3)}`);
  check("sul centro del gomito idem, fra braccio e avambraccio",
        Math.abs(peso(4, "avambraccio_dx") - 0.5) < 1e-6,
        `avambraccio ${peso(4, "avambraccio_dx").toFixed(3)}`);
  check("all'origine, tre centimetri piu' in la', la quota e' gia' scesa",
        peso(1, "tronco") > 0.2 && peso(1, "tronco") < 0.45,
        `tronco ${peso(1, "tronco").toFixed(3)}`);
  check("la pancia del muscolo e' tutta del suo osso",
        peso(3, "omero_dx") > 0.98, `omero ${peso(3, "omero_dx").toFixed(3)}`);
  check("fra spalla e pancia la mescolanza cala senza salti",
        peso(0, "tronco") > peso(1, "tronco") && peso(1, "tronco") > peso(2, "tronco")
        && peso(2, "tronco") > peso(3, "tronco"),
        [0,1,2,3].map(i => peso(i, "tronco").toFixed(3)).join(" > "));
  check("una pancia non prende mai peso dall'avambraccio",
        peso(3, "avambraccio_dx") === 0);
}

console.log("\n\x1b[1m4. Niente peso da ossa con cui non ci si articola\x1b[0m");
{
  // Una costola, larga, che arriva vicino alla spalla: e' del tronco, e con la
  // mano destra non c'entra niente per quanto il braccio le penda accanto.
  const pos = new Float32Array([
    -0.14, 1.30, 0.08,  -0.16, 1.20, 0.10,  0.14, 1.30, 0.08,  0, 1.10, 0.12,
  ]);
  const r = pesiGruppo(pos, "tronco", VIC, INDICE, true);
  const ammessi = new Set([INDICE.tronco, ...VIC.tronco.map(v => INDICE[v.nome])]);
  let intrusi = 0;
  for (let i = 0; i < r.pesi.length; i++)
    if (r.pesi[i] > 0 && !ammessi.has(r.indici[i])) intrusi++;
  check("nessun peso finisce su un osso non confinante", intrusi === 0, `${intrusi}`);
  check("la mano non compare mai fra le ossa usate",
        !r.usate.has(INDICE.mano_dx) && !r.usate.has(INDICE.mano_sx));
  // Il tronco ha cinque vicini: quattro caselle per vertice devono bastare
  // comunque, perche' i giunti sono lontani fra loro.
  check("quattro caselle per vertice bastano davvero",
        Array.from({ length: 4 }, (_, i) =>
          [0,1,2,3].filter(k => r.pesi[i*4+k] > 0).length).every(c => c <= MAX_OSSA));
}

console.log("\n\x1b[1m5. I pesi sommano sempre a uno\x1b[0m");
{
  // Una nuvola fitta su tutto il corpo, ossa deformabili e no: se da qualche
  // parte la somma non fa uno, li' la carne cambia dimensione.
  let peggio = 0, contati = 0;
  let seme = 99;
  const caso = () => { seme = (seme * 1103515245 + 12345) & 0x7fffffff; return seme / 0x7fffffff; };
  for (const seg of NOMI) {
    const pos = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      pos[i*3]   = (caso() - 0.5) * 0.9;
      pos[i*3+1] = caso() * 1.8;
      pos[i*3+2] = (caso() - 0.5) * 0.5;
    }
    for (const def of [true, false]) {
      const r = pesiGruppo(pos, seg, VIC, INDICE, def);
      for (let i = 0; i < 300; i++) {
        const s = r.pesi[i*4] + r.pesi[i*4+1] + r.pesi[i*4+2] + r.pesi[i*4+3];
        peggio = Math.max(peggio, Math.abs(s - 1)); contati++;
      }
    }
  }
  check("su ogni vertice del corpo la somma fa uno", peggio < 1e-6,
        `scarto massimo ${peggio.toExponential(1)} su ${contati} vertici`);
}

console.log("\n\x1b[1m6. Piegando il gomito la carne segue davvero\x1b[0m");
{
  // La prova che conta: si costruiscono le matrici dei due segmenti in una posa
  // a gomito piegato e si guarda dove finisce un vertice all'altezza del
  // gomito. Rigido resterebbe sull'asse del braccio; mescolato deve finire a
  // meta' strada fra le due soluzioni, che e' quel che piega il ventre.
  const rif = (nome) => {
    const s = SEGMENTI[nome], a = A[s.ancore[0]], b = A[s.ancore[1]];
    return { ancoraA: a, lunghezzaRiposo: Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]),
             frame: frameSegmento(a, b, SK.su, SK.avanti) };
  };
  // Posa viva: braccio fermo, avambraccio piegato in avanti di 90 gradi.
  const spalla = A.spalla_dx, gomito = A.gomito_dx;
  const polsoPiegato = [gomito[0], gomito[1], gomito[2] + 0.26];
  const Mo = matricePosa(rif("omero_dx"), spalla, gomito, SK.su, SK.avanti, 1);
  const Ma = matricePosa(rif("avambraccio_dx"), gomito, polsoPiegato, SK.su, SK.avanti, 1);
  check("le due matrici si costruiscono", !!Mo && !!Ma);

  // Un vertice del bicipite proprio sul gomito: pesi 50/50.
  const v = [-0.20, 1.13, 0.04];
  const rigido = applica(Mo, v);
  const altro  = applica(Ma, v);
  const misto  = [0, 1, 2].map(k => 0.5 * rigido[k] + 0.5 * altro[k]);
  const scartoRigido = Math.hypot(...[0,1,2].map(k => misto[k] - rigido[k]));
  check("il vertice mescolato non finisce dove finirebbe rigido",
        scartoRigido > 0.01, `${(scartoRigido * 1000).toFixed(0)} mm di differenza`);
  check("sta esattamente a meta' fra le due soluzioni",
        Math.abs(Math.hypot(...[0,1,2].map(k => misto[k] - altro[k])) - scartoRigido) < 1e-9);
  // Sul giunto stesso le due matrici concordano quasi: e' il punto fisso della
  // rotazione. Il divario cresce allontanandosi, ed e' li' che si vede.
  const lontano = [-0.20, 1.05, 0.04];      // gia' nell'avambraccio
  const div = Math.hypot(...[0,1,2].map(k => applica(Mo, lontano)[k] - applica(Ma, lontano)[k]));
  check("piu' ci si allontana dal giunto, piu' le due ossa divergono",
        div > scartoRigido, `${(div * 1000).toFixed(0)} mm contro ${(scartoRigido * 1000).toFixed(0)}`);
}

console.log("\n\x1b[1m7. Conti e tipi\x1b[0m");
{
  check("muscolo, cartilagine e legamento si deformano",
        DEFORMABILI.has(1) && DEFORMABILI.has(2) && DEFORMABILI.has(4));
  check("osso e dente no", !DEFORMABILI.has(0) && !DEFORMABILI.has(3));
  const pos = new Float32Array([-0.18, 1.40, 0.03, -0.19, 1.27, 0.05]);
  const r = pesiGruppo(pos, "omero_dx", VIC, INDICE, true);
  check("si contano i vertici davvero mescolati", quantiMescolati(r.pesi) === 1,
        `${quantiMescolati(r.pesi)} di 2`);
  check("le ossa usate sono solo quelle che servono", r.usate.size === 2, `${r.usate.size}`);
  // Uno scheletro monco non deve far cadere niente: capita con modelli parziali.
  const monco = adiacenze({ ancore: { midAnche: A.midAnche, midSpalle: A.midSpalle },
                            su: SK.su, avanti: SK.avanti });
  check("uno scheletro senza arti non manda in errore",
        Array.isArray(monco.tronco) && monco.tronco.length === 0,
        `${Object.keys(monco).join(",") || "vuoto"}`);
  const rm = pesiGruppo(pos, "tronco", monco, INDICE, true);
  check("e i suoi pesi restano validi",
        rm.pesi[0] === 1 && rm.pesi[4] === 1);
}

console.log("\n\x1b[1m8. Le normali restano perpendicolari alla superficie\x1b[0m");
{
  // Una normale trasformata come un punto si storce dove la scala e'
  // anisotropa, e l'illuminazione la segue. La verifica vera e' geometrica: una
  // direzione perpendicolare alla superficie deve restare perpendicolare alla
  // superficie trasformata, cioe' a ogni tangente.
  const s = SEGMENTI.omero_dx;
  const l = { ancoraA: A[s.ancore[0]],
              lunghezzaRiposo: Math.hypot(...[0,1,2].map(k => A[s.ancore[1]][k] - A[s.ancore[0]][k])),
              frame: frameSegmento(A[s.ancore[0]], A[s.ancore[1]], SK.su, SK.avanti) };
  // Braccio scorciato dalla prospettiva e muscolo contratto: la scala lungo
  // l'asse va al minimo consentito e quella di traverso al massimo, cioe' quasi
  // il doppio dell'altra. E' il caso in cui l'anisotropia morde davvero, ed e'
  // una posa che capita di continuo — basta puntare il braccio verso
  // l'obiettivo mentre si contrae il bicipite.
  const a1 = [-0.30, 1.36, 0.05], b1 = [-0.36, 1.22, 0.11];
  const M = matricePosa(l, a1, b1, SK.su, SK.avanti, 1.15, 1.28);
  const N = matriceNormali(l, a1, b1, SK.su, SK.avanti, 1.15, 1.28);
  check("la matrice delle normali si costruisce", !!N && N.length === 9);

  const perN = (v) => [N[0]*v[0] + N[3]*v[1] + N[6]*v[2],
                       N[1]*v[0] + N[4]*v[1] + N[7]*v[2],
                       N[2]*v[0] + N[5]*v[1] + N[8]*v[2]];
  // Direzione trasformata come differenza di due punti: la parte lineare di M.
  const perM = (v) => [0,1,2].map(k => applica(M, v)[k] - applica(M, [0,0,0])[k]);

  let peggio = 0, peggioIngenuo = 0;
  let seme = 5;
  const caso = () => { seme = (seme * 1103515245 + 12345) & 0x7fffffff; return seme / 0x7fffffff - 0.5; };
  for (let i = 0; i < 200; i++) {
    const n = [caso(), caso(), caso()];
    const ln = Math.hypot(...n); if (ln < 1e-6) continue;
    for (let k = 0; k < 3; k++) n[k] /= ln;
    // Una tangente qualsiasi perpendicolare a n.
    let t = [caso(), caso(), caso()];
    const d = t[0]*n[0] + t[1]*n[1] + t[2]*n[2];
    for (let k = 0; k < 3; k++) t[k] -= d * n[k];
    const lt = Math.hypot(...t); if (lt < 1e-6) continue;
    for (let k = 0; k < 3; k++) t[k] /= lt;

    const nt = perN(n), tt = perM(t);
    const cos = (nt[0]*tt[0] + nt[1]*tt[1] + nt[2]*tt[2]) /
                (Math.hypot(...nt) * Math.hypot(...tt));
    peggio = Math.max(peggio, Math.abs(cos));
    // Lo stesso conto trattando la normale come un punto: e' l'errore che si
    // farebbe senza inversa trasposta, e serve per sapere che la prova morde.
    const ni = perM(n);
    const cosI = (ni[0]*tt[0] + ni[1]*tt[1] + ni[2]*tt[2]) /
                 (Math.hypot(...ni) * Math.hypot(...tt));
    peggioIngenuo = Math.max(peggioIngenuo, Math.abs(cosI));
  }
  check("resta perpendicolare a ogni tangente, su 200 direzioni",
        peggio < 1e-9, `scostamento massimo ${peggio.toExponential(1)}`);
  check("e senza la correzione si sbaglierebbe di parecchio",
        peggioIngenuo > 0.2,
        `fino a ${(Math.asin(Math.min(1, peggioIngenuo)) * 180 / Math.PI).toFixed(0)} gradi di errore`);
}

console.log(`\n\x1b[1m${ok} verifiche superate, ${ko} fallite\x1b[0m\n`);
process.exit(ko ? 1 : 0);
