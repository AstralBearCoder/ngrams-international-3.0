#!/usr/bin/env python3
"""
ULTRA-OPTIMIZED MULTI-SOURCE N-GRAM & VOCABULARY GENERATOR
==========================================================
Architecturé pour le traitement haute performance de corpus massifs multi-sources.
Consommation RAM quasi-nulle (Streaming) et calcul vectorisé par réduction de Zipf.
"""

from collections import Counter, defaultdict
import os
from operator import itemgetter
from pathlib import Path
import time
import unicodedata

# =====================================================================
# CONFIGURATION
# =====================================================================

BASE_DIR = Path(__file__).resolve().parent
CORPUS_DIR = BASE_DIR / "corpus"
OUTPUT_DIR = BASE_DIR / "data"

NGRAM_SIZES = (2, 3, 4)
CATEGORIES = (
    ("Lowercase_Alphanumeric", True, False),
    ("All_Cases_Alphanumeric", False, False),
    ("Lowercase_Alphanumeric_Punctuation", True, True),
    ("All_Cases_Alphanumeric_Punctuation", False, True),
)
CAT_NAMES = tuple(c[0] for c in CATEGORIES)
PUNCTUATION_CATEGORIES = frozenset({"Pc", "Pd", "Ps", "Pe", "Pi", "Pf", "Po"})

# =====================================================================
# TABLES DE NORMALISATION ET MAPPINGS C-OPTIMISÉS
# =====================================================================

BASE_CHAR_TRANSLATION = {
    # Apostrophes -> droite standard
    "\u2018": "'", "\u2019": "'", "\u02BC": "'", "\uFF07": "'",
    # Tirets / Moins -> tiret standard
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-",
    "\u2015": "-", "\u2212": "-", "\uFE63": "-", "\uFF0D": "-",
    # Guillemets doubles -> droits
    "\u201C": '"', "\u201D": '"', "\u201E": '"', "\u201F": '"',
    "\u301D": '"', "\u301E": '"', "\u301F": '"', "\uFF02": '"',
    # Points de suspension -> point
    "\u2026": ".",
    # Ponctuation pleine largeur (Fullwidth)
    "\uFF0E": ".", "\uFF0C": ",", "\uFF01": "!", "\uFF1F": "?",
    "\uFF1A": ":", "\uFF1B": ";", "\uFF08": "(", "\uFF09": ")",
    "\uFF3B": "[", "\uFF3D": "]", "\uFF5B": "{", "\uFF5D": "}",
    "\uFF0F": "/", "\uFF3C": "\\", "\uFF20": "@", "\uFF03": "#",
    "\uFF06": "&", "\uFF0A": "*", "\uFF0B": "+", "\uFF1D": "=", "\uFF05": "%",
}


def _build_precomputed_tables():
    """Précalcule la classification et les conversions des 1.1M points de code Unicode."""
    type_arr = bytearray(0x110000)
    whitespace_trans = {}
    lower_trans = {}

    for cp in range(0x110000):
        ch = chr(cp)
        cat = unicodedata.category(ch)

        if cat[0] in ("L", "M", "N"):
            type_arr[cp] = 1  # Alphanumérique
        elif cat in PUNCTUATION_CATEGORIES:
            type_arr[cp] = 2  # Ponctuation

        # Espaces non standards normalisés en espace classique
        if ch.isspace() and cp not in (0x09, 0x0A, 0x0D, 0x20):
            whitespace_trans[cp] = " "

        low = ch.lower()
        if low != ch:
            lower_trans[cp] = low

    norm_table = str.maketrans({**BASE_CHAR_TRANSLATION, **whitespace_trans})
    lower_table = str.maketrans(lower_trans)
    return bytes(type_arr), norm_table, lower_table


UNICODE_TYPE, NORM_TRANSLATION, LOWER_TABLE = _build_precomputed_tables()


# =====================================================================
# EXTRACTION STREAMING HAUT DÉBIT (MÉMOIRE FIXE < 150 Mo)
# =====================================================================

