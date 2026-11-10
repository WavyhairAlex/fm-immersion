# -*- coding: utf-8 -*-
r"""
Outils Python des photos de situation de FM Immersion, exécutés avec le Python embarqué de ComfyUI portable
(torch CUDA, transformers, safetensors, Pillow). Écrit par l'appli dans <photos>\scripts\ à chaque usage.
Tout tourne sur le PC, hors ligne (HF_HUB_OFFLINE=1) ; aucun fichier n'est téléchargé ici.

  fmi_photos.py sketch <civiere|duo> <sortie.png>
      Croquis de composition (silhouettes grises sur fond blanc, 1344x768) donné au modèle en dernière image.
  fmi_photos.py gate <qwen_2.5_vl_7b_fp8_scaled.safetensors> <dossier_tokenizer> <travaux.json> <sortie.json>
      Porte qualité : Qwen2.5-VL 7B chargé depuis l'encodeur de texte de ComfyUI (les poids fp8 restent en fp8 sur la
      carte), questions oui/non par image. travaux = {nom: {"path": png, "questions": [{id, text, expected, threshold}]}}.
      Réponse = probabilité de « Yes » contre « No » sur le premier jeton ; score = moyenne des probabilités attendues.
  fmi_photos.py logos <dossier_owlv2> <travaux.json> <sortie.json>
      Détection de logos, écussons, sponsors et textes (OWLv2, sur le processeur). travaux = {nom: png}.
      sortie = {nom: {"boxes": [[x0, y0, x1, y1]...], "size": [w, h], "count": n, "regenerate": bool}}.
"""
import json
import os
import sys
import time

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def lire_json(chemin):
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def ecrire_json(chemin, donnees):
    tmp = chemin + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(donnees, f, ensure_ascii=False, indent=1)
    os.replace(tmp, chemin)


# ------------------------------------------------------------------ croquis


def sketch(genre, sortie):
    from PIL import Image, ImageDraw

    gris, sombre = (120, 120, 120), (55, 55, 55)
    im = Image.new("RGB", (1344, 768), (255, 255, 255))
    d = ImageDraw.Draw(im)

    def membre(pts, l, c=gris):
        d.line(pts, fill=c, width=l, joint="curve")
        for x, y in (pts[0], pts[-1]):
            d.ellipse((x - l / 2, y - l / 2, x + l / 2, y + l / 2), fill=c)

    if genre == "civiere":
        # Deux porteurs debout, la civière à hauteur des mains, le blessé allongé dessus (série 3, validé).
        def porteur(x, sens):
            d.ellipse((x - 36, 84, x + 36, 156), fill=gris)
            membre([(x, 190), (x, 360)], 74)
            membre([(x - 8, 372), (x - 8 - 30 * sens, 510), (x - 8 - 62 * sens, 640)], 40)
            membre([(x + 8, 372), (x + 8 + 34 * sens, 510), (x + 8 + 22 * sens, 640)], 40)
            membre([(x + 10 * sens, 196), (x + 62 * sens, 290), (x + 112 * sens, 372)], 28)

        d.line((60, 668, 1284, 668), fill=(200, 200, 200), width=4)
        porteur(180, 1)
        porteur(1164, -1)
        d.rectangle((272, 372, 1072, 392), fill=sombre)
        d.ellipse((350, 296, 420, 366), fill=gris)
        membre([(452, 340), (690, 340)], 62)
        membre([(700, 342), (850, 346), (1000, 352)], 40)
        membre([(470, 318), (560, 262), (408, 292)], 24)
    elif genre == "duo":
        # Deux personnes debout côte à côte (étape 1, validé).
        def personne(x):
            d.ellipse((x - 46, 70, x + 46, 162), fill=gris)
            membre([(x, 200), (x, 450)], 110)
            membre([(x - 26, 470), (x - 34, 720)], 52)
            membre([(x + 26, 470), (x + 34, 720)], 52)
            membre([(x - 70, 215), (x - 92, 440)], 36)
            membre([(x + 70, 215), (x + 92, 440)], 36)

        d.line((60, 742, 1284, 742), fill=(200, 200, 200), width=4)
        personne(460)
        personne(884)
    else:
        raise SystemExit("croquis inconnu : " + genre)
    im.save(sortie)


