import { MUSCOLI, OSSA, frameCorpo, tracciaMuscolo, deformazione } from './muscoli.js';

// Posa in piedi, convenzione MediaPipe world: metri, origine fra le anche, y verso il basso.
function inPiedi() {
  const P = [];
  const set = (i, x, y, z) => P[i] = [x, y, z];
  set(0, 0, -0.68, 0.10);                              // naso, anteriore
  set(11, 0.19, -0.50, 0); set(12, -0.19, -0.50, 0);   // spalle (11 = sinistra soggetto)
  set(13, 0.22, -0.22, 0); set(14, -0.22, -0.22, 0);   // gomiti
  set(15, 0.24, 0.05, 0);  set(16, -0.24, 0.05, 0);    // polsi
  set(23, 0.09, 0, 0);     set(24, -0.09, 0, 0);       // anche
  set(25, 0.10, 0.45, 0);  set(26, -0.10, 0.45, 0);    // ginocchia
  set(27, 0.10, 0.90, 0);  set(28, -0.10, 0.90, 0);    // caviglie
  set(29, 0.10, 0.94, -0.04); set(30, -0.10, 0.94, -0.04);
  set(31, 0.10, 0.92, 0.12);  set(32, -0.10, 0.92, 0.12);
  for (const i of [17,18,19,20,21,22]) set(i, 0, 0, 0);
  for (const i of [1,2,3,4,5,6,7,8,9,10]) set(i, 0, -0.68, 0.08);
  return P;
}

/** Rotazione rigida di un gruppo di punti attorno a un perno.
 *  Le pose di prova devono essere rotazioni vere: scrivendo a mano le nuove
 *  coordinate si finisce per allungare o accorciare le ossa, e allora il test
 *  misura quella deformazione invece del movimento articolare. */
function ruota(P, indici, perno, asse, gradi) {
  const t = gradi * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const [ax, ay, az] = asse;
  for (const i of indici) {
    const v = [P[i][0]-perno[0], P[i][1]-perno[1], P[i][2]-perno[2]];
    const d = ax*v[0] + ay*v[1] + az*v[2];
    const cr = [ay*v[2]-az*v[1], az*v[0]-ax*v[2], ax*v[1]-ay*v[0]];
    P[i] = [
      perno[0] + v[0]*c + cr[0]*s + ax*d*(1-c),
      perno[1] + v[1]*c + cr[1]*s + ay*d*(1-c),
      perno[2] + v[2]*c + cr[2]*s + az*d*(1-c),
    ];
  }
}

const X = [1,0,0], Z = [0,0,1];
const lung = (P) => {
  const F = frameCorpo(P), out = {};
  for (const m of MUSCOLI) {
    const t = tracciaMuscolo(m, P, F);
    if (t) out[m.nome + ' ' + m.lato] = t.len;
  }
  return out;
};
const riposo = lung(inPiedi());
function strain(mod) {
  const P = inPiedi(); mod(P);
  const L = lung(P), out = {};
  for (const k in L) out[k] = deformazione(L[k], riposo[k]);
  return out;
}

const pct = v => (v*100).toFixed(1).padStart(6) + '%';
let fallite = 0;
function verifica(desc, val, atteso) {
  const ok = atteso === 'neg' ? val < -0.025 : val > 0.025;
  if (!ok) fallite++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${desc.padEnd(32)} ${pct(val)}  (atteso ${atteso === 'neg' ? 'accorciamento' : 'allungamento'})`);
}

// Verifica preliminare: le pose sono rotazioni rigide, le ossa non cambiano lunghezza.
{
  const A = inPiedi(), B = inPiedi();
  ruota(B, [15], B[13], X, 110);
  const d = (P,i,j) => Math.hypot(P[i][0]-P[j][0], P[i][1]-P[j][1], P[i][2]-P[j][2]);
  const err = Math.abs(d(A,13,15) - d(B,13,15)) / d(A,13,15);
  console.log(`\nRigidita' della rotazione di prova: errore ${(err*100).toFixed(4)}% sull'avambraccio`);
  if (err > 1e-6) fallite++;
}

console.log('\n— Flessione del gomito sinistro, 110° —');
let s = strain(P => ruota(P, [15,17,19,21], P[13], X, 110));
verifica('Bicipite brachiale Sx', s['Bicipite brachiale Sx'], 'neg');
verifica('Tricipite brachiale Sx', s['Tricipite brachiale Sx'], 'pos');
console.log(`  controlaterale fermo: bicipite Dx ${pct(s['Bicipite brachiale Dx'])}`);

console.log('\n— Abduzione della spalla sinistra, 85° —');
s = strain(P => ruota(P, [13,15,17,19,21], P[11], Z, -85));
verifica('Deltoide Sx', s['Deltoide Sx'], 'neg');

console.log('\n— Flessione del ginocchio sinistro, 95° —');
s = strain(P => ruota(P, [27,29,31], P[25], X, -95));
verifica('Retto femorale Sx', s['Retto femorale Sx'], 'pos');
verifica('Ischiocrurali Sx', s['Ischiocrurali Sx'], 'neg');

console.log('\n— Dorsiflessione della caviglia destra, 30° —');
s = strain(P => ruota(P, [30,32], P[28], X, 30));
verifica('Tibiale anteriore Dx', s['Tibiale anteriore Dx'], 'neg');
verifica('Gastrocnemio Dx', s['Gastrocnemio Dx'], 'pos');

console.log('\n— Flessione dell\'anca destra, 70° (ginocchio al petto) —');
s = strain(P => ruota(P, [26,28,30,32], P[24], X, 70));
verifica('Grande gluteo Dx', s['Grande gluteo Dx'], 'pos');

console.log(`\n${fallite === 0 ? 'Tutte le verifiche superate' : fallite + ' VERIFICHE FALLITE'} — ${MUSCOLI.length} muscoli, ${OSSA.length} segmenti ossei`);
process.exit(fallite ? 1 : 0);
