"""Riscrive l'indice di un archivio esistente in forma ZIP64 vera.

zipfile di Python usa il ZIP64 solo quando i numeri lo impongono, e con
force_zip64 tocca solo le intestazioni locali: l'indice centrale resta a 32
bit. Per provare davvero quel ramo l'indice va riscritto a mano.

Tre varianti, perche' gli scrittori in circolazione non si comportano tutti
allo stesso modo:
  pieno    tutti e tre i campi saturi, campo extra da 24 byte
  parziale solo la posizione satura, campo extra da 8 byte (il caso comune:
           archivio oltre i 4 GB ma con file piccoli dentro)
  largo    solo la posizione satura ma il campo extra ne contiene comunque
           tre, come fanno alcuni programmi fuori specifica
"""
import struct, sys

SAT32 = 0xFFFFFFFF

def riscrivi(sorgente, destinazione, modo):
    d = bytearray(open(sorgente, "rb").read())
    i = d.rfind(b"PK\x05\x06")
    nVoci  = struct.unpack_from("<H", d, i + 10)[0]
    dimCD  = struct.unpack_from("<I", d, i + 12)[0]
    offCD  = struct.unpack_from("<I", d, i + 16)[0]

    nuovo, o, contate = bytearray(), offCD, 0
    while o < offCD + dimCD and d[o:o+4] == b"PK\x01\x02":
        lnN = struct.unpack_from("<H", d, o + 28)[0]
        lnE = struct.unpack_from("<H", d, o + 30)[0]
        lnC = struct.unpack_from("<H", d, o + 32)[0]
        voce = bytearray(d[o:o + 46 + lnN])          # senza extra ne' commento
        dimG = struct.unpack_from("<I", voce, 24)[0]
        dimC = struct.unpack_from("<I", voce, 20)[0]
        offL = struct.unpack_from("<I", voce, 42)[0]

        if modo == "pieno":
            struct.pack_into("<I", voce, 20, SAT32)
            struct.pack_into("<I", voce, 24, SAT32)
            struct.pack_into("<I", voce, 42, SAT32)
            extra = struct.pack("<HHQQQ", 0x0001, 24, dimG, dimC, offL)
        elif modo == "parziale":
            struct.pack_into("<I", voce, 42, SAT32)
            extra = struct.pack("<HHQ", 0x0001, 8, offL)
        elif modo == "largo":
            struct.pack_into("<I", voce, 42, SAT32)
            extra = struct.pack("<HHQQQ", 0x0001, 24, dimG, dimC, offL)
        else:
            raise SystemExit("modo ignoto")

        struct.pack_into("<H", voce, 30, len(extra))
        nuovo += voce + extra
        o += 46 + lnN + lnE + lnC
        contate += 1

    assert contate == nVoci, (contate, nVoci)
    corpo = d[:offCD]
    nuovoOff = len(corpo)
    fuori = bytearray(corpo) + nuovo

    # record ZIP64 di coda: 56 byte in tutto
    fine64 = struct.pack("<IQHHIIQQQQ", 0x06064b50, 44, 45, 45, 0, 0,
                         contate, contate, len(nuovo), nuovoOff)
    off64 = len(fuori)
    fuori += fine64
    fuori += struct.pack("<IIQI", 0x07064b50, 0, off64, 1)          # localizzatore
    # record normale con i campi saturi: cosi' un lettore vecchio si ferma e
    # uno nuovo va a cercare il record a 64 bit.
    fuori += struct.pack("<IHHHHIIH", 0x06054b50, 0, 0, 0xFFFF, 0xFFFF,
                         SAT32, SAT32, 0)
    open(destinazione, "wb").write(fuori)
    print("%-24s %8.2f MB  %d voci  (%s)" %
          (destinazione, len(fuori) / 1e6, contate, modo))

for modo, nome in (("pieno", "zip64_pieno.zip"),
                   ("parziale", "zip64_parziale.zip"),
                   ("largo", "zip64_largo.zip")):
    riscrivi("finto_bp3d.zip", nome, modo)
