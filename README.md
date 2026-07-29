# nirscope

Due pagine sull'imaging in transilluminazione con la fotocamera di un telefono.
Nessuna dipendenza, nessuna rete: sono due file HTML autonomi.

- **[anatomia.html](https://alessandrogz-ax.github.io/nirscope/anatomia.html)** — anatomia in
  movimento. Riconosce le parti del corpo dalla fotocamera, ne ricostruisce 33 punti in tre
  dimensioni e ne ricava scheletro e lunghezza di 31 muscoli, colorati secondo accorciamento
  o allungamento. Tutto sul dispositivo, nessuna dipendenza esterna.
- **[vasi.html](https://alessandrogz-ax.github.io/nirscope/vasi.html)** — visore di vasi.
  Transilluminazione: torcia da una parte del tessuto, fotocamera dall'altra. Calcola
  l'attenuazione rispetto al fondo locale e applica il filtro di Frangi, tirando fuori i
  vasi che stanno pochi millimetri sotto la pelle. E' questa la pagina che risponde a
  "vedere attraverso la pelle".
- **[index.html](https://alessandrogz-ax.github.io/nirscope/)** — strumento live.
  La fotocamera fa da sensore e lo schermo da illuminatore strobato. Misura il
  battito attraverso il polpastrello (fotopletismografia) e confronta quanta
  luce rossa e quanta blu attraversano lo stesso tessuto.
- **[simulatore.html](https://alessandrogz-ax.github.io/nirscope/simulatore.html)** —
  simulatore della catena di segnale: illuminatore, sensore e demodulazione
  lock-in, con i controlli per romperli e vedere dove cede.

## Perche' serve una pagina servita, e non un file aperto localmente

`getUserMedia` richiede un contesto sicuro: https, oppure `localhost`. Un file
aperto con `file://` non basta, e una pagina dentro un iframe che non dichiara
`allow="camera"` viene respinta prima ancora che il browser chieda il permesso.
GitHub Pages risolve entrambe le cose: pagina di primo livello, servita in https.

## Cosa misura davvero

Il battito e' un fotopletismogramma vero — a ogni sistole il volume di sangue
nel polpastrello cambia, e con esso la luce che lo attraversa. E' lo stesso
principio del saturimetro da dito, e puoi verificarlo contando il polso.

Non e' un dispositivo medico e non stima la saturazione: per farlo servirebbe
una calibrazione contro un co-ossimetro su molte persone, ed e' esattamente quel
passaggio a rendere un saturimetro un apparecchio certificato.

Uno schermo emette solo luce visibile, quindi qui non c'e' vicino infrarosso.
Il sistema completo — LED a 660 e 850 nm ai lati del punto isosbestico
dell'emoglobina, mappa di saturazione tissutale, registrazione longitudinale su
mesh 3D — vive altrove; queste pagine ne dimostrano la catena di recupero del
segnale.

## Note d'uso

Appoggia il polpastrello sull'obiettivo **senza premere**: premendo si occlude il
circolo e il segnale sparisce. Porta la luminosita' dello schermo al massimo. Su
Android, con la fotocamera posteriore e il flash acceso, il segnale e' molto piu'
forte; gli iPad non hanno flash, quindi quel pulsante resta spento.

Se la fotocamera non parte, il pulsante **Diagnostica** dice quale dei
prerequisiti manca invece di limitarsi a fallire.


## Il modello muscolare

Ogni muscolo e' una polilinea fra punti di attacco ancorati ai landmark della
posa, e la sua lunghezza approssima quella muscolo-tendinea. E' la stessa
grandezza che un simulatore muscoloscheletrico calcola come primo passo dagli
angoli articolari; da li' alle forze servirebbe la dinamica inversa, che da un
solo video non si ricava.

Gli scostamenti dei punti di attacco vivono nel sistema locale del segmento
osseo, non in quello del tronco. Non e' un dettaglio: nel sistema del tronco
"anteriore" sull'avambraccio resta anteriore *rispetto al torace* anche quando
l'avambraccio ruota, e per il quadricipite questo arrivava a invertire il segno
della deformazione.

Tre attacchi hanno richiesto la geometria giusta per dare il segno giusto:

- il **tricipite** si inserisce sull'olecrano, oltre il gomito e dalla parte
  opposta al polso; modellato lungo gomito-polso si accorciava in flessione
- il **deltoide** ha origine sull'acromion, *lateralmente* al centro articolare:
  senza quello scarto l'abduzione non produce accorciamento
- il **tibiale anteriore** passa sotto il retinacolo sopra l'articolazione e si
  inserisce sul dorso del piede; con entrambi i punti alla stessa altezza la
  dorsiflessione non cambiava nulla

`test-muscoli.mjs` verifica il segno della deformazione su cinque articolazioni
usando rotazioni rigide (le pose scritte a mano allungavano le ossa, e il test
finiva per misurare quella deformazione invece del movimento articolare):

    node test-muscoli.mjs


## Mesh anatomiche

`anatomia.html` disegna i muscoli come percorsi fra punti di attacco: la
cinematica e' corretta, la forma e' schematica. Per la geometria vera servono
mesh anatomiche, e `tools/prepara-mesh.py` le prepara da **BodyParts3D**
(Database Center for Life Science, CC-BY-SA 2.1 JP).

Da eseguire una volta su un computer, non serve altro che numpy:

    python3 tools/prepara-mesh.py ~/Downloads/BodyParts3D_obj.zip

Dell'archivio completo — quasi un giga, circa tremila strutture — lo script
seleziona la sessantina che serve, la riduce a un budget di triangoli e scrive
`mesh/` con un manifesto.

**Perche' un budget e non una griglia fissa.** Le mesh di BodyParts3D hanno
densita' molto diverse fra loro: la stessa griglia toglie il 20% a una e l'80%
a un'altra, e il peso finale sarebbe imprevedibile. Puntando al numero di
triangoli si sa in partenza quanto pesa il risultato.

La riduzione e' per raggruppamento su griglia. Non conserva gli spigoli come
farebbe una decimazione a quadriche, ma non ha dipendenze e non fallisce sulle
mesh con buchi e facce degeneri di cui BodyParts3D e' pieno. Misurata su una
sfera chiusa da 120k triangoli: a 8000 triangoli lo scostamento medio della
superficie e' l'1,1% del diametro, l'errore di volume sotto lo 0,1%.

**Attribuzione.** BodyParts3D e' CC-BY-SA: l'attribuzione va mantenuta e le
opere derivate restano share-alike.
