#!/usr/bin/env python3
"""
Prepara le mesh anatomiche di BodyParts3D per nirscope.

Da eseguire UNA VOLTA sul tuo computer. Dell'archivio completo — quasi un giga
e circa tremila strutture — servono una sessantina di pezzi: le ossa che si
vedono e i muscoli che il modello gia' calcola. Lo script li seleziona, li
riduce di risoluzione e scrive una cartella da caricare nel repository.

    python3 prepara-mesh.py ~/Downloads/BodyParts3D_obj.zip

Non serve installare niente oltre a numpy. Nessuna connessione: lavora solo sul
file che gli passi.

Sorgente: BodyParts3D, The Database Center for Life Science, licenza CC-BY-SA
2.1 Giappone. L'attribuzione va mantenuta nel repository.
"""

import argparse
import json
import pathlib
import re
import sys
import zipfile

try:
    import numpy as np
except ImportError:
    sys.exit("Manca numpy. Installalo con:  pip3 install numpy")


# Cio' che serve, e come riconoscerlo nei nomi inglesi dell'archivio.
# Ogni voce: (chiave interna, termini che devono comparire, termini da escludere)
STRUTTURE = [
    # ── Ossa ────────────────────────────────────────────────────────────
    ("cranio",           ["skull"],                              ["cavity", "base"]),
    ("mandibola",        ["mandible"],                           []),
    ("colonna_cervicale",["cervical", "vertebral column"],       []),
    ("colonna_toracica", ["thoracic", "vertebral column"],       []),
    ("colonna_lombare",  ["lumbar", "vertebral column"],         []),
    ("sacro",            ["sacrum"],                             []),
    ("gabbia_toracica",  ["rib cage"],                           []),
    ("sterno",           ["sternum"],                            []),
    ("clavicola_sx",     ["left", "clavicle"],                   []),
    ("clavicola_dx",     ["right", "clavicle"],                  []),
    ("scapola_sx",       ["left", "scapula"],                    []),
    ("scapola_dx",       ["right", "scapula"],                   []),
    ("omero_sx",         ["left", "humerus"],                    []),
    ("omero_dx",         ["right", "humerus"],                   []),
    ("radio_sx",         ["left", "radius"],                     ["nerve", "artery"]),
    ("radio_dx",         ["right", "radius"],                    ["nerve", "artery"]),
    ("ulna_sx",          ["left", "ulna"],                       ["nerve", "artery"]),
    ("ulna_dx",          ["right", "ulna"],                      ["nerve", "artery"]),
    ("mano_sx",          ["left", "hand"],                       ["muscle", "nerve", "artery", "skin"]),
    ("mano_dx",          ["right", "hand"],                      ["muscle", "nerve", "artery", "skin"]),
    ("bacino_sx",        ["left", "hip bone"],                   []),
    ("bacino_dx",        ["right", "hip bone"],                  []),
    ("femore_sx",        ["left", "femur"],                      ["nerve", "artery", "vein"]),
    ("femore_dx",        ["right", "femur"],                     ["nerve", "artery", "vein"]),
    ("rotula_sx",        ["left", "patella"],                    []),
    ("rotula_dx",        ["right", "patella"],                   []),
    ("tibia_sx",         ["left", "tibia"],                      ["nerve", "artery", "vein"]),
    ("tibia_dx",         ["right", "tibia"],                     ["nerve", "artery", "vein"]),
    ("perone_sx",        ["left", "fibula"],                     ["nerve", "artery", "vein"]),
    ("perone_dx",        ["right", "fibula"],                    ["nerve", "artery", "vein"]),
    ("piede_sx",         ["left", "foot"],                       ["muscle", "nerve", "artery", "skin"]),
    ("piede_dx",         ["right", "foot"],                      ["muscle", "nerve", "artery", "skin"]),

    # ── Muscoli: gli stessi che il modello cinematico gia' calcola ───────
    ("bicipite_sx",      ["left", "biceps brachii"],             []),
    ("bicipite_dx",      ["right", "biceps brachii"],            []),
    ("tricipite_sx",     ["left", "triceps brachii"],            []),
    ("tricipite_dx",     ["right", "triceps brachii"],           []),
    ("deltoide_sx",      ["left", "deltoid"],                    []),
    ("deltoide_dx",      ["right", "deltoid"],                   []),
    ("brachioradiale_sx",["left", "brachioradialis"],            []),
    ("brachioradiale_dx",["right", "brachioradialis"],           []),
    ("pettorale_sx",     ["left", "pectoralis major"],           []),
    ("pettorale_dx",     ["right", "pectoralis major"],          []),
    ("dorsale_sx",       ["left", "latissimus dorsi"],           []),
    ("dorsale_dx",       ["right", "latissimus dorsi"],          []),
    ("trapezio_sx",      ["left", "trapezius"],                  []),
    ("trapezio_dx",      ["right", "trapezius"],                 []),
    ("retto_addome_sx",  ["left", "rectus abdominis"],           []),
    ("retto_addome_dx",  ["right", "rectus abdominis"],          []),
    ("obliquo_sx",       ["left", "external oblique"],           []),
    ("obliquo_dx",       ["right", "external oblique"],          []),
    ("gluteo_sx",        ["left", "gluteus maximus"],            []),
    ("gluteo_dx",        ["right", "gluteus maximus"],           []),
    ("retto_femorale_sx",["left", "rectus femoris"],             []),
    ("retto_femorale_dx",["right", "rectus femoris"],            []),
    ("vasto_lat_sx",     ["left", "vastus lateralis"],           []),
    ("vasto_lat_dx",     ["right", "vastus lateralis"],          []),
    ("bicipite_fem_sx",  ["left", "biceps femoris"],             []),
    ("bicipite_fem_dx",  ["right", "biceps femoris"],            []),
    ("semitendinoso_sx", ["left", "semitendinosus"],             []),
    ("semitendinoso_dx", ["right", "semitendinosus"],            []),
    ("adduttore_sx",     ["left", "adductor magnus"],            []),
    ("adduttore_dx",     ["right", "adductor magnus"],           []),
    ("gastrocnemio_sx",  ["left", "gastrocnemius"],              []),
    ("gastrocnemio_dx",  ["right", "gastrocnemius"],             []),
    ("soleo_sx",         ["left", "soleus"],                     []),
    ("soleo_dx",         ["right", "soleus"],                    []),
    ("tibiale_ant_sx",   ["left", "tibialis anterior"],          []),
    ("tibiale_ant_dx",   ["right", "tibialis anterior"],         []),
]

