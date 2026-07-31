# nirscope

Pagine sull'imaging in transilluminazione e sull'anatomia in movimento, con la
sola fotocamera di un telefono. Nessuna dipendenza esterna, nessuna richiesta di
rete: tutto sul dispositivo.

- **[anatomia.html](https://alessandrogz-ax.github.io/nirscope/anatomia.html)** — anatomia in
  movimento. Riconosce le parti del corpo dalla fotocamera, ne ricostruisce 33 punti in tre
  dimensioni e ne ricava scheletro e lunghezza di 31 muscoli, colorati secondo accorciamento
  o allungamento. Caricandoci le mesh di BodyParts3D, al posto dei cilindri compare
  l'anatomia vera.
- **[prepara.html](https://alessandrogz-ax.github.io/nirscope/prepara.html)** — prepara quelle
  mesh partendo dall'archivio BodyParts3D, dentro il browser. Anche da un iPad: dell'archivio
  da quasi un giga ne legge una sessantina di mega e restituisce un file da sei.
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

Senza mesh, `anatomia.html` disegna ossa e muscoli come cilindri fra punti di
attacco: la cinematica e' corretta, la forma e' uno schema. Le mesh vere
arrivano da **BodyParts3D** (Database Center for Life Science, CC-BY-SA 2.1 JP)
e si preparano **[in una pagina](https://alessandrogz-ax.github.io/nirscope/prepara.html)**,
anche da un iPad: si sceglie l'archivio scaricato, si aspetta un minuto, si
salva il file che ne esce e lo si carica in `anatomia.html`.

Non serve un computer e non serve estrarre lo zip. Un file scelto dall'app File
si legge a fette, quindi si scorre la coda dell'archivio per l'indice e poi solo
i 126 blocchi che interessano. Su un archivio di prova da 543 MB con 3026 file:
**63 MB letti** su 543, 64 MB di memoria al massimo, 13 secondi. Dettagli e
formato in [`tools/LEGGIMI-mesh.md`](tools/LEGGIMI-mesh.md).

**Perche' un budget di triangoli e non una griglia fissa.** Le mesh di
BodyParts3D hanno densita' molto diverse fra loro: la stessa griglia toglie il
20% a una e l'80% a un'altra, e il peso finale sarebbe imprevedibile. Puntando
al numero di triangoli si sa in partenza quanto pesa il risultato. La riduzione
e' per raggruppamento su griglia: non conserva gli spigoli come una decimazione
a quadriche, ma non ha dipendenze e non fallisce sulle mesh con buchi e facce
degeneri di cui BodyParts3D e' pieno. Su ellissoidi chiusi l'errore di volume
dopo la riduzione resta sotto l'1%.

### Come le mesh seguono il movimento

L'archivio non dice in che unita' di misura siano le coordinate, ne' quale asse
sia il verticale, ne' se il sistema sia destrorso. Niente di tutto questo viene
dato per scontato: si deduce dalle mesh stesse, a partire da due fatti anatomici
che sopravvivono a qualunque convenzione di esportazione — il cranio sta sopra
il bacino, e lo sterno sta davanti alla colonna. Le articolazioni sono le
estremita' delle ossa lunghe, prese come baricentro del 3% di vertici piu'
avanzati invece che come singolo vertice, che potrebbe essere un artefatto.

I femori servono da controprova. Se dicono il contrario di quel che dice
l'anatomia, non e' la geometria a essere strana: sono le etichette
destra/sinistra a essere scambiate, e le strutture vengono agganciate al lato
opposto. E' un errore che altrimenti passerebbe inosservato per sempre, perche'
uno scheletro specchiato sembra normale.

Ogni struttura e' poi un corpo rigido legato a un segmento fra due landmark. A
ogni fotogramma si calcola la trasformazione che porta il segmento a riposo su
quello vivo: lungo l'asse la scala e' quella che fa combaciare le estremita' —
limitata, perche' un arto puntato verso l'obiettivo viene stimato corto e senza
freno l'osso si stirerebbe a fisarmonica — mentre di traverso resta la scala
generale del corpo. I ventri muscolari si ingrossano quando si accorciano, che
e' la conservazione del volume.

Un muscolo biarticolare resta agganciato a un solo osso: si sposta e si
ingrossa, ma non si avvolge attorno al giunto. La lunghezza muscolo-tendinea
continua a misurarla il modello cinematico — le mesh sono come la si mostra,
non cosa si misura.

**Come viene letto il corpo.** I 33 punti di MediaPipe ballano di qualche
millimetro anche a soggetto fermo, e su una mesh lunga mezzo metro quel tremolio
si vede tutto. `posa-filtro.js` li liscia con un filtro one euro, che stringe la
banda da fermo e la allarga in movimento, piu' un recupero del ritardo ricavato
dalla velocita' gia' stimata: senza, ogni taratura scambia tremolio contro
ritardo lungo la stessa curva. I punti che la telecamera non vede vengono tenuti
fermi invece di inseguire le ipotesi del modello, e un buco nel rilevamento
tiene l'ultima posa buona per quattro decimi di secondo invece di far sparire
tutto. Misurato: 12 mm di rumore sui punti diventano 1,1 mm alla tibia.

    node test-anatomia-mesh.mjs      # orientamento, articolazioni, pose
    node test-posa-filtro.mjs        # tremolio, ritardo, punti non visti
    node test-anatomia-pagina.mjs    # la pagina vera, con Playwright
    node test-prepara.mjs            # il preparatore, su archivi finti

**Attribuzione.** BodyParts3D e' CC-BY-SA: l'attribuzione va mantenuta e le
opere derivate restano share-alike.
