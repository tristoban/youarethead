# Prompt para la remera — YOU ARE THE AD

Texto exacto: **YOU ARE THE AD**
Tipografía: **Montserrat ExtraBold (800)**, mayúsculas, tracking ajustado.
Idea: el texto va **espejado** (impreso al revés) para que se lea bien solo cuando el que la usa se mira al espejo.

> Ojo con el texto espejado: los modelos de imagen casi nunca escriben bien al revés.
> Por eso abajo tenés 3 caminos. El **B** es el más confiable para el mockup, y la nota
> final es para el archivo real de impresión.

---

## A) Prompt directo (texto ya espejado en la remera)

```
Cinematic product photograph of a black heavyweight cotton t-shirt, front view,
on an invisible mannequin, centered, against a deep matte black background (#0B0B0F).
Soft moody studio lighting, subtle fabric texture and natural folds.
Printed small and centered on the chest, in clean white Montserrat ExtraBold,
the text: "YOU ARE THE AD" — the text is MIRROR-REVERSED (horizontally flipped,
like a reflection in a mirror), every letter backwards. Crisp high-contrast
white-on-black print, tight letter spacing, two lines.
Eerie premium minimalist streetwear. Color grade inspired by the Netflix series
"Dark": cold, desaturated, cinematic. Photorealistic, sharp focus, 4k.
```

## B) Prompt confiable (texto NORMAL → después lo espejás)  ← recomendado

Generá la remera con el texto **legible** y después das vuelta la imagen en horizontal
(flip horizontal). Así las letras quedan perfectas y espejadas, sin que el modelo tenga
que "escribir al revés".

```
Cinematic product photograph of a black heavyweight cotton t-shirt, front view,
on an invisible mannequin, centered, against a deep matte black background (#0B0B0F).
Soft moody studio lighting, subtle fabric texture and natural folds.
Printed small and centered on the chest, in clean white Montserrat ExtraBold,
the exact text on two lines:
  YOU ARE
  THE AD
Crisp high-contrast white-on-black print, tight letter spacing.
Eerie premium minimalist streetwear. Color grade inspired by the Netflix series
"Dark": cold, desaturated, cinematic. Photorealistic, sharp focus, 4k.
```

Después: abrí la imagen en cualquier editor (o Vista previa) → **Voltear horizontal**.
Listo: texto espejado perfecto.

## C) La foto-concepto (la que más vende)

Persona de espaldas/perfil frente a un espejo con la remera puesta. En el **reflejo** la
frase se lee correcta ("YOU ARE THE AD"); en la remera real (primer plano) se ve al revés.

```
Cinematic photo of a person seen from behind standing in front of a mirror in a dark room,
wearing a black t-shirt. On the actual shirt the chest print appears mirror-reversed
(backwards); in the mirror reflection the same print reads correctly as "YOU ARE THE AD"
in white Montserrat ExtraBold. Moody low-key lighting, cold desaturated color grade like
the Netflix series "Dark", grain, cinematic, photorealistic, 4k.
```

---

## Para el archivo REAL de impresión (DTG / serigrafía)

No uses IA para el archivo que mandás a imprimir. Hacelo vectorial y exacto:

1. En Figma / Illustrator escribí **YOU ARE THE AD** en **Montserrat ExtraBold**, blanco,
   2 líneas, centrado, tracking ~ +1.5.
2. Seleccioná el texto → **Flip horizontal** (espejar en el eje vertical).
3. Convertí a curvas/outlines y exportá **SVG o PDF** vectorial.
4. Tamaño impresión sugerido: ~12–14 cm de ancho, centrado en el pecho, un poco alto.

Así la impresión queda nítida a cualquier tamaño y el espejado es exacto.

> El mockup que ya está en el sitio (SVG, en `public/index.html`) usa exactamente este
> criterio: Montserrat 800 espejado con `scale(-1,1)`. Cuando tengas la foto real,
> reemplazá ese `<svg class="tee">` por `<img src="/shirt.png" class="tee" alt="...">`.
