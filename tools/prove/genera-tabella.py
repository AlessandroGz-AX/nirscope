"""Tabella dei nomi e archivio che la segue, per provare il riconoscimento
per nome anatomico.

L'archivio vero usa identificativi che non conosciamo, quindi qui se ne
inventano di forma diversa da quelli della mappa scritta a mano: se il
riconoscimento funzionasse solo perche' gli identificativi coincidono, la prova
non direbbe nulla.
"""
import os, random, zipfile

rng = random.Random(11)

# Nomi come li scrive BodyParts3D: inglese, con la lateralita' nel nome. Ci
# sono anche tendini e legamenti che portano lo stesso nome del muscolo e non
# devono essere presi, e strutture del tutto estranee a fare da contorno.
def nomi():
    v = []
    ossa_pari = ["femur", "tibia", "fibula", "humerus", "radius", "ulna",
                 "patella", "scapula", "clavicle", "hip bone"]
    for b in ossa_pari:
        for lato in ("right", "left"):
            v.append(f"{lato} {b}")
    v += ["sacrum", "sternum", "mandible", "skull", "frontal bone",
          "parietal bone", "occipital bone", "temporal bone", "sphenoid bone"]
    for i in range(1, 25):
        v.append(f"vertebra {'CTL'[min(2, (i-1)//8)]}{i}")
    for i in range(1, 13):
        for lato in ("right", "left"):
            v.append(f"{lato} rib {i}")

    muscoli = {
        "deltoid": 3, "biceps brachii": 2, "triceps brachii": 3,
        "brachioradialis": 1, "pectoralis major": 3, "serratus anterior": 1,
        "trapezius": 3, "obliquus externus abdominis": 1, "gluteus maximus": 1,
        "adductor magnus": 1, "rectus femoris": 1, "biceps femoris": 2,
        "semitendinosus": 1, "gastrocnemius": 2, "soleus": 1,
        "tibialis anterior": 1,
    }
    capi = ["", "long head of ", "short head of ", "lateral head of ",
            "medial head of ", "clavicular part of ", "sternal part of ",
            "descending part of ", "ascending part of ", "abdominal part of "]
    for m, n in muscoli.items():
        for lato in ("right", "left"):
            for i in range(n):
                v.append(f"{capi[i]}{lato} {m}".strip())
    for lato in ("right", "left"):
        for q in ("lateralis", "medialis", "intermedius"):
            v.append(f"{lato} vastus {q}")

    # Trappole: stesso nome ma non e' il muscolo.
    for lato in ("right", "left"):
        v += [f"tendon of {lato} biceps brachii", f"{lato} patellar ligament",
              f"fascia of {lato} gluteus maximus", f"{lato} costal cartilage 1",
              f"tendon of {lato} tibialis anterior", f"{lato} deltoid fascia"]
    # Contorno: roba che non c'entra, come nell'archivio vero.
    for i in range(900):
        v.append(rng.choice(["lobe of", "segment of", "branch of", "wall of"])
                 + f" structure {i}")
    return v

VOCI = nomi()
# Identificativi del modello: forma diversa da quella della mappa scritta a
# mano, e un pezzo con la lettera in coda come nell'archivio vero.
# Fuori dall'intervallo dei codici veri: altrimenti i finti si scontrano con
# quelli del catalogo e la prova passa per collisione invece che per merito.
ids = {n: ("FX%05d%s" % (70000 + i, "a" if i % 9 == 0 else ""))
       for i, n in enumerate(VOCI)}

# La colonna del modello NON e' la prima, e prima di lei c'e' un'altra colonna
# di identificativi con numeri completamente diversi. E' la disposizione vera:
# prendere la prima colonna che sembra un identificativo porta fuori strada, ed
# e' esattamente l'errore che ha fatto girare a vuoto tutta la mattina.
with open("finto_parts_list.txt", "w") as f:
    f.write("FMA_id\tname\tmodel_id\tcount\n")     # intestazione, da ignorare
    for i, n in enumerate(VOCI):
        f.write("FMA%d\t%s\t%s\t%d\n" % (60000 + i, n, ids[n], i % 7))
print("finto_parts_list.txt  %d righe, colonna del modello: la terza" % len(VOCI))

with zipfile.ZipFile("finto_bp3d.zip") as sorgente:
    # Solo i modelli con geometria: i file di contorno sono vuoti, e usarli
    # farebbe risultare "senza file" strutture che invece ci sono.
    modelli = [x for x in sorgente.namelist()
               if x.endswith(".obj") and sorgente.getinfo(x).file_size > 5000]
    with zipfile.ZipFile("finto_per_nome.zip", "w", zipfile.ZIP_DEFLATED,
                         compresslevel=1) as z:
        for i, n in enumerate(VOCI):
            z.writestr("BP3D_4.0_obj_99/%s.obj" % ids[n],
                       sorgente.read(modelli[i % len(modelli)]))
print("finto_per_nome.zip    %.1f MB, %d modelli"
      % (os.path.getsize("finto_per_nome.zip") / 1e6, len(VOCI)))
