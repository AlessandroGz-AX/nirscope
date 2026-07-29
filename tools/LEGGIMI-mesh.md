# Mesh anatomiche — cosa serve e perche'

`mappa-bodyparts3d.json` elenca **60 strutture** composte da **126 file**
`BPxxxx.obj` di BodyParts3D: 26 ossa e 34 muscoli. La mappa e' risolta sui
metadati reali dell'archivio, non indovinata.

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

## Come si usa: non serve un computer

Si apre **[`prepara.html`](../prepara.html)** nel browser — anche su un iPad — si
sceglie l'archivio scaricato da BodyParts3D e si salva il file `anatomia.nira`
che ne esce. Non serve estrarre lo zip e non serve rete: la pagina non fa
nessuna richiesta.

L'archivio sta intorno al giga e contiene circa tremila mesh, ma un file scelto
dall'app File si puo' leggere a fette: si scorre la coda dell'archivio per
l'indice e poi solo i 126 blocchi che interessano. Misurato su un archivio di
prova da 543 MB con 3026 file: **63 MB letti** su 543, 64 MB di memoria
occupata al massimo, 13 secondi.

Sono gestiti anche gli archivi in formato ZIP64, nelle tre varianti che si
incontrano in pratica: tutti i campi saturi; solo la posizione, con campo esteso
da 8 byte; solo la posizione ma con campo esteso da 24 byte, come scrivono
alcuni programmi fuori specifica.

C'era anche uno script Python che faceva lo stesso lavoro da riga di comando.
E' stato tolto: assumeva i nomi `FMAxxxx.obj` e sull'archivio vero non avrebbe
trovato un file solo.

## Cosa succede dentro

1. **Indice.** Record di coda dello ZIP, poi l'indice centrale.
2. **Estrazione.** Solo le 126 voci necessarie, decompresse con
   `DecompressionStream` (nativo da iPadOS 16.4).
3. **Unione dei capi**, spostando gli indici delle facce.
4. **Riduzione** per raggruppamento dei vertici su griglia, con ricerca binaria
   della griglia piu' fine che sta nel budget: 8000 triangoli per le ossa, 4000
   per i muscoli. Le ossa ne reggono di piu' perche' hanno creste e spigoli che
   si notano, mentre un ventre muscolare e' liscio. Su ellissoidi chiusi di
   prova l'errore di volume dopo la riduzione resta sotto l'1%.
5. **Scrittura** di un unico file binario, sui 6 MB.

## Il formato `.nira`

Interi senza segno, ordine little-endian, tutto allineato a 4 byte.

```text
"NIRANAT1"              8 byte
numero di strutture     uint32
per ogni struttura:
  lunghezza del nome    uint8
  tipo                  uint8     0 = osso, 1 = muscolo
  numero di vertici     uint32
  numero di triangoli   uint32
  nome                  n byte    ascii, es. "femore_dx"
  riempimento           fino al multiplo di 4
  posizioni             float32 x 3 per vertice
  indici                uint32 x 3 per triangolo
```

## Attribuzione

BodyParts3D, The Database Center for Life Science, licenza CC-BY-SA 2.1 Giappone.
L'attribuzione va mantenuta e le opere derivate restano share-alike.
