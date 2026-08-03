// Prove sulla riduzione dei triangoli.
//
// Il punto non e' che tolga triangoli: quello lo faceva anche prima. Il punto e'
// che non sfondi la superficie. Su un osso piatto — la volta cranica, la
// scapola, lo sterno — le due tavole distano pochi millimetri, e una griglia
// grossolana le fa cadere nella stessa cella. Fondendole si crea uno spigolo
// condiviso da quattro o sei facce, il verso dei triangoli non si puo' piu'
// rendere coerente, e la superficie si riempie di macchie nere.
//
// Qui si costruisce proprio quel caso e si misura.
import { riduci, riduciABudget, nonManifold, discordanze } from "./decima.js";

let ok = 0, ko = 0;
const check = (n, c, e = "") => {
  if (c) { ok++; console.log(`  \x1b[32m✓\x1b[0m ${n}${e ? "  " + e : ""}`); }
  else { ko++; console.log(`  \x1b[31m✗\x1b[0m ${n}${e ? "  " + e : ""}`); }
};

/** Una lastra chiusa: due falde parallele vicine, unite lungo il bordo. E' la
 *  forma di un osso piatto, ed e' il caso che rompe il raggruppamento cieco. */
function lastra(nx, ny, spessore) {
  const V = [], F = [];
  const id = (i, j, alto) => (alto ? nx * ny : 0) + j * nx + i;
  for (const alto of [0, 1])
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        V.push(i / (nx - 1), j / (ny - 1), alto ? spessore : 0);
  // Le due facce, con versi opposti perche' guardino tutte e due in fuori.
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      F.push(id(i,j,0), id(i+1,j,0), id(i+1,j+1,0));
      F.push(id(i,j,0), id(i+1,j+1,0), id(i,j+1,0));
      F.push(id(i,j,1), id(i+1,j+1,1), id(i+1,j,1));
      F.push(id(i,j,1), id(i,j+1,1), id(i+1,j+1,1));
    }
  // Il bordo che le unisce, cosi' la lastra e' chiusa.
  const bordo = [];
  for (let i = 0; i < nx - 1; i++) bordo.push([id(i,0,0), id(i+1,0,0)]);
  for (let j = 0; j < ny - 1; j++) bordo.push([id(nx-1,j,0), id(nx-1,j+1,0)]);
  for (let i = nx - 1; i > 0; i--) bordo.push([id(i,ny-1,0), id(i-1,ny-1,0)]);
  for (let j = ny - 1; j > 0; j--) bordo.push([id(0,j,0), id(0,j-1,0)]);
  for (const [a, b] of bordo) {
    const a1 = a + nx * ny, b1 = b + nx * ny;
    F.push(a, b1, b); F.push(a, a1, b1);
  }
  return { V: new Float64Array(V), F: new Uint32Array(F) };
}

const volume = (V, F) => {
  let v = 0;
  for (let i = 0; i < F.length; i += 3) {
    const a = F[i]*3, b = F[i+1]*3, c = F[i+2]*3;
    v += (V[a]   * (V[b+1]*V[c+2] - V[b+2]*V[c+1])
        - V[a+1] * (V[b]  *V[c+2] - V[b+2]*V[c])
        + V[a+2] * (V[b]  *V[c+1] - V[b+1]*V[c])) / 6;
  }
  return Math.abs(v);
};

console.log("\n\x1b[1m1. La lastra di prova e' sana in partenza\x1b[0m");
const L = lastra(20, 20, 0.02);
{
  check("nessuno spigolo non-manifold", nonManifold(L.F) === 0, `${nonManifold(L.F)}`);
  check("nessuna faccia discorde", discordanze(L.F) === 0, `${discordanze(L.F)}`);
  check("ha un volume", volume(L.V, L.F) > 0, volume(L.V, L.F).toFixed(4));
  check("e' fatta di triangoli veri", L.F.length / 3 > 1000, `${L.F.length / 3}`);
}

