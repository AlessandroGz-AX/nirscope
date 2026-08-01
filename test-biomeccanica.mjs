// Prove sul modello biomeccanico.
//
// Non basta che i conti tornino: devono tornare i fatti. Le lombari quasi non
// ruotano, C1-C2 fa da sola meta' della torsione del collo, la scapola sotto i
// trenta gradi sta ferma, e una catena di rotazioni piccole deve restare
// attaccata a se stessa invece di sfaldarsi. Sono queste le cose che, se
// sbagliate, si vedono nel modello.
import {
  MOBILITA, LIVELLI, FLESSIONE, LATERALE, ROTAZIONE,
  quote, distribuisci, escursione, rotazioneScapola, SOGLIA_SCAPOLA,
  quotaLombare, flessioneSpinale, limita, LIMITI, catena, applicaCatena, ruota,
} from "./biomeccanica.js";

let ok = 0, ko = 0;
const check = (n, c, e = "") => {
  if (c) { ok++; console.log(`  \x1b[32m✓\x1b[0m ${n}${e ? "  " + e : ""}`); }
  else { ko++; console.log(`  \x1b[31m✗\x1b[0m ${n}${e ? "  " + e : ""}`); }
};
const LOMBARI = ["L1", "L2", "L3", "L4", "L5"];
const TORACICHE = LIVELLI.filter(n => n[0] === "T");
const CERVICALI = LIVELLI.filter(n => n[0] === "C");

console.log("\n\x1b[1m1. La tabella dice quel che dice l'anatomia\x1b[0m");
{
  check("ci sono tutti e 24 i livelli presacrali", LIVELLI.length === 24, `${LIVELLI.length}`);
  check("ogni livello ha i tre piani",
        LIVELLI.every(n => (MOBILITA[n] || []).length === 3),
        LIVELLI.filter(n => !MOBILITA[n]).join(", "));
  check("nessuna mobilita' negativa o assurda",
        LIVELLI.every(n => MOBILITA[n].every(v => v >= 0 && v <= 90)));
  // L'invariante che tiene onesta tutta la tabella: ogni regione deve sommare
  // esattamente quel che si misura col goniometro su una persona viva.
  for (const [reg, nomi, att] of [
        ["cervicale", CERVICALI, [110, 90, 160]],
        ["toracica",  TORACICHE, [28, 36, 45]],
        ["lombare",   LOMBARI,   [60, 40, 13]]]) {
    check(`la regione ${reg} somma i valori clinici`,
          [0,1,2].every(k => Math.abs(escursione(nomi, k) - att[k]) < 1e-9),
          [0,1,2].map(k => escursione(nomi, k).toFixed(0) + "°").join(" / "));
  }

  // Il fatto che conta di piu': in torsione il torace vale molte volte le
  // lombari. Chi lo sbaglia fa ruotare il bacino con le spalle.
  const rotT = escursione(TORACICHE, ROTAZIONE), rotL = escursione(LOMBARI, ROTAZIONE);
  check("le toraciche ruotano piu' del triplo delle lombari", rotT > rotL * 3,
        `${rotT.toFixed(0)}° contro ${rotL.toFixed(0)}°`);
  check("una lombare ruota si' e no due gradi e mezzo per lato",
        LOMBARI.every(n => MOBILITA[n][ROTAZIONE] <= 3),
        LOMBARI.map(n => MOBILITA[n][ROTAZIONE]).join(", "));

  // In flessione e' il contrario: sono le lombari a piegarsi.
  const flexL = escursione(LOMBARI, FLESSIONE) / LOMBARI.length;
  const flexT = escursione(TORACICHE, FLESSIONE) / TORACICHE.length;
  check("in flessione una lombare batte una toracica", flexL > flexT,
        `${flexL.toFixed(1)}° contro ${flexT.toFixed(1)}° per livello`);
  check("il massimo di flessione sta a L4, non in cima ne' in fondo",
        MOBILITA.L4[FLESSIONE] === Math.max(...LOMBARI.map(n => MOBILITA[n][FLESSIONE])),
        `L4 ${MOBILITA.L4[FLESSIONE]}°`);

  // C1-C2 e' l'articolazione della rotazione della testa.
  const rotC = escursione(CERVICALI, ROTAZIONE);
  check("C1-C2 da sola vale meta' della torsione del collo",
        MOBILITA.C1[ROTAZIONE] / rotC > 0.4 && MOBILITA.C1[ROTAZIONE] / rotC < 0.7,
        `${(100 * MOBILITA.C1[ROTAZIONE] / rotC).toFixed(0)}%`);

  // Confronto con le escursioni totali misurate in clinica.
  // Le toraciche flettono poco ma ruotano tanto: e' la gabbia toracica che
  // frena il piano sagittale senza impedire la torsione.
  check("il torace ruota molto piu' di quanto flette",
        escursione(TORACICHE, ROTAZIONE) > escursione(TORACICHE, FLESSIONE) * 1.5,
        `${escursione(TORACICHE, ROTAZIONE).toFixed(0)}° contro ${escursione(TORACICHE, FLESSIONE).toFixed(0)}°`);
  check("i lombi fanno il contrario", escursione(LOMBARI, FLESSIONE) > escursione(LOMBARI, ROTAZIONE) * 4,
        `${escursione(LOMBARI, FLESSIONE).toFixed(0)}° contro ${escursione(LOMBARI, ROTAZIONE).toFixed(0)}°`);
}