# Budget di triangoli per struttura. Fissare la griglia darebbe risultati
# imprevedibili: le mesh di BodyParts3D hanno densita' molto diverse fra loro, e
# la stessa griglia toglie il 20% a una e l'80% a un'altra. Puntando al numero di
# triangoli il peso totale e' noto in partenza: ~400k triangoli, che un iPad
# regge, e una ventina di MB.
BUDGET = {"osso": 8000, "muscolo": 4000}
OSSA = {k for k, _, _ in STRUTTURE if not any(
    t in k for t in ("bicipite", "tricipite", "deltoide", "brachioradiale", "pettorale",
                     "dorsale", "trapezio", "retto_addome", "obliquo", "gluteo",
                     "retto_femorale", "vasto", "semitendinoso", "adduttore",
                     "gastrocnemio", "soleo", "tibiale"))}


def leggi_obj(testo):
    """Legge vertici e facce da un OBJ. Le facce con piu' di tre lati vengono
    triangolate a ventaglio: BodyParts3D e' gia' triangolato, ma alcuni file
    derivati no, e una faccia quadrangolare non gestita spezza la mesh."""
    V, F = [], []
    for riga in testo.splitlines():
        if riga.startswith("v "):
            p = riga.split()
            V.append((float(p[1]), float(p[2]), float(p[3])))
        elif riga.startswith("f "):
            idx = [int(t.split("/")[0]) - 1 for t in riga.split()[1:]]
            for i in range(1, len(idx) - 1):
                F.append((idx[0], idx[i], idx[i + 1]))
    return np.array(V, dtype=np.float64), np.array(F, dtype=np.int64)