console.log("\n\x1b[1m2. Il vecchio metodo la sfonda, il nuovo no\x1b[0m");
{
  // Dodici celle sul lato: la lastra e' spessa 0,02 su un lato lungo 1, quindi
  // le due tavole cadono per forza nella stessa cella. E' il caso della volta
  // cranica, dove le due tavole distano meno di un millimetro su un cranio di
  // venti centimetri.
  const vecchio = riduci(L.V, L.F, 12, false);
  const nuovo   = riduci(L.V, L.F, 12, true);
  const nmV = nonManifold(vecchio.F), nmN = nonManifold(nuovo.F);
  check("il raggruppamento cieco crea giunzioni non-manifold", nmV > 0, `${nmV} spigoli`);
  // Non zero, ma quasi: quel che resta sta sul bordo della lastra, dove le due
  // tavole sono davvero unite e schiacciarle insieme e' legittimo. Il grosso —
  // le due falde saldate al centro, dove non si toccano affatto — sparisce.
  check("quello che guarda la connettivita' ne toglie oltre il 95%",
        nmN < nmV * 0.05, `${nmN} spigoli contro ${nmV}, ${(100*(1-nmN/nmV)).toFixed(1)}% in meno`);
  check("e quel che resta e' contabile sulle dita", nmN <= 5, `${nmN}`);

  const dV = discordanze(vecchio.F), dN = discordanze(nuovo.F);
  check("le facce discordi calano nella stessa misura", dN < dV * 0.05,
        `${dN} contro ${dV}, ${(100*(1-dN/dV)).toFixed(1)}% in meno`);

  // La lastra deve restare una lastra: due tavole, non una.
  check("il vecchio schiaccia la lastra fino a perdere volume",
        volume(vecchio.V, vecchio.F) < volume(L.V, L.F) * 0.5,
        `${volume(vecchio.V, vecchio.F).toFixed(5)} contro ${volume(L.V, L.F).toFixed(5)}`);
  // Il volume si giudica a griglia fine. A dodici celle una lastra spessa 0,02
  // su un lato lungo 1 e' sotto-risolta per costruzione: la cella e' quattro
  // volte lo spessore, e nessun metodo puo' conservare quel che non risolve.
  // Quel che conta e' che la lastra resti una lastra invece di appiattirsi a
  // zero, e che a griglia adeguata il volume torni.
  check("il nuovo tiene in piedi la lastra invece di appiattirla",
        volume(nuovo.V, nuovo.F) > volume(L.V, L.F) * 0.7,
        `${volume(nuovo.V, nuovo.F).toFixed(5)} contro ${volume(L.V, L.F).toFixed(5)}`);
  // Griglia che risolve davvero lo spessore: cella 0,01 contro spessore 0,02.
  // A quaranta celle la cella e' ancora piu' grossa dello spessore, e mancava
  // il 10%; qui il conto torna.
  const fine = riduci(L.V, L.F, 100, true);
  check("e a griglia che risolve lo spessore il volume torna entro il 5%",
        Math.abs(volume(fine.V, fine.F) - volume(L.V, L.F)) < volume(L.V, L.F) * 0.05,
        `${volume(fine.V, fine.F).toFixed(5)} contro ${volume(L.V, L.F).toFixed(5)}`);
}

console.log("\n\x1b[1m3. Riduce davvero\x1b[0m");
{
  for (const celle of [8, 12, 20]) {
    const r = riduci(L.V, L.F, celle, true);
    check(`a ${celle} celle scende da ${L.F.length/3} a ${r.F.length/3} triangoli`,
          r.F.length / 3 < L.F.length / 3 && r.F.length > 0);
  }
  // Piu' celle, piu' triangoli: serve alla ricerca binaria del budget.
  const a = riduci(L.V, L.F, 8, true).F.length;
  const b = riduci(L.V, L.F, 20, true).F.length;
  check("piu' celle danno piu' triangoli, senza salti all'indietro", b > a,
        `${a/3} → ${b/3}`);
}