console.log("\n\x1b[1m2. Il movimento si spartisce in proporzione alla mobilita'\x1b[0m");
{
  const q = quote(LOMBARI, FLESSIONE);
  check("le quote sommano a uno", Math.abs(q.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  check("L4 prende piu' di L1, come la sua mobilita'", q[3] > q[0],
        `${(q[3]*100).toFixed(1)}% contro ${(q[0]*100).toFixed(1)}%`);

  const a = distribuisci(40, LOMBARI, FLESSIONE);
  check("quaranta gradi di lombare si spartiscono tutti",
        Math.abs(a.reduce((x, y) => x + y, 0) - 40) < 1e-9,
        `${a.map(x => x.toFixed(1)).join(" + ")}`);
  check("nessun livello supera la propria escursione",
        a.every((x, i) => Math.abs(x) <= MOBILITA[LOMBARI[i]][FLESSIONE] + 1e-9));

  // Chiedendo l'impossibile, ogni livello si ferma al suo massimo invece di
  // piegarsi oltre: e' quello che fa una schiena, non un tubo di gomma.
  const troppo = distribuisci(500, LOMBARI, FLESSIONE);
  check("chiedendo cinquecento gradi ci si ferma all'escursione vera",
        Math.abs(troppo.reduce((x, y) => x + y, 0) - escursione(LOMBARI, FLESSIONE)) < 1e-9,
        `${troppo.reduce((x, y) => x + y, 0).toFixed(1)}° di ${escursione(LOMBARI, FLESSIONE)}`);
  check("funziona anche all'indietro",
        distribuisci(-500, LOMBARI, FLESSIONE).every((x, i) =>
          Math.abs(x + MOBILITA[LOMBARI[i]][FLESSIONE]) < 1e-9));

  // Una torsione del tronco deve finire quasi tutta nel torace.
  const tutta = [...LOMBARI, ...TORACICHE];
  const t = distribuisci(45, tutta, ROTAZIONE);
  const quotaLomb = t.slice(0, 5).reduce((x, y) => x + y, 0) / 45;
  check("torcendo il tronco, ai lombi tocca meno di un quarto",
        quotaLomb < 0.25, `${(quotaLomb * 100).toFixed(1)}%`);
  // Per livello la differenza e' meno estrema che per regione, perche' le
  // toraciche sono dodici e le lombari cinque: e' anche il numero a fare la
  // mobilita' complessiva, non solo la mobilita' del singolo disco.
  check("ma per singolo livello la differenza e' piu' contenuta",
        MOBILITA.T6[ROTAZIONE] / MOBILITA.L3[ROTAZIONE] > 1.2 &&
        MOBILITA.T6[ROTAZIONE] / MOBILITA.L3[ROTAZIONE] < 2.5,
        `T6 ${MOBILITA.T6[ROTAZIONE].toFixed(1)}° contro L3 ${MOBILITA.L3[ROTAZIONE].toFixed(1)}°`);
}

console.log("\n\x1b[1m3. La scapola segue il braccio, ma non subito\x1b[0m");
{
  check("a venti gradi la scapola sta ferma", rotazioneScapola(20) === 0);
  check("alla soglia e' ancora ferma", rotazioneScapola(SOGLIA_SCAPOLA) === 0);
  check("a novanta gradi ruota di venti", Math.abs(rotazioneScapola(90) - 20) < 1e-9,
        `${rotazioneScapola(90).toFixed(1)}°`);
  check("a elevazione piena fa una cinquantina di gradi",
        Math.abs(rotazioneScapola(180) - 50) < 1e-9, `${rotazioneScapola(180).toFixed(1)}°`);
  check("il braccio ne fa sempre il doppio di lei, oltre la soglia",
        Math.abs((180 - rotazioneScapola(180) - SOGLIA_SCAPOLA) / rotazioneScapola(180) - 2) < 1e-9);
  check("abbassando il braccio va dall'altra parte",
        rotazioneScapola(-90) === -rotazioneScapola(90));
  check("cresce sempre, senza scalini",
        Array.from({length: 60}, (_, i) => rotazioneScapola(i * 3))
             .every((v, i, a) => i === 0 || v >= a[i-1]));
}

console.log("\n\x1b[1m4. Piegandosi in avanti, prima la schiena poi le anche\x1b[0m");
{
  check("all'inizio comanda la colonna: quattro quinti", Math.abs(quotaLombare(0.1) - 0.8) < 1e-9,
        `${(quotaLombare(0.1) * 100).toFixed(0)}%`);
  check("a meta' si pareggiano", Math.abs(quotaLombare(0.5) - 0.5) < 1e-9);
  check("alla fine comanda il bacino", quotaLombare(0.9) < 0.3,
        `${(quotaLombare(0.9) * 100).toFixed(0)}%`);
  check("la quota cala sempre, mai risale",
        Array.from({length: 40}, (_, i) => quotaLombare(i / 39))
             .every((v, i, a) => i === 0 || v <= a[i-1] + 1e-12));

  // Su un piegamento intero, poco piu' della meta' viene dalla colonna.
  const f = flessioneSpinale(90);
  check("su novanta gradi di tronco, circa la meta' e' colonna",
        f > 35 && f < 55, `${f.toFixed(1)}°`);
  check("e' proporzionale: meta' inclinazione, meta' flessione",
        Math.abs(flessioneSpinale(45) - f / 2) < 1e-9);
  check("a tronco dritto non flette niente", flessioneSpinale(0) === 0);
}

console.log("\n\x1b[1m5. Le articolazioni non vanno dove non possono\x1b[0m");
{
  check("un ginocchio non si piega all'indietro", limita(-30, "ginocchio") === 0);
  check("ne' oltre il possibile in avanti", limita(200, "ginocchio") === LIMITI.ginocchio.max);
  check("un angolo normale passa intatto", limita(75, "ginocchio") === 75);
  check("un giunto sconosciuto non viene toccato", limita(999, "chissa") === 999);
  check("l'anca ammette un po' di estensione", limita(-15, "anca") === -15);
  check("ma non trenta gradi", limita(-30, "anca") === LIMITI.anca.min);
}

console.log("\n\x1b[1m6. La catena resta attaccata a se stessa\x1b[0m");
{
  // Cinque livelli lungo l'asse verticale, distanziati di 5 cm.
  const punti = [0, 1, 2, 3, 4].map(i => [0, i * 0.05, 0]);
  const assi = { laterale: [1, 0, 0], avanti: [0, 0, 1], su: [0, 1, 0] };

  // Senza rotazioni, niente si muove.
  const ferma = catena(punti, punti.map(() => [0, 0, 0]), assi);
  check("ad angoli nulli la catena e' l'identita'",
        ferma.every((T, i) => applicaCatena(T, punti[i])
          .every((v, k) => Math.abs(v - punti[i][k]) < 1e-12)));

  // Ogni livello flette di 10 gradi: deve uscire una curva, non un'asse.
  const gradi = punti.map(() => [10, 0, 0]);
  const curva = catena(punti, gradi, assi);
  const pos = curva.map((T, i) => applicaCatena(T, punti[i]));

  // I livelli restano equidistanti: e' questa la prova che non si sfalda.
  const dist = [];
  for (let i = 1; i < pos.length; i++)
    dist.push(Math.hypot(pos[i][0]-pos[i-1][0], pos[i][1]-pos[i-1][1], pos[i][2]-pos[i-1][2]));
  check("le vertebre restano alla stessa distanza fra loro",
        dist.every(d => Math.abs(d - 0.05) < 1e-9),
        dist.map(d => (d*1000).toFixed(1)).join(", ") + " mm");

  // In cima la rotazione accumulata vale la somma dei livelli sotto.
  const su = [0, 1, 0];
  const cima = curva[curva.length - 1];
  const suRuotato = [cima.R[0][1], cima.R[1][1], cima.R[2][1]];
  const ang = Math.acos(Math.max(-1, Math.min(1, suRuotato[1]))) * 180 / Math.PI;
  check("in cima l'inclinazione e' la somma dei livelli sotto", Math.abs(ang - 40) < 1e-6,
        `${ang.toFixed(2)}° su quattro livelli da 10`);

  // La curva e' una curva: i punti non stanno su una retta.
  const corda = Math.hypot(pos[4][0]-pos[0][0], pos[4][1]-pos[0][1], pos[4][2]-pos[0][2]);
  check("la corda e' piu' corta dell'arco: si e' incurvata",
        corda < 0.2 - 1e-4, `${(corda*100).toFixed(2)} cm di arco 20 cm`);
  check("e la curva sporge dalla retta fra i due capi",
        (() => {
          // freccia: distanza del punto di mezzo dalla corda
          const d = [pos[4][0]-pos[0][0], pos[4][1]-pos[0][1], pos[4][2]-pos[0][2]];
          const L = Math.hypot(...d), u = d.map(v => v / L);
          const r = [pos[2][0]-pos[0][0], pos[2][1]-pos[0][1], pos[2][2]-pos[0][2]];
          const p = r[0]*u[0] + r[1]*u[1] + r[2]*u[2];
          return Math.hypot(r[0]-p*u[0], r[1]-p*u[1], r[2]-p*u[2]) > 0.005;
        })());

  // La rotazione assiale deve accumularsi attorno all'asse lungo, non piegare.
  const torta = catena(punti, punti.map(() => [0, 0, 9]), assi);
  const cimaT = torta[torta.length - 1];
  const suT = [cimaT.R[0][1], cimaT.R[1][1], cimaT.R[2][1]];
  check("torcendo, l'asse resta dritto", Math.abs(suT[1] - 1) < 1e-9,
        `componente verticale ${suT[1].toFixed(6)}`);
  const latT = [cimaT.R[0][0], cimaT.R[1][0], cimaT.R[2][0]];
  const angT = Math.atan2(latT[2], latT[0]) * 180 / Math.PI;
  check("e in cima si e' torto della somma", Math.abs(Math.abs(angT) - 36) < 1e-6,
        `${Math.abs(angT).toFixed(2)}° su quattro livelli da 9`);
}

console.log("\n\x1b[1m7. La rotazione di Rodrigues fa quel che deve\x1b[0m");
{
  const r = ruota([1, 0, 0], [0, 1, 0], 90);
  check("novanta gradi attorno alla verticale portano x su -z",
        Math.abs(r[0]) < 1e-12 && Math.abs(r[2] + 1) < 1e-12, r.map(v => v.toFixed(3)).join(", "));
  check("ruotare di zero non cambia niente",
        ruota([0.3, -0.2, 0.5], [0, 0, 1], 0).every((v, i) => Math.abs(v - [0.3,-0.2,0.5][i]) < 1e-12));
  check("la lunghezza si conserva",
        Math.abs(Math.hypot(...ruota([0.3, -0.2, 0.5], [0.6, 0.8, 0], 47)) -
                 Math.hypot(0.3, -0.2, 0.5)) < 1e-12);
  check("ruotare attorno a se stessi non fa niente",
        ruota([0, 1, 0], [0, 1, 0], 33).every((v, i) => Math.abs(v - [0,1,0][i]) < 1e-12));
}

console.log(`\n\x1b[1m${ok} verifiche superate, ${ko} fallite\x1b[0m\n`);
process.exit(ko ? 1 : 0);