def riduci_a_budget(V, F, budget):
    """Cerca la griglia piu' fine che sta nel budget di triangoli.
    Il numero di triangoli cresce con la finezza della griglia, quindi la
    ricerca binaria e' valida. Se la mesh e' gia' sotto budget non si tocca:
    ridurre senza bisogno butterebbe via dettaglio gratis."""
    if len(F) <= budget:
        return V, F, None
    basso, alto, migliore = 8, 512, None
    while basso <= alto:
        mid = (basso + alto) // 2
        V2, F2 = riduci(V, F, mid)
        if len(F2) <= budget:
            migliore = (V2, F2, mid)
            basso = mid + 1
        else:
            alto = mid - 1
    if migliore is None:
        V2, F2 = riduci(V, F, 8)
        return V2, F2, 8
    return migliore


def riduci(V, F, celle):
    """Riduzione per raggruppamento su griglia.

    Non e' la tecnica piu' raffinata — una decimazione a quadriche conserva
    meglio gli spigoli — ma non ha dipendenze, non fallisce su mesh con buchi o
    facce degeneri (BodyParts3D ne ha), ed e' verificabile: il numero di celle
    occupate e' il numero di vertici in uscita, senza sorprese.
    """
    if len(V) == 0 or len(F) == 0:
        return V, F
    mn, mx = V.min(axis=0), V.max(axis=0)
    lato = (mx - mn).max() / max(1, celle)
    if lato <= 0:
        return V, F

    chiave = np.floor((V - mn) / lato).astype(np.int64)
    _, inverso, conteggio = np.unique(chiave, axis=0, return_inverse=True, return_counts=True)

    # Centroide di ogni cella: piu' fedele dello spigolo della griglia
    nuovi = np.zeros((len(conteggio), 3))
    np.add.at(nuovi, inverso, V)
    nuovi /= conteggio[:, None]

    NF = inverso[F]
    # Via le facce degenerate (due o tre vertici finiti nella stessa cella)
    ok = (NF[:, 0] != NF[:, 1]) & (NF[:, 1] != NF[:, 2]) & (NF[:, 0] != NF[:, 2])
    NF = NF[ok]
    if len(NF) == 0:
        return V, F

    # Via i vertici rimasti orfani, altrimenti il file porta peso inutile
    usati, NF = np.unique(NF, return_inverse=True)
    return nuovi[usati], NF.reshape(-1, 3)