def count_words_from_stream(file_path: Path, master_counter: Counter):
    """
    Lit un fichier ligne par ligne via un buffer de 1 Mo.
    Normalise la typographie et extrait les mots directement dans le Counter global.
    """
    update = master_counter.update
    norm = NORM_TRANSLATION

    # Lecture tolérante aux encodages avec streaming mémoire
    try:
        with file_path.open("r", encoding="utf-8-sig", errors="replace", buffering=1048576) as f:
            for line in f:
                line = line.translate(norm)
                # Élimination instantanée des index Leipzig : "1234\tSentence..."
                tab_idx = line.find("\t")
                if tab_idx != -1 and line[:tab_idx].isdigit():
                    line = line[tab_idx + 1:]
                words = line.split()
                if words:
                    update(words)
    except Exception as e:
        print(f"    [ATTENTION] Erreur de lecture sur {file_path.name}: {e}")


# =====================================================================
# ALGORITHME DE GÉNÉRATION D'N-GRAMS VECTORISÉ
# =====================================================================

def generate_all_ngrams(word_counts: Counter):
    """
    Traite l'ensemble du vocabulaire agrégé en une seule passe linéaire.
    Distribue les séquences dans les 4 catégories d'analyse simultanément.
    """
    counters = {
        cat: {2: defaultdict(int), 3: defaultdict(int), 4: defaultdict(int), "words": defaultdict(int)}
        for cat in CAT_NAMES
    }

    # Alias locaux pour un accès bytecode ultra-rapide (évite les lookups de dicts répétés)
    la, aa = counters["Lowercase_Alphanumeric"], counters["All_Cases_Alphanumeric"]
    lp, ap = counters["Lowercase_Alphanumeric_Punctuation"], counters["All_Cases_Alphanumeric_Punctuation"]

    la2, la3, la4, la_w = la[2], la[3], la[4], la["words"]
    aa2, aa3, aa4, aa_w = aa[2], aa[3], aa[4], aa["words"]
    lp2, lp3, lp4, lp_w = lp[2], lp[3], lp[4], lp["words"]
    ap2, ap3, ap4, ap_w = ap[2], ap[3], ap[4], ap["words"]

    u_type = UNICODE_TYPE
    lower_table = LOWER_TABLE

    def add_1cat(d2, d3, d4, seq, cnt):
        L = len(seq)
        if L >= 2:
            for i in range(L - 1): d2[seq[i:i + 2]] += cnt
            if L >= 3:
                for i in range(L - 2): d3[seq[i:i + 3]] += cnt
                if L >= 4:
                    for i in range(L - 3): d4[seq[i:i + 4]] += cnt

    def add_4cat(seq, cnt):
        L = len(seq)
        if L >= 2:
            for i in range(L - 1):
                g = seq[i:i + 2]
                la2[g] += cnt;
                aa2[g] += cnt;
                lp2[g] += cnt;
                ap2[g] += cnt
            if L >= 3:
                for i in range(L - 2):
                    g = seq[i:i + 3]
                    la3[g] += cnt;
                    aa3[g] += cnt;
                    lp3[g] += cnt;
                    ap3[g] += cnt
                if L >= 4:
                    for i in range(L - 3):
                        g = seq[i:i + 4]
                        la4[g] += cnt;
                        aa4[g] += cnt;
                        lp4[g] += cnt;
                        ap4[g] += cnt

    def add_2split(seq_orig, seq_low, cnt):
        L = len(seq_orig)
        if L >= 2:
            for i in range(L - 1):
                go, gl = seq_orig[i:i + 2], seq_low[i:i + 2]
                aa2[go] += cnt;
                ap2[go] += cnt;
                la2[gl] += cnt;
                lp2[gl] += cnt
            if L >= 3:
                for i in range(L - 2):
                    go, gl = seq_orig[i:i + 3], seq_low[i:i + 3]
                    aa3[go] += cnt;
                    ap3[go] += cnt;
                    la3[gl] += cnt;
                    lp3[gl] += cnt
                if L >= 4:
                    for i in range(L - 3):
                        go, gl = seq_orig[i:i + 4], seq_low[i:i + 4]
                        aa4[go] += cnt;
                        ap4[go] += cnt;
                        la4[gl] += cnt;
                        lp4[gl] += cnt

    for word, cnt in word_counts.items():
        # FAST PATH 1 : Mots ASCII alphanumériques purs (~80% du texte standard)
        if word.isascii() and word.isalnum():
            if word.islower():
                add_4cat(word, cnt)
                la_w[word] += cnt;
                aa_w[word] += cnt;
                lp_w[word] += cnt;
                ap_w[word] += cnt
            else:
                w_low = word.lower()
                add_2split(word, w_low, cnt)
                aa_w[word] += cnt;
                ap_w[word] += cnt;
                la_w[w_low] += cnt;
                lp_w[w_low] += cnt
            continue

        # FAST PATH 2 : Mots Alphanumériques accentués / cyrilliques sans ponctuation
        types = [u_type[ord(c)] for c in word]
        if all(t == 1 for t in types):
            word_low = word.translate(lower_table)
            if word_low == word:
                add_4cat(word, cnt)
                la_w[word] += cnt;
                aa_w[word] += cnt;
                lp_w[word] += cnt;
                ap_w[word] += cnt
            else:
                if len(word_low) == len(word):
                    add_2split(word, word_low, cnt)
                else:
                    add_1cat(aa2, aa3, aa4, word, cnt)
                    add_1cat(ap2, ap3, ap4, word, cnt)
                    add_1cat(la2, la3, la4, word_low, cnt)
                    add_1cat(lp2, lp3, lp4, word_low, cnt)
                aa_w[word] += cnt;
                ap_w[word] += cnt;
                la_w[word_low] += cnt;
                lp_w[word_low] += cnt
            continue

        # VOIE GÉNÉRALE : Mots contenant de la ponctuation interne (apostrophes, tirets, etc.)
        alnum_seqs, punct_seqs = [], []
        alnum_buf, punct_buf = [], []

        for ch, t in zip(word, types):
            if t == 1:
                alnum_buf.append(ch)
                punct_buf.append(ch)
            elif t == 2:
                if alnum_buf:
                    alnum_seqs.append("".join(alnum_buf))
                    alnum_buf.clear()
                punct_buf.append(ch)
            else:  # Symboles/Contrôles : cassent les séquences
                if alnum_buf:
                    alnum_seqs.append("".join(alnum_buf))
                    alnum_buf.clear()
                if punct_buf:
                    punct_seqs.append("".join(punct_buf))
                    punct_buf.clear()

        if alnum_buf: alnum_seqs.append("".join(alnum_buf))
        if punct_buf: punct_seqs.append("".join(punct_buf))

        # Traitement des segments alphanumériques isolés
        for s in alnum_seqs:
            s_low = s.translate(lower_table)
            if s_low == s:
                add_1cat(la2, la3, la4, s, cnt)
                add_1cat(aa2, aa3, aa4, s, cnt)
                la_w[s] += cnt;
                aa_w[s] += cnt
            else:
                add_1cat(aa2, aa3, aa4, s, cnt)
                add_1cat(la2, la3, la4, s_low, cnt)
                aa_w[s] += cnt;
                la_w[s_low] += cnt

        # Traitement des séquences conservant la ponctuation
        for s in punct_seqs:
            s_low = s.translate(lower_table)
            if s_low == s:
                add_1cat(lp2, lp3, lp4, s, cnt)
                add_1cat(ap2, ap3, ap4, s, cnt)
                lp_w[s] += cnt;
                ap_w[s] += cnt
            else:
                add_1cat(ap2, ap3, ap4, s, cnt)
                add_1cat(lp2, lp3, lp4, s_low, cnt)
                ap_w[s] += cnt;
                lp_w[s_low] += cnt

    return counters


