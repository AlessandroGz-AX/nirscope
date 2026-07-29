# Archivi di prova

`test-prepara.mjs` non gira contro l'archivio vero di BodyParts3D — è quasi un
giga e non sta in un repository. Gira contro archivi finti ma costruiti come
quello vero: stessi nomi `BPxxxx.obj`, stesso annidamento `BP3D/obj/`, deflate,
file di contorno intorno a quelli che servono.

Ogni struttura diventa un ellissoide chiuso in una posizione nota. Chiuso perché
così il volume si misura col teorema della divergenza, e si verifica che la
riduzione dei triangoli non stravolga la geometria invece di limitarsi a
contarli.

```sh
cd tools/prove
python3 genera-finto.py     # normale, con buchi, con voci non compresse
python3 genera-zip64.py     # tre varianti ZIP64 dell'indice
cd ../..
node test-prepara.mjs
```

Gli archivi generati pesano una quindicina di mega l'uno e non vanno
versionati.

`genera-zip64.py` riscrive a mano l'indice di `finto_bp3d.zip` in forma ZIP64.
Serve perché `zipfile` di Python usa il ZIP64 solo quando i numeri lo impongono,
e `force_zip64=True` tocca solo le intestazioni locali: l'indice centrale resta
a 32 bit e quel ramo del codice non verrebbe mai eseguito.