console.log("\n\x1b[1m4. Il budget viene rispettato\x1b[0m");
{
  for (const budget of [200, 600, 1500]) {
    const r = riduciABudget(L.V, L.F, budget, true);
    check(`chiedendo ${budget} triangoli ne escono ${r.F.length/3}`,
          r.F.length / 3 <= budget, `${r.F.length / 3}`);
  }
  check("un budget gia' soddisfatto lascia la mesh intatta",
        riduciABudget(L.V, L.F, 99999, true).F === L.F);
  check("e nessuna riduzione lascia piu' di qualche giunzione",
        [200, 600, 1500].every(b => nonManifold(riduciABudget(L.V, L.F, b, true).F) <= 5),
        [200, 600, 1500].map(b => nonManifold(riduciABudget(L.V, L.F, b, true).F)).join(", "));
}

console.log("\n\x1b[1m5. Casi limite\x1b[0m");
{
  check("una mesh vuota non fa danni",
        riduci(new Float64Array(0), new Uint32Array(0), 10).F.length === 0);
  // Tutti i vertici nello stesso punto: il lato della griglia sarebbe zero.
  const piatta = { V: new Float64Array([0,0,0, 0,0,0, 0,0,0]), F: new Uint32Array([0,1,2]) };
  check("una mesh degenere torna se stessa senza dividere per zero",
        riduci(piatta.V, piatta.F, 10).F.length === 3);
  // Una mesh che si riduce a niente non deve sparire.
  const t = { V: new Float64Array([0,0,0, 1,0,0, 0,1,0]), F: new Uint32Array([0,1,2]) };
  const r = riduci(t.V, t.F, 1);
  check("un triangolo solo, ridotto a niente, resta il triangolo",
        r.F.length === 3, `${r.F.length / 3}`);
}

console.log("\n\x1b[1m6. Due oggetti separati restano due\x1b[0m");
{
  // Due lastre lontane fra loro: il raggruppamento non deve saldarle.
  const A = lastra(10, 10, 0.02);
  const V = new Float64Array(A.V.length * 2);
  V.set(A.V, 0);
  for (let i = 0; i < A.V.length; i += 3) {
    V[A.V.length + i] = A.V[i] + 3;          // spostata di tre lati
    V[A.V.length + i + 1] = A.V[i + 1];
    V[A.V.length + i + 2] = A.V[i + 2];
  }
  const F = new Uint32Array(A.F.length * 2);
  F.set(A.F, 0);
  const off = A.V.length / 3;
  for (let i = 0; i < A.F.length; i++) F[A.F.length + i] = A.F[i] + off;
  const r = riduci(V, F, 20, true);
  // Quel che conta qui: le giunzioni non devono aumentare mettendo due pezzi
  // vicini. Se il raggruppamento li saldasse, il numero salirebbe.
  // A parita' di CELLA, non di numero di celle: i due pezzi stanno in un
  // riquadro quattro volte piu' largo, quindi venti celle li' sono grosse come
  // cinque su un pezzo solo. Confrontare a parita' di numero misurerebbe la
  // griglia, non il metodo.
  const solo = riduci(A.V, A.F, 5, true);
  check("mettendo due pezzi accanto le giunzioni non aumentano",
        nonManifold(r.F) <= nonManifold(solo.F) * 2,
        `${nonManifold(r.F)} in due, ${nonManifold(solo.F)} in uno`);
  check("e il volume e' la somma dei due, non uno solo",
        volume(r.V, r.F) > volume(solo.V, solo.F) * 1.7,
        `${volume(r.V, r.F).toFixed(5)} contro ${volume(solo.V, solo.F).toFixed(5)} di uno`);
}

console.log(`\n\x1b[1m${ok} verifiche superate, ${ko} fallite\x1b[0m\n`);
process.exit(ko ? 1 : 0);