# ------------------------------------------------------------------ porte qualité


def version_transformers():
    import transformers

    parts = []
    for p in transformers.__version__.split(".")[:2]:
        chiffres = "".join(c for c in p if c.isdigit())
        parts.append(int(chiffres or 0))
    return tuple(parts)


def charger_vl(fichier, tokenizer_dir):
    import torch
    from safetensors import safe_open
    from transformers import AutoTokenizer, Qwen2_5_VLConfig, Qwen2_5_VLForConditionalGeneration, Qwen2VLImageProcessor
    from transformers.models.qwen2_5_vl import modeling_qwen2_5_vl as M

    class LineaireFP8(torch.nn.Module):
        "Couche linéaire dont le poids reste en fp8 sur la carte et n'est converti que le temps du calcul."

        def __init__(self, poids, biais, echelle):
            super().__init__()
            self.register_buffer("poids", poids, persistent=False)
            self.register_buffer("biais", biais, persistent=False)
            self.register_buffer("echelle", echelle, persistent=False)

        def forward(self, x):
            return torch.nn.functional.linear(x, self.poids.to(x.dtype) * self.echelle.to(x.dtype), None if self.biais is None else self.biais.to(x.dtype))

    def renommer(k):
        if k.startswith("visual."):
            return "model." + k
        if k.startswith("model."):
            return "model.language_model." + k[len("model."):]
        return k

    t0 = time.time()
    rope = {"rope_type": "default", "mrope_section": [16, 24, 24]}
    texte = dict(vocab_size=152064, hidden_size=3584, intermediate_size=18944, num_hidden_layers=28, num_attention_heads=28, num_key_value_heads=4,
                 max_position_embeddings=32768, rms_norm_eps=1e-6, hidden_act="silu", attention_dropout=0.0, sliding_window=None)
    # transformers a renommé rope_scaling en rope_parameters (4.57) : on donne la clé que la version installée connaît.
    if version_transformers() >= (4, 57):
        texte["rope_parameters"] = rope
    else:
        texte["rope_scaling"] = {"type": "default", "mrope_section": [16, 24, 24]}
    vision = dict(depth=32, hidden_size=1280, out_hidden_size=3584, num_heads=16, in_channels=3, spatial_merge_size=2, patch_size=14, temporal_patch_size=2,
                  tokens_per_second=2, window_size=112, fullatt_block_indexes=[7, 15, 23, 31], intermediate_size=3456, hidden_act="silu")
    cfg = Qwen2_5_VLConfig(text_config=texte, vision_config=vision, image_token_id=151655, video_token_id=151656, vision_start_token_id=151652, vision_end_token_id=151653)
    cfg._attn_implementation = "sdpa"
    with torch.device("meta"):
        model = Qwen2_5_VLForConditionalGeneration._from_config(cfg)
    interne = model.model
    interne.language_model.rotary_emb = M.Qwen2_5_VLRotaryEmbedding(config=interne.language_model.config).to("cuda")
    interne.visual.rotary_pos_emb = M.Qwen2_5_VLVisionRotaryEmbedding(interne.visual.config).to("cuda")
    with safe_open(fichier, "pt", device="cuda") as f:
        cles = list(f.keys())
        echelles = {k[: -len(".scale_weight")]: f.get_tensor(k) for k in cles if k.endswith(".scale_weight")}
        for k in cles:
            if k.endswith(".scale_input") and float(f.get_tensor(k)) != 1.0:
                raise SystemExit("scale_input différent de 1 : non prévu : " + k)
        faits = set()
        for couche, echelle in echelles.items():
            poids = f.get_tensor(couche + ".weight")
            biais = f.get_tensor(couche + ".bias") if couche + ".bias" in cles else None
            nom = renommer(couche)
            parent, _, fin = nom.rpartition(".")
            setattr(model.get_submodule(parent), fin, LineaireFP8(poids, biais, echelle))
            faits.update((couche + ".weight", couche + ".bias", couche + ".scale_weight", couche + ".scale_input"))
        reste = {renommer(k): f.get_tensor(k) for k in cles if k not in faits and k != "scaled_fp8"}
    manquants = model.load_state_dict(reste, assign=True, strict=False)
    inconnus = [k for k in manquants.missing_keys if "rotary" not in k]
    if inconnus or manquants.unexpected_keys:
        raise SystemExit(f"poids non alignés : manquants {inconnus[:10]}, inattendus {manquants.unexpected_keys[:10]}")
    model.eval()
    tok = AutoTokenizer.from_pretrained(tokenizer_dir, local_files_only=True)
    proc = Qwen2VLImageProcessor()
    print(f"modèle chargé en {time.time() - t0:.0f} s, VRAM {torch.cuda.memory_allocated() / 2**30:.1f} Go", flush=True)
    return model, tok, proc