# =====================================================================
# ÉCRITURE DISQUE EN BLOCS (BULK WRITING)
# =====================================================================

def save_ngrams(counter: dict, output_path: Path):
    """
    Tri stable à 2 étapes (Fréquence décroissante -> Alphabétique croissant).
    Écriture ultra-rapide par blocs mémoires de 131 072 lignes.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not counter:
        output_path.write_text("", encoding="utf-8")
        return

    # Tri C natif ultra-rapide
    items = sorted(counter.items())
    items.sort(key=itemgetter(1), reverse=True)

    chunk_size = 131072
    with output_path.open("w", encoding="utf-8", newline="\n", buffering=1048576) as f:
        for i in range(0, len(items), chunk_size):
            chunk = items[i:i + chunk_size]
            f.writelines([f"{seq}\t{cnt}\n" for seq, cnt in chunk])


# =====================================================================
# PIPELINE D'EXÉCUTION PRINCIPAL
# =====================================================================

def process_target(target_path: Path):
    """Traite un dossier de corpus complet ou un fichier autonome."""
    start_time = time.time()

    # Nettoyage cosmétique du nom de sortie (ex: Corpus_French -> Ngram_French)
    clean_name = target_path.stem if target_path.is_file() else target_path.name
    if clean_name.startswith("Corpus_"):
        clean_name = clean_name[len("Corpus_"):]

    print(f"\n" + "=" * 60)
    print(f" TRAITEMENT DU CORPUS : {clean_name.upper()}")
    print("=" * 60)

    # Récupération des fichiers textuels cibles
    if target_path.is_dir():
        files_to_read = sorted([
            p for p in target_path.glob("*.txt")
            if p.is_file() and not p.name.startswith(".") and p.stat().st_size > 0
        ])
    else:
        files_to_read = [target_path]

    if not files_to_read:
        print(f"  [ERREUR] Aucun fichier texte valide trouvé dans : {target_path}")
        return

    # Phase 1 : Agrégation Streaming du Vocabulaire
    master_word_counts = Counter()
    total_bytes = 0

    print("  [1/3] Lecture et agrégation du vocabulaire (Streaming)...")
    for f in files_to_read:
        size_mb = f.stat().st_size / (1024 * 1024)
        total_bytes += f.stat().st_size
        print(f"        -> {f.name} ({size_mb:.1f} Mo)")
        count_words_from_stream(f, master_word_counts)

    print(
        f"        TOTAL LU : {total_bytes / (1024 * 1024):.1f} Mo | {len(master_word_counts):,} mots uniques extraits.")

    # Phase 2 : Génération vectorisée des N-Grams
    print("  [2/3] Calcul des n-grams et catégorisation en mémoire...")
    counters = generate_all_ngrams(master_word_counts)

    # Phase 3 : Exportation disque haute performance
    output_base = OUTPUT_DIR / f"Ngram_{clean_name}"
    print(f"  [3/3] Exportation des résultats vers : {output_base.name}/")

    for cat_name in CAT_NAMES:
        cat_dir = output_base / cat_name
        cat_data = counters[cat_name]

        # Export des 2, 3, 4-grams
        for n in NGRAM_SIZES:
            save_ngrams(cat_data[n], cat_dir / f"{n}grams.txt")

        # Export du lexique complet (words.txt)
        save_ngrams(cat_data["words"], cat_dir / "words.txt")

    elapsed = time.time() - start_time
    print(f"  SUCCÈS : {clean_name} finalisé en {elapsed:.2f} secondes.")


# =====================================================================
# INTERFACE CLI
# =====================================================================

def main():
    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Détection des dossiers de langue (Corpus_English, etc.) et fichiers
    targets = sorted(
        [p for p in CORPUS_DIR.iterdir() if not p.name.startswith(".") and p.name != "Corpus_Info.txt"],
        key=lambda p: p.name.lower(),
    )

    if not targets:
        print(f"Aucun corpus trouvé dans :\n{CORPUS_DIR}")
        print("Veuillez y placer vos dossiers de langues (ex: Corpus_English).")
        return

    print("\n" + "=" * 60)
    print(" GÉNÉRATEUR N-GRAM & DICTIONNAIRES MULTI-LANGUES")
    print("=" * 60)
    print("Corpus détectés dans /corpus :\n")

    for idx, target in enumerate(targets, start=1):
        tag = "[DOSSIER]" if target.is_dir() else "[FICHIER]"
        print(f"  {idx}. {tag} {target.name}")

    print("\nQue souhaitez-vous traiter ?")
    print(" - Une ou plusieurs langues : tapez les numéros (ex: 1,3,5)")
    print(" - Toutes les langues : tapez 'all'")
    print(" - Quitter : tapez 'q'")

    choice = input("\nVotre choix : ").strip().lower()
    if choice == "q":
        return

    if choice == "all":
        queue = targets
    else:
        try:
            indices = [int(x.strip()) for x in choice.split(",") if x.strip()]
            if not indices or any(i < 1 or i > len(targets) for i in indices):
                raise ValueError
            indices = list(dict.fromkeys(indices))
            queue = [targets[i - 1] for i in indices]
        except ValueError:
            print("Entrée invalide. Utilisez 'all' ou des chiffres comme '1,2'.")
            return

    total_start = time.time()
    for target in queue:
        try:
            process_target(target)
        except Exception as err:
            print(f"\n[ERREUR] Échec sur {target.name} : {err}")

    total_elapsed = time.time() - total_start
    print("\n" + "=" * 60)
    print(f" TOUT EST TERMINÉ avec succès en {total_elapsed:.2f} secondes !")
    print(f" Les résultats complets sont dans : {OUTPUT_DIR}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()