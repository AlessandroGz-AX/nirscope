// Prove sulla lisciatura della posa.
//
// Il punto non e' "sembra piu' liscio": si misura di quanto scende il tremolio
// a soggetto fermo e di quanti millimetri resta indietro il modello quando la
// persona si muove davvero. Le due cose tirano in direzioni opposte, ed e'
// proprio per quello che serve un filtro che cambia banda invece di una media
// a peso fisso: la prova 3 lo mette nero su bianco.
import { FiltroPosa, fiduciaPosa, consiglioInquadratura } from "./posa-filtro.js";

let ok = 0, ko = 0;
const check = (n, c, e = "") => {
  if (c) { ok++; console.log(`  \x1b[32m✓\x1b[0m ${n}${e ? "  " + e : ""}`); }
  else { ko++; console.log(`  \x1b[31m✗\x1b[0m ${n}${e ? "  " + e : ""}`); }
};

// Rumore ripetibile: due prove diverse devono vedere la stessa sequenza,
// altrimenti i confronti fra filtri non vogliono dire niente.
function rng(seme) {
  let s = seme >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const gauss = (r) => {
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const DT = 1000 / 30;                 // 30 fotogrammi al secondo
const SIGMA = 0.004;                  // 4 mm: quanto balla un landmark fermo
const N = 33;

/** Una posa con un solo punto interessante, il resto immobile. */
function posa(x, y, z) {
  const p = Array.from({ length: N }, () => [0, 0, 0]);
  p[16] = [x, y, z];
  return p;
}
const VIS_TUTTA = new Array(N).fill(1);

console.log("\n\x1b[1m1. A soggetto fermo il tremolio quasi sparisce\x1b[0m");
{
  const r = rng(7);
  const f = new FiltroPosa();
  let sGrezzo = 0, sLiscio = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const d = [gauss(r) * SIGMA, gauss(r) * SIGMA, gauss(r) * SIGMA];
    const out = f.applica(posa(0.2 + d[0], -0.3 + d[1], d[2]), VIS_TUTTA, i * DT);
    if (i < 60) continue;             // salta l'avvio del filtro
    const p = out.pts[16];
    sGrezzo += d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
    sLiscio += (p[0] - 0.2) ** 2 + (p[1] + 0.3) ** 2 + p[2] ** 2;
    n++;
  }
  const grezzo = Math.sqrt(sGrezzo / n), liscio = Math.sqrt(sLiscio / n);
  check("il tremolio si dimezza almeno due volte", grezzo / liscio > 2.2,
        `da ${(grezzo * 1000).toFixed(1)} mm a ${(liscio * 1000).toFixed(1)} mm, ` +
        `${(grezzo / liscio).toFixed(1)} volte`);
  check("resta sotto i 3 mm su tutti e tre gli assi insieme", liscio < 0.003,
        `${(liscio * 1000).toFixed(2)} mm`);
}

console.log("\n\x1b[1m2. In movimento il modello non resta indietro\x1b[0m");
{
  // Un braccio che si alza di 60 cm in mezzo secondo: 1,2 m/s, un gesto
  // normale, non uno scatto.
  const r = rng(21);
  const f = new FiltroPosa();
  for (let i = 0; i < 60; i++) f.applica(posa(0.2, -0.3, 0), VIS_TUTTA, i * DT);
  let peggio = 0;
  for (let i = 60; i < 90; i++) {
    const y = -0.3 + 0.6 * ((i - 60) / 15);
    const d = [gauss(r) * SIGMA, gauss(r) * SIGMA, gauss(r) * SIGMA];
    const out = f.applica(posa(0.2 + d[0], y + d[1], d[2]), VIS_TUTTA, i * DT);
    peggio = Math.max(peggio, Math.abs(out.pts[16][1] - y));
  }
  check("il ritardo massimo resta sotto i 3 cm", peggio < 0.03,
        `${(peggio * 1000).toFixed(0)} mm`);
}

console.log("\n\x1b[1m2b. Fermandosi di colpo non scappa avanti\x1b[0m");
{
  // Il recupero del ritardo estrapola dalla velocita': quando il movimento si
  // ferma di botto, per un attimo continua a spingere. Va tenuto piccolo,
  // altrimenti il modello sembra di gomma — ed e' il difetto che il recupero
  // puo' introdurre, quindi va sorvegliato per sempre.
  const r = rng(33);
  const f = new FiltroPosa();
  for (let i = 0; i < 30; i++) f.applica(posa(0, -0.3, 0), VIS_TUTTA, i * DT);
  for (let i = 30; i < 45; i++)
    f.applica(posa(0, -0.3 + 0.6 * ((i - 30) / 15) + gauss(r) * SIGMA, 0), VIS_TUTTA, i * DT);
  let oltre = 0, ultimo = 0;
  for (let i = 45; i < 90; i++) {
    ultimo = f.applica(posa(0, 0.3 + gauss(r) * SIGMA, 0), VIS_TUTTA, i * DT).pts[16][1];
    oltre = Math.max(oltre, ultimo - 0.3);
  }
  check("supera il bersaglio di meno di 1,5 cm", oltre < 0.015,
        `${(oltre * 1000).toFixed(0)} mm`);
  check("e si rimette esattamente sul bersaglio", Math.abs(ultimo - 0.3) < 0.003,
        `${((ultimo - 0.3) * 1000).toFixed(1)} mm dal bersaglio`);
}

console.log("\n\x1b[1m3. Meglio di una media a peso fisso, non solo diverso\x1b[0m");
{
  // Confronto onesto: si tara una media esponenziale semplice perche' tolga
  // ESATTAMENTE lo stesso tremolio del filtro vero, e poi si guarda chi resta
  // piu' indietro sul movimento. Senza pareggiare il rumore il confronto non
  // direbbe nulla, perche' qualunque filtro puo' essere reso piu' liscio.
  const misura = (passo) => {
    const r = rng(7);
    let sq = 0, n = 0;
    for (let i = 0; i < 300; i++) {
      const d = gauss(r) * SIGMA;
      passo(d, i);
      if (i >= 60) { sq += passo.ultimo ** 2; n++; }
    }
    return Math.sqrt(sq / n);
  };
  // rumore residuo del filtro vero, sul solo asse y
  const rumoreEuro = (() => {
    const r = rng(7); const f = new FiltroPosa();
    let sq = 0, n = 0;
    for (let i = 0; i < 300; i++) {
      const out = f.applica(posa(0, gauss(r) * SIGMA, 0), VIS_TUTTA, i * DT);
      if (i >= 60) { sq += out.pts[16][1] ** 2; n++; }
    }
    return Math.sqrt(sq / n);
  })();
  // Media esponenziale: a regime la varianza si riduce di a/(2-a). Si inverte
  // per trovare il peso che da' lo stesso rumore residuo.
  const rap = rumoreEuro / SIGMA;
  const a = 2 * rap * rap / (1 + rap * rap);

  const lagEuro = (() => {
    const r = rng(21); const f = new FiltroPosa();
    for (let i = 0; i < 60; i++) f.applica(posa(0, -0.3, 0), VIS_TUTTA, i * DT);
    let peggio = 0;
    for (let i = 60; i < 90; i++) {
      const y = -0.3 + 0.6 * ((i - 60) / 15);
      const out = f.applica(posa(0, y + gauss(r) * SIGMA, 0), VIS_TUTTA, i * DT);
      peggio = Math.max(peggio, Math.abs(out.pts[16][1] - y));
    }
    return peggio;
  })();
  const lagMedia = (() => {
    const r = rng(21); let x = -0.3;
    for (let i = 0; i < 60; i++) x += a * (-0.3 + gauss(r) * SIGMA - x);
    let peggio = 0;
    for (let i = 60; i < 90; i++) {
      const y = -0.3 + 0.6 * ((i - 60) / 15);
      x += a * (y + gauss(r) * SIGMA - x);
      peggio = Math.max(peggio, Math.abs(x - y));
    }
    return peggio;
  })();
  check("a pari tremolio, il ritardo e' almeno dimezzato", lagEuro < lagMedia * 0.5,
        `one euro ${(lagEuro * 1000).toFixed(0)} mm contro ` +
        `${(lagMedia * 1000).toFixed(0)} mm della media (peso ${a.toFixed(3)})`);
}

console.log("\n\x1b[1m4. I punti che la telecamera non vede stanno fermi\x1b[0m");
{
  const f = new FiltroPosa();
  for (let i = 0; i < 60; i++) f.applica(posa(0.2, -0.3, 0), VIS_TUTTA, i * DT);
  const fermo = f.applica(posa(0.2, -0.3, 0), VIS_TUTTA, 60 * DT).pts[16].slice();
  // Il polso finisce dietro la schiena: il modello smette di vederlo e comincia
  // a tirare a indovinare, con salti di decine di centimetri.
  const vis = VIS_TUTTA.slice(); vis[16] = 0.05;
  let scarto = 0, fermiVisti = false;
  for (let i = 61; i < 90; i++) {
    const salto = ((i % 2) ? 0.4 : -0.4);
    const out = f.applica(posa(0.2 + salto, -0.3 + salto, salto), vis, i * DT);
    scarto = Math.max(scarto, Math.abs(out.pts[16][1] - fermo[1]));
    if (out.fermi.includes(16)) fermiVisti = true;
  }
  check("il punto invisibile non insegue le ipotesi del modello", scarto < 0.001,
        `spostato di ${(scarto * 1000).toFixed(2)} mm contro i 400 del grezzo`);
  check("viene segnalato come tenuto fermo", fermiVisti);

  // Visibilita' incerta ma non nulla: deve seguire, con molta piu' inerzia.
  // Il confronto e' contro lo stesso identico filtro a visibilita' piena: dire
  // solo "arriva" non proverebbe che sia piu' lento, e infatti su una corsa
  // lunga arrivano tutti e due.
  // Movimento vero a 1,2 m/s, non un salto istantaneo: su un salto la derivata
  // esplode, il filtro spalanca la banda per costruzione e la differenza si
  // perde. Sono i gesti reali che devono restare piu' cauti.
  const corri = (v) => {
    const g = new FiltroPosa();
    const vis = VIS_TUTTA.slice(); vis[16] = v;
    for (let i = 0; i < 60; i++) g.applica(posa(0, 0, 0), vis, i * DT);
    const tratto = [];
    for (let i = 60; i < 75; i++)
      tratto.push(g.applica(posa(0, 1.2 * (i - 59) * (DT / 1000), 0), vis, i * DT).pts[16][1]);
    return tratto;
  };
  // Quel che conta e' l'ordine: meno la telecamera vede un punto, piu' il
  // modello e' prudente nel seguirlo. Un numero secco su una sola visibilita'
  // direbbe poco, perche' la banda si stringe in proporzione e a meta' scala
  // la prudenza e' meta'.
  const scia = [1, 0.5, 0.3, 0.18].map(corri);
  const ritardo = scia.map(t => 1.2 * 10 * (DT / 1000) - t[9]);
  check("piu' il punto e' incerto, piu' il modello e' prudente",
        ritardo.every((r, i) => i === 0 || r > ritardo[i - 1]),
        ritardo.map(r => (r * 100).toFixed(1) + " cm").join(" < "));
  check("anche il piu' incerto continua a salire",
        scia[3][14] > scia[3][9] * 1.2 && scia[3][14] > 0.05,
        `arrivata a ${(scia[3][14] * 100).toFixed(1)} cm`);
}

console.log("\n\x1b[1m5. Un buco nel rilevamento non fa sparire il modello\x1b[0m");
{
  const f = new FiltroPosa({ attesa: 400 });
  for (let i = 0; i < 60; i++) f.applica(posa(0.2, -0.3, 0), VIS_TUTTA, i * DT);
  const a = f.applica(null, null, 60 * DT + 100);
  check("dopo 100 ms tiene l'ultima posa", a.pts !== null && a.fresco === false,
        `eta ${a.eta.toFixed(0)} ms`);
  check("la posa tenuta e' quella giusta", Math.abs(a.pts[16][1] + 0.3) < 0.01);
  const b = f.applica(null, null, 60 * DT + 600);
  check("dopo 600 ms si arrende", b.pts === null);
  // E riparte pulito, senza trascinarsi dietro il vecchio stato.
  const c = f.applica(posa(-0.9, 0.7, 0.2), VIS_TUTTA, 60 * DT + 700);
  check("alla ripresa si riaggancia subito, senza scivolare dal vecchio posto",
        Math.abs(c.pts[16][0] + 0.9) < 1e-9 && Math.abs(c.pts[16][1] - 0.7) < 1e-9);
}

console.log("\n\x1b[1m6. Nessun salto all'avvio e nessuna esplosione sui salti di tempo\x1b[0m");
{
  const f = new FiltroPosa();
  const primo = f.applica(posa(0.31, -0.42, 0.07), VIS_TUTTA, 1000);
  check("il primo fotogramma passa tale e quale",
        Math.abs(primo.pts[16][0] - 0.31) < 1e-12 && Math.abs(primo.pts[16][2] - 0.07) < 1e-12);
  // La scheda va in secondo piano per due secondi: al ritorno il dt enorme non
  // deve produrre una derivata assurda ne' un valore fuori scala.
  const dopo = f.applica(posa(0.33, -0.40, 0.07), VIS_TUTTA, 3000);
  check("un salto di due secondi non manda fuori scala",
        Number.isFinite(dopo.pts[16][0]) && Math.abs(dopo.pts[16][0]) < 1,
        `x = ${dopo.pts[16][0].toFixed(3)}`);
  // Due fotogrammi con lo stesso tempo: dt zero, divisione per zero in agguato.
  const g = new FiltroPosa();
  g.applica(posa(0, 0, 0), VIS_TUTTA, 5000);
  const pari = g.applica(posa(0.1, 0, 0), VIS_TUTTA, 5000);
  check("due fotogrammi con lo stesso tempo non danno NaN",
        Number.isFinite(pari.pts[16][0]), `${pari.pts[16][0]}`);
}

console.log("\n\x1b[1m7. La pagina sa dire come mettersi\x1b[0m");
{
  const v = new Array(N).fill(0.95);
  check("inquadratura buona: nessun consiglio", consiglioInquadratura(v) === null);
  check("fiducia alta", fiduciaPosa(v) > 0.9, fiduciaPosa(v).toFixed(2));

  const senzaGambe = v.slice(); senzaGambe[27] = senzaGambe[28] = 0.1;
  check("gambe fuori: dice di allontanarsi",
        /allontanati/i.test(consiglioInquadratura(senzaGambe) || ""),
        consiglioInquadratura(senzaGambe));

  const senzaTronco = v.slice();
  for (const i of [11, 12, 23, 24]) senzaTronco[i] = 0.1;
  check("nessuno davanti: lo dice per primo",
        /telecamera/i.test(consiglioInquadratura(senzaTronco) || ""),
        consiglioInquadratura(senzaTronco));
  check("la fiducia crolla senza tronco", fiduciaPosa(senzaTronco) < 0.5,
        fiduciaPosa(senzaTronco).toFixed(2));

  const senzaMani = v.slice(); senzaMani[15] = senzaMani[16] = 0.1;
  check("mani nascoste: lo segnala solo se il resto va bene",
        /braccia/i.test(consiglioInquadratura(senzaMani) || ""),
        consiglioInquadratura(senzaMani));
}

console.log("\n\x1b[1m8. Tutti e 33 i punti passano, nell'ordine\x1b[0m");
{
  const f = new FiltroPosa();
  const p = Array.from({ length: N }, (_, i) => [i * 0.01, i * 0.02, i * 0.03]);
  const out = f.applica(p, VIS_TUTTA, 0);
  check("stessa lunghezza", out.pts.length === N, `${out.pts.length}`);
  check("nessun punto scambiato di posto",
        out.pts.every((q, i) => Math.abs(q[1] - i * 0.02) < 1e-12));
  // Caselle vuote: MediaPipe le riempie sempre, ma il modello a bastoncini no.
  const buco = p.slice(); buco[7] = null;
  const out2 = f.applica(buco, VIS_TUTTA, DT);
  check("una casella vuota non fa cadere le altre",
        out2.pts.length === N && out2.pts[8] !== null);
}

console.log(`\n\x1b[1m${ok} verifiche superate, ${ko} fallite\x1b[0m\n`);
process.exit(ko ? 1 : 0);