def scrivi_obj(percorso, V, F):
    with open(percorso, "w") as f:
        f.write("# BodyParts3D — CC-BY-SA 2.1 JP — ridotto per nirscope\n")
        for v in V:
            f.write(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")
        for t in F:
            f.write(f"f {t[0]+1} {t[1]+1} {t[2]+1}\n")


def trova_mappa(nomi, apri):
    """Cerca il file che associa gli identificativi ai nomi anatomici inglesi.
    Il formato e' cambiato fra le versioni dell'archivio, quindi invece di
    presumerne uno si prende qualunque file di testo che contenga righe con un
    identificativo FMA e un nome."""
    candidati = [n for n in nomi if n.lower().endswith((".txt", ".csv", ".tsv"))]
    mappa = {}
    for n in sorted(candidati, key=lambda x: -len(x)):
        try:
            testo = apri(n).decode("utf-8", "ignore")
        except Exception:
            continue
        trovate = 0
        for riga in testo.splitlines():
            campi = re.split(r"[\t,;]", riga)
            if len(campi) < 2:
                continue
            ident = campi[0].strip().strip('"')
            nome = campi[1].strip().strip('"')
            if re.fullmatch(r"FMA\d+", ident, re.I) and nome:
                mappa[ident.upper()] = nome.lower()
                trovate += 1
        if trovate > 100:
            print(f"  mappa dei nomi: {n} ({trovate} voci)")
            return mappa
    return mappa


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("archivio", help="lo .zip scaricato da BodyParts3D")
    ap.add_argument("--out", default="mesh", help="cartella di uscita (predefinita: mesh)")
    args = ap.parse_args()

    sorgente = pathlib.Path(args.archivio)
    if not sorgente.exists():
        sys.exit(f"Non trovo {sorgente}")

    print(f"Apro {sorgente.name} ({sorgente.stat().st_size/1e6:.0f} MB)…")
    with zipfile.ZipFile(sorgente) as z:
        nomi = z.namelist()
        apri = lambda n: z.read(n)

        obj = [n for n in nomi if n.lower().endswith(".obj")]
        print(f"  {len(obj)} file OBJ nell'archivio")
        if not obj:
            sys.exit("Nessun OBJ: probabilmente e' l'archivio sbagliato. "
                     "Serve quello dei modelli in formato OBJ.")

        mappa = trova_mappa(nomi, apri)
        if not mappa:
            print("  ATTENZIONE: nessuna mappa dei nomi trovata, cerco nei nomi dei file")

        # Nome anatomico di ogni OBJ, dalla mappa o dal nome del file stesso
        etichetta = {}
        for n in obj:
            base = pathlib.Path(n).stem
            ident = base.upper() if base.upper().startswith("FMA") else "FMA" + base
            etichetta[n] = mappa.get(ident, base.replace("_", " ").lower())

        out = pathlib.Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        manifesto, mancanti, tot_tri = [], [], 0

        for chiave, richiesti, esclusi in STRUTTURE:
            scelti = [n for n in obj
                      if all(t in etichetta[n] for t in richiesti)
                      and not any(t in etichetta[n] for t in esclusi)]
            if not scelti:
                mancanti.append((chiave, " + ".join(richiesti)))
                continue
            # A parita' di criterio si prende il nome piu' corto: e' la struttura
            # principale, non una sua sottoparte.
            n = min(scelti, key=lambda x: len(etichetta[x]))

            V, F = leggi_obj(apri(n).decode("utf-8", "ignore"))
            prima = len(F)
            budget = BUDGET["osso" if chiave in OSSA else "muscolo"]
            V, F, celle = riduci_a_budget(V, F, budget)
            scrivi_obj(out / f"{chiave}.obj", V, F)
            tot_tri += len(F)
            manifesto.append({"chiave": chiave, "nome": etichetta[n], "file": n,
                              "triangoli": int(len(F)), "originali": int(prima)})
            nota = "gia' sotto budget" if celle is None else f"griglia {celle}"
            print(f"  {chiave:20s} {etichetta[n][:34]:34s} {prima:7d} → {len(F):6d} tri  {nota}")

    (out / "manifesto.json").write_text(json.dumps({
        "sorgente": "BodyParts3D — Database Center for Life Science — CC-BY-SA 2.1 JP",
        "strutture": manifesto,
    }, indent=1, ensure_ascii=False))

    peso = sum(f.stat().st_size for f in out.glob("*.obj")) / 1e6
    print(f"\n{len(manifesto)} strutture, {tot_tri} triangoli, {peso:.1f} MB in {out}/")
    if mancanti:
        print(f"\n{len(mancanti)} non trovate — dimmele e aggiusto i criteri di ricerca:")
        for chiave, criterio in mancanti:
            print(f"  {chiave:20s} cercavo: {criterio}")
    print("\nOra carica la cartella nel repository:")
    print(f"  git add {out} && git commit -m 'Mesh anatomiche BodyParts3D' && git push")


if __name__ == "__main__":
    main()
