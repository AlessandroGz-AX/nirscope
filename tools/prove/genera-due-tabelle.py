"""Le due tabelle separate, com'e' fatto BodyParts3D davvero.

Una dice come si chiama ogni organo, l'altra di quali pezzi e' composto — e i
pezzi sono i file .obj. Il nome e il modello non stanno mai sulla stessa riga,
quindi serve un salto in piu': e' questo che ha fatto fallire tutti i tentativi
con la sola parts_list.
"""
import os, zipfile, importlib.util

spec = importlib.util.spec_from_file_location("gt", "genera-tabella.py")
# genera-tabella.py scrive file al volo; qui ne serve solo l'elenco dei nomi.
src = open("genera-tabella.py").read().split("VOCI = nomi()")[0]
ns = {}
exec(src, ns)
VOCI = ns["nomi"]()

# Ogni organo ha un identificativo suo; i suoi pezzi ne hanno un altro.
organo = {n: "BQ%05d" % (70000 + i) for i, n in enumerate(VOCI)}
pezzi = {}
for i, n in enumerate(VOCI):
    # I muscoli con piu' capi hanno piu' pezzi, come nell'archivio vero.
    k = 3 if ("triceps" in n or "deltoid" in n or "trapezius" in n) else \
        2 if ("biceps" in n or "pectoralis" in n) else 1
    pezzi[n] = ["FX%05d%s" % (70000 + i * 3 + j, "a" if (i + j) % 9 == 0 else "")
                for j in range(k)]

with open("finto_parts_list2.txt", "w") as f:
    f.write("FMA_id\tBP_id\tname\n")
    for i, n in enumerate(VOCI):
        f.write("FMA%d\t%s\t%s\n" % (60000 + i, organo[n], n))
print("finto_parts_list2.txt   %d righe  (nome <-> organo)" % len(VOCI))

with open("finto_element_parts.txt", "w") as f:
    f.write("BP_id\telement_id\n")
    for n in VOCI:
        for p in pezzi[n]:
            f.write("%s\t%s\n" % (organo[n], p))
print("finto_element_parts.txt %d righe  (organo <-> pezzi)"
      % sum(len(v) for v in pezzi.values()))

with zipfile.ZipFile("finto_bp3d.zip") as sorgente:
    modelli = [x for x in sorgente.namelist()
               if x.endswith(".obj") and sorgente.getinfo(x).file_size > 5000]
    with zipfile.ZipFile("finto_due_tabelle.zip", "w", zipfile.ZIP_DEFLATED,
                         compresslevel=1) as z:
        i = 0
        for n in VOCI:
            for p in pezzi[n]:
                z.writestr("isa_BP3D_4.0_obj_99/%s.obj" % p,
                           sorgente.read(modelli[i % len(modelli)]))
                i += 1
print("finto_due_tabelle.zip   %.0f MB, %d modelli"
      % (os.path.getsize("finto_due_tabelle.zip") / 1e6, i))