def gate(fichier, tokenizer_dir, travaux_json, sortie):
    import torch
    from PIL import Image

    travaux = lire_json(travaux_json)
    model, tok, proc = charger_vl(fichier, tokenizer_dir)
    oui, non = tok.encode("Yes")[0], tok.encode("No")[0]

    def preparer(image, question):
        img = proc(images=[image], return_tensors="pt")
        n = int(img["image_grid_thw"].prod()) // 4
        texte = ("<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>user\n<|vision_start|>" + "<|image_pad|>" * n + "<|vision_end|>"
                 + question + " Answer only Yes or No.<|im_end|>\n<|im_start|>assistant\n")
        ids = tok(texte, return_tensors="pt")
        return dict(input_ids=ids["input_ids"].to("cuda"), attention_mask=ids["attention_mask"].to("cuda"),
                    pixel_values=img["pixel_values"].to("cuda", torch.bfloat16), image_grid_thw=img["image_grid_thw"].to("cuda"))

    @torch.no_grad()
    def proba_oui(image, question):
        e = preparer(image, question)
        with torch.autocast("cuda", torch.bfloat16):
            s = model(**e, use_cache=False).logits[0, -1].float()
        return round(float(torch.softmax(s[[oui, non]], 0)[0]), 3)

    resultat = {}
    for nom, travail in travaux.items():
        t = time.time()
        image = Image.open(travail["path"]).convert("RGB")
        reponses, motifs, total = {}, [], 0.0
        for qu in travail["questions"]:
            p = proba_oui(image, qu["text"])
            attendu = bool(qu["expected"])
            pa = p if attendu else 1 - p
            seuil = float(qu.get("threshold", 0.5))
            bon = pa >= seuil
            reponses[qu["id"]] = {"pYes": p, "expected": attendu, "ok": bon, "threshold": seuil}
            total += pa
            if not bon:
                motifs.append(qu["id"])
        score = total / max(len(travail["questions"]), 1)
        resultat[nom] = {"path": travail["path"], "answers": reponses, "accepted": not motifs, "reasons": motifs, "score": round(score, 3), "seconds": round(time.time() - t, 1)}
        print(f"{nom}: {'OK' if not motifs else 'REJET ' + ','.join(motifs)} | score {score:.2f} | {time.time() - t:.1f} s", flush=True)
        ecrire_json(sortie, resultat)
    ecrire_json(sortie, resultat)
    print(f"VRAM max (torch) {torch.cuda.max_memory_allocated() / 2**30:.1f} Go", flush=True)


# ------------------------------------------------------------------ logos


REQUETES = ["logo", "brand logo", "sponsor text", "club crest badge", "nike swoosh", "three stripes", "text on shirt"]
PLANCHER = 0.03
SEUIL = 0.2
MAX_BOITE = 0.12  # part de l'image : au-delà, ce n'est pas un logo (le joueur, tout le maillot)
MAX_HAUT = 2.5
SEUIL_REGEN = 0.05  # une boîte à motif imprimé plus grande que ça : l'image est à regénérer plutôt qu'à nettoyer
SEUIL_GRAPHIQUE = 0.06


