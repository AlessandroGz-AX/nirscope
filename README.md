# nirscope

Due pagine sull'imaging in transilluminazione con la fotocamera di un telefono.
Nessuna dipendenza, nessuna rete: sono due file HTML autonomi.

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
