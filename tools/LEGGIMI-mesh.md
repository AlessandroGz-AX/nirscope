# Mesh anatomiche — cosa serve e perche'

`mappa-bodyparts3d.json` elenca **60 strutture** composte da **126 file**
`BPxxxx.obj` di BodyParts3D. La mappa e' risolta sui metadati reali
dell'archivio, non indovinata.

## Tre cose che si scoprono solo guardando i metadati veri

**I file non si chiamano `FMAxxxx.obj`.** L'identificativo di concetto (FMA) e
quello di rappresentazione (BP) sono diversi, e i file portano il secondo.

**I muscoli non esistono interi.** BodyParts3D li distribuisce per capi e parti:
il bicipite brachiale e' `short head` piu' `long head`, il tricipite tre capi, il
deltoide tre parti, il trapezio tre. Vanno uniti a valle — ed e' un bene, e'
piu' dettaglio di quanto chiedessimo.

**Alcune strutture non ci sono affatto.** Gran dorsale, retto addominale ed
erettori spinali sono assenti dall'archivio: su 2905 strutture con mesh, 569
sono ossa e 351 muscoli, ma la copertura del tronco ha buchi. Il modello
cinematico continuera' a calcolarli come percorsi; semplicemente non avranno una
mesh sotto.

## Come si usa

Serve un computer: sono circa 60 MB di file da estrarre da un archivio di quasi
un giga, e iPadOS non gestisce ne' l'uno ne' gli altri.

    python3 tools/prepara-mesh.py ~/Downloads/[archivio-obj].zip

Lo script legge questa mappa, estrae i 126 file, unisce i capi di ogni muscolo
in una mesh sola, riduce al budget di triangoli e scrive `mesh/`.

## Attribuzione

BodyParts3D, The Database Center for Life Science, licenza CC-BY-SA 2.1 Giappone.
L'attribuzione va mantenuta e le opere derivate restano share-alike.
