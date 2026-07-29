"""Costruisce archivi ZIP finti ma realistici per provare prepara.html.

Ogni struttura diventa un ellissoide chiuso in una posizione nota: chiuso
perche' cosi' il volume si puo' misurare col teorema della divergenza e si
verifica che la riduzione non lo stravolga.
"""
import json, math, random, struct, zipfile, io, sys

MAPPA = json.load(open("../mappa-bodyparts3d.json"))

def icosfera(suddivisioni):
    t = (1 + 5 ** 0.5) / 2
    V = [(-1,t,0),(1,t,0),(-1,-t,0),(1,-t,0),(0,-1,t),(0,1,t),
         (0,-1,-t),(0,1,-t),(t,0,-1),(t,0,1),(-t,0,-1),(-t,0,1)]
    F = [(0,11,5),(0,5,1),(0,1,7),(0,7,10),(0,10,11),(1,5,9),(5,11,4),(11,10,2),
         (10,7,6),(7,1,8),(3,9,4),(3,4,2),(3,2,6),(3,6,8),(3,8,9),(4,9,5),
         (2,4,11),(6,2,10),(8,6,7),(9,8,1)]
    V = [tuple(c / math.sqrt(sum(x*x for x in v)) for c in v) for v in V]
    for _ in range(suddivisioni):
        meta, nuove = {}, []
        def mezzo(a, b):
            k = (min(a,b), max(a,b))
            if k not in meta:
                m = tuple((V[a][i] + V[b][i]) / 2 for i in range(3))
                n = math.sqrt(sum(x*x for x in m))
                V.append(tuple(x / n for x in m))
                meta[k] = len(V) - 1
            return meta[k]
        for a, b, c in F:
            ab, bc, ca = mezzo(a,b), mezzo(b,c), mezzo(c,a)
            nuove += [(a,ab,ca),(b,bc,ab),(c,ca,bc),(ab,bc,ca)]
        F = nuove
    return V, F

def obj(V, F, centro, raggi):
    r = []
    for x, y, z in V:
        r.append("v %.4f %.4f %.4f" % (centro[0] + x*raggi[0],
                                       centro[1] + y*raggi[1],
                                       centro[2] + z*raggi[2]))
    r.append("g mesh")
    for a, b, c in F:
        r.append("f %d %d %d" % (a+1, b+1, c+1))
    return ("# BodyParts3D finto\n" + "\n".join(r) + "\n").encode()

def volume(V, F, centro, raggi):
    tot = 0.0
    P = [(centro[0]+x*raggi[0], centro[1]+y*raggi[1], centro[2]+z*raggi[2]) for x,y,z in V]
    for a, b, c in F:
        p, q, s = P[a], P[b], P[c]
        tot += (p[0]*(q[1]*s[2]-q[2]*s[1]) - p[1]*(q[0]*s[2]-q[2]*s[0])
                + p[2]*(q[0]*s[1]-q[1]*s[0])) / 6.0
    return abs(tot)

# Un ellissoide per struttura, con i capi dei muscoli sfalsati fra loro cosi'
# che l'unione si veda dall'ingombro complessivo.
OSSA = {"bacino","clavicola","colonna","coste","cranio","femore","mandibola","omero",
        "perone","radio","rotula","sacro","scapola","sterno","tibia","ulna"}
def base(k): return k[:-3] if k.endswith(("_dx","_sx")) else k

rng = random.Random(7)
V5, F5 = icosfera(5)   # 20480 triangoli, per le ossa
V4, F4 = icosfera(4)   #  5120 triangoli, per i capi muscolari
print("icosfera 5:", len(V5), "vertici", len(F5), "triangoli")
print("icosfera 4:", len(V4), "vertici", len(F4), "triangoli")

pezzi, atteso = {}, {}
for k, bps in MAPPA.items():
    osso = base(k) in OSSA
    lato = 1 if k.endswith("_dx") else (-1 if k.endswith("_sx") else 0)
    cx = lato * rng.uniform(60, 180)
    cy = rng.uniform(-800, 700)
    cz = rng.uniform(-60, 60)
    V, F = (V5, F5) if osso else (V4, F4)
    raggi = (rng.uniform(18, 40), rng.uniform(60, 160), rng.uniform(18, 40))
    vol = 0.0
    for i, bp in enumerate(bps):
        c = (cx, cy + i * 55.0, cz)          # capi sfalsati lungo l'asse lungo
        pezzi[bp] = obj(V, F, c, raggi)
        vol += volume(V, F, c, raggi)
    atteso[k] = {"osso": osso, "capi": len(bps), "tri": len(F) * len(bps), "vol": vol,
                 "cy": cy, "raggi": raggi}

json.dump(atteso, open("atteso.json", "w"), indent=1)
print("strutture:", len(atteso), " file:", len(pezzi),
      " ossa:", sum(1 for a in atteso.values() if a["osso"]))

def scrivi_zip(nome, salta=(), stored=(), zip64=False, decoy=250):
    with zipfile.ZipFile(nome, "w", zipfile.ZIP_DEFLATED, allowZip64=True,
                         compresslevel=6) as z:
        z.writestr("BP3D/README.txt", "BodyParts3D, CC-BY-SA 2.1 JP\n")
        z.writestr("BP3D/isa_element_parts.txt", "roba\n" * 200)
        for bp, dati in pezzi.items():
            if bp in salta:
                continue
            zi = zipfile.ZipInfo("BP3D/obj/%s.obj" % bp, (2013,1,1,0,0,0))
            zi.compress_type = zipfile.ZIP_STORED if bp in stored else zipfile.ZIP_DEFLATED
            if zip64:
                # force_zip64 obbliga i campi a 64 bit anche su file piccoli,
                # cosi' si esercita il ramo ZIP64 senza generare un giga.
                with z.open(zi, "w", force_zip64=True) as f:
                    f.write(dati)
            else:
                z.writestr(zi, dati)
        # File di contorno: l'archivio vero ne ha tremila, il codice deve
        # pescare solo i suoi.
        for i in range(decoy):
            z.writestr("BP3D/obj/BP%04d.obj" % (1000 + i), b"# vuoto\nv 0 0 0\n")
    import os
    print("%-22s %8.2f MB" % (nome, os.path.getsize(nome) / 1e6))

scrivi_zip("finto_bp3d.zip")
scrivi_zip("finto_buchi.zip",
           salta={"BP8920", "BP5566", "BP5562", "BP5550", "BP5564"},
           stored={"BP9042", "BP8816"})