def fusion(boites):
    boites = [list(b) for b in boites]
    change = True
    while change:
        change = False
        for i in range(len(boites)):
            for j in range(i + 1, len(boites)):
                a, b = boites[i], boites[j]
                if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                    boites[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                    del boites[j]
                    change = True
                    break
            if change:
                break
    return boites


def graphisme(arr, b):
    "Part de contours nets dans la boîte : élevée pour un imprimé, faible pour un tissu uni."
    import numpy as np

    g = arr[b[1]:b[3], b[0]:b[2]].mean(axis=2)
    if g.shape[0] < 2 or g.shape[1] < 2:
        return 0.0
    dx = np.abs(np.diff(g, axis=1))[:-1, :]
    dy = np.abs(np.diff(g, axis=0))[:, :-1]
    return float(((dx > 25) | (dy > 25)).mean())


def logos(dossier, travaux_json, sortie):
    import numpy as np
    import torch
    from PIL import Image
    from transformers import Owlv2ForObjectDetection, Owlv2Processor

    travaux = lire_json(travaux_json)
    t0 = time.time()
    proc = Owlv2Processor.from_pretrained(dossier, local_files_only=True)
    model = Owlv2ForObjectDetection.from_pretrained(dossier, local_files_only=True).eval()
    print(f"OWLv2 chargé en {time.time() - t0:.0f} s", flush=True)

    def owl(img):
        inp = proc(text=[REQUETES], images=img, return_tensors="pt")
        with torch.no_grad():
            o = model(**inp)
        r = proc.post_process_grounded_object_detection(outputs=o, target_sizes=torch.tensor([img.size[::-1]]), threshold=PLANCHER, text_labels=[REQUETES])[0]
        return [(b.tolist(), float(s)) for b, s in zip(r["boxes"], r["scores"])]

    resultat = {}
    for nom, chemin in travaux.items():
        t = time.time()
        img = Image.open(chemin).convert("RGB")
        w, h = img.size
        aire = w * h
        arr = np.asarray(img).astype("float32")
        candidates = []
        for b, s in owl(img):
            if s < SEUIL:
                continue
            bx = [max(int(b[0]), 0), max(int(b[1]), 0), min(int(b[2]), w), min(int(b[3]), h)]
            l, ht = bx[2] - bx[0], bx[3] - bx[1]
            if l <= 0 or ht <= 0:
                continue
            if l * ht / aire > MAX_BOITE or ht / l > MAX_HAUT:
                continue
            candidates.append(bx)
        gardees, regen = [], False
        for b in fusion(candidates):
            ratio = (b[2] - b[0]) * (b[3] - b[1]) / aire
            g = graphisme(arr, b)
            if ratio > SEUIL_REGEN and g < SEUIL_GRAPHIQUE:
                continue  # grande zone unie : pas un logo
            regen = regen or ratio > SEUIL_REGEN
            gardees.append(b)
        resultat[nom] = {"path": chemin, "boxes": gardees, "size": [w, h], "count": len(gardees), "regenerate": regen, "seconds": round(time.time() - t, 1)}
        print(f"{nom}: {len(gardees)} logo(s){' à regénérer' if regen else ''} | {time.time() - t:.1f} s", flush=True)
        ecrire_json(sortie, resultat)
    ecrire_json(sortie, resultat)


if __name__ == "__main__":
    c = sys.argv[1] if len(sys.argv) > 1 else ""
    if c == "sketch" and len(sys.argv) == 4:
        sketch(sys.argv[2], sys.argv[3])
    elif c == "gate" and len(sys.argv) == 6:
        gate(*sys.argv[2:6])
    elif c == "logos" and len(sys.argv) == 5:
        logos(*sys.argv[2:5])
    else:
        print(__doc__)
        sys.exit(2)
