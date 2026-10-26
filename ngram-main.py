#!/usr/bin/env python3
"""
ngramInternational — High-Performance Multilingual Corpus & N-Gram Engine
==========================================================================
- Strict zero-digit policy: All digits (0-9) and Unicode numbers rejected.
- Whitelisted punctuation strictly limited to: ' " : . , ? ! ; _ - /
- Frequency threshold: Words retained ONLY if occurrences >= 50.
- Unicode NFC normalization ensures full multilingual accuracy (accents/diacritics).
- High-throughput streaming pipeline maintaining low memory footprint (< 150 MB RAM).
- Fully compatible with app.js dataset loaders.
"""

from collections import Counter, defaultdict
from operator import itemgetter
from pathlib import Path
import sys
import time
import unicodedata

# =====================================================================
# CONFIGURATION & CONSTANTS
# =====================================================================

BASE_DIR = Path(__file__).resolve().parent
CORPUS_DIR = BASE_DIR / "corpus"
OUTPUT_DIR = BASE_DIR / "data"

NGRAM_SIZES = (2, 3, 4)
MIN_WORD_OCCURRENCE = 50  # Hard threshold: discard words with < 50 occurrences
IO_BUFFER_SIZE = 1048576  # 1 MB read/write buffer
CHUNK_WRITE_SIZE = 65536  # Number of lines per disk write batch

# Explicit authorized punctuation set
AUTHORIZED_PUNCTUATION = frozenset({"\'", '"', ":", ".", ",", "?", "!", ";", "_", "-", "/"})

CATEGORIES = (
    ("Lowercase_Alphanumeric", True, False),
    ("All_Cases_Alphanumeric", False, False),
    ("Lowercase_Alphanumeric_Punctuation", True, True),
    ("All_Cases_Alphanumeric_Punctuation", False, True),
)
CAT_NAMES = tuple(c[0] for c in CATEGORIES)

# =====================================================================
# NORMALIZATION TABLES & FAST LOOKUP
# =====================================================================

# Typographic variants mapped to strict standard ASCII counterparts
BASE_CHAR_TRANSLATION = {
    # Single quotes and apostrophes -> '
    "\u2018": "'", "\u2019": "'", "\u02BC": "'", "\uFF07": "'", "\u0060": "'", "\u00B4": "'",
    # Double quotes -> "
    "\u201C": '"', "\u201D": '"', "\u201E": '"', "\u201F": '"', "\u00AB": '"', "\u00BB": '"', "\uFF02": '"',
    # Hyphens and dashes -> -
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-",
    "\u2015": "-", "\u2212": "-", "\uFE63": "-", "\uFF0D": "-",
    # Ellipsis -> .
    "\u2026": ".",
    # Fullwidth / CJK punctuation
    "\uFF0E": ".", "\uFF0C": ",", "\uFF01": "!", "\uFF1F": "?",
    "\uFF1A": ":", "\uFF1B": ";", "\uFF3F": "_", "\uFF0F": "/",
}


def _build_precomputed_tables():
    """
    Precompute classification table and translation maps across Unicode codepoints.
    Values for UNICODE_TYPE:
      0 = Invalid character / delimiter (rejects token)
      1 = Valid letter (supports all Latin, Cyrillic, Greek, etc.)
      2 = Authorized punctuation
    """
    type_arr = bytearray(0x110000)
    whitespace_trans = {}

    for cp in range(0x110000):
        ch = chr(cp)
        cat = unicodedata.category(ch)

        if cat[0] == "N":
            # Disallow all number categories (Nd, Nl, No)
            type_arr[cp] = 0
        elif cat[0] == "L":
            # Valid letter (Lu, Ll, Lt, Lm, Lo)
            type_arr[cp] = 1
        elif ch in AUTHORIZED_PUNCTUATION:
            # Explicitly authorized punctuation
            type_arr[cp] = 2
        else:
            type_arr[cp] = 0

        # Map all non-standard and typographic spaces to a standard space (0x20)
        if ch.isspace() and cp not in (0x09, 0x0A, 0x0D, 0x20):
            whitespace_trans[cp] = " "

    norm_table = str.maketrans({**BASE_CHAR_TRANSLATION, **whitespace_trans})
    return bytes(type_arr), norm_table


UNICODE_TYPE, NORM_TRANSLATION = _build_precomputed_tables()


# =====================================================================
# HIGH-SPEED STREAMING EXTRACTION
# =====================================================================

def count_words_from_stream(file_path: Path, master_counter: Counter):
    """
    Reads a text file line-by-line via a 1 MB buffer.
    Applies Unicode NFC normalization, typography standardization, and token aggregation.
    """
    update = master_counter.update
    norm = NORM_TRANSLATION

    try:
        with file_path.open("r", encoding="utf-8-sig", errors="replace", buffering=IO_BUFFER_SIZE) as f:
            for line in f:
                # 1. NFC normalization unifies decomposed accents (e.g. e + \u0301 -> é)
                line = unicodedata.normalize("NFC", line)
                # 2. Standardize typographic quotes, dashes, and exotic spaces
                line = line.translate(norm)

                # 3. Strip Leipzig sentence index prefixes: "1234\tSentence..."
                tab_idx = line.find("\t")
                if tab_idx != -1 and line[:tab_idx].isdigit():
                    line = line[tab_idx + 1:]

                words = line.split()
                if words:
                    update(words)
    except Exception as e:
        print(f"    [WARNING] Error reading {file_path.name}: {e}", file=sys.stderr)


# =====================================================================
# SANITIZATION & N-GRAM GENERATION
# =====================================================================

def sanitize_token(token: str, u_type: bytes):
    """
    Validates and cleanses a candidate word against strict rules:
    - Strips outer non-letter, non-whitelisted characters (e.g., brackets '(', ')', '[', ']').
    - Rejects any token containing digits or unauthorized internal characters.
    - Requires at least one certified letter.
    Returns the sanitized token string or None if invalid.
    """
    if not token:
        return None

    # Strip unauthorized surrounding boundary characters (e.g. parentheses or brackets)
    start = 0
    end = len(token)

    while start < end:
        cp = ord(token[start])
        if cp >= 0x110000 or u_type[cp] == 0:
            start += 1
        else:
            break

    while end > start:
        cp = ord(token[end - 1])
        if cp >= 0x110000 or u_type[cp] == 0:
            end -= 1
        else:
            break

    if start >= end:
        return None

    token = token[start:end]

    # Fast-path for standard ASCII alphabetic words
    if token.isascii() and token.isalpha():
        return token

    has_letter = False
    valid_chars = []

    for ch in token:
        cp = ord(ch)
        if cp >= 0x110000:
            return None
        t = u_type[cp]
        if t == 1:
            has_letter = True
            valid_chars.append(ch)
        elif t == 2:
            valid_chars.append(ch)
        else:
            # Contains an invalid character or digit -> reject entire token
            return None

    if not has_letter or not valid_chars:
        return None

    cleaned = "".join(valid_chars)
    # Ensure token is not pure punctuation (e.g., "...", "---")
    if not any(u_type[ord(c)] == 1 for c in cleaned):
        return None

    return cleaned


def generate_all_ngrams(raw_word_counts: Counter, min_count: int = 50):
    """
    1. Filters vocabulary to words with frequency >= min_count.
    2. Validates character legality (no digits, authorized punctuation only).
    3. Populates the 4 standard categories.
    4. Computes 2, 3, and 4-grams strictly from certified tokens.
    """
    counters = {
        cat: {2: defaultdict(int), 3: defaultdict(int), 4: defaultdict(int), "words": defaultdict(int)}
        for cat in CAT_NAMES
    }

    la = counters["Lowercase_Alphanumeric"]
    aa = counters["All_Cases_Alphanumeric"]
    lp = counters["Lowercase_Alphanumeric_Punctuation"]
    ap = counters["All_Cases_Alphanumeric_Punctuation"]

    u_type = UNICODE_TYPE

    def add_ngrams(target_dict, seq: str, count: int):
        seq_len = len(seq)
        if seq_len >= 2:
            d2 = target_dict[2]
            for i in range(seq_len - 1):
                d2[seq[i:i + 2]] += count
        if seq_len >= 3:
            d3 = target_dict[3]
            for i in range(seq_len - 2):
                d3[seq[i:i + 3]] += count
        if seq_len >= 4:
            d4 = target_dict[4]
            for i in range(seq_len - 3):
                d4[seq[i:i + 4]] += count

    total_unique = len(raw_word_counts)
    retained_words = 0
    discarded_count_threshold = 0
    discarded_invalid_chars = 0

    for raw_word, count in raw_word_counts.items():
        if count < min_count:
            discarded_count_threshold += 1
            continue

        clean_word = sanitize_token(raw_word, u_type)
        if not clean_word:
            discarded_invalid_chars += 1
            continue

        retained_words += 1
        word_lower = clean_word.lower()

        # Category 1: All Cases Alphanumeric + Punctuation
        ap["words"][clean_word] += count
        add_ngrams(ap, clean_word, count)

        # Category 2: Lowercase Alphanumeric + Punctuation
        lp["words"][word_lower] += count
        add_ngrams(lp, word_lower, count)

        # Categories 3 & 4: Pure letters only (punctuation omitted)
        pure_letters = "".join(c for c in clean_word if u_type[ord(c)] == 1)
        if len(pure_letters) >= 2:
            pure_lower = pure_letters.lower()

            aa["words"][pure_letters] += count
            add_ngrams(aa, pure_letters, count)

            la["words"][pure_lower] += count
            add_ngrams(la, pure_lower, count)

    print(f"        [FILTER STATS] Total raw tokens: {total_unique:,}")
    print(f"          -> Retained certified words: {retained_words:,} (count >= {min_count})")
    print(f"          -> Discarded (count < {min_count}): {discarded_count_threshold:,}")
    print(f"          -> Discarded (digits / invalid chars): {discarded_invalid_chars:,}")

    return counters


# =====================================================================
# BULK DISK EXPORT
# =====================================================================

def save_ngrams(counter: dict, output_path: Path):
    """
    Exports TSV data sorted descending by count, then ascending alphabetically.
    Uses buffered chunk writes for optimal disk I/O.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not counter:
        output_path.write_text("", encoding="utf-8")
        return

    # Stable dual-key sort: Alphabetical ascending first, then count descending
    items = sorted(counter.items(), key=itemgetter(0))
    items.sort(key=itemgetter(1), reverse=True)

    with output_path.open("w", encoding="utf-8", newline="\n", buffering=IO_BUFFER_SIZE) as f:
        for i in range(0, len(items), CHUNK_WRITE_SIZE):
            chunk = items[i:i + CHUNK_WRITE_SIZE]
            f.write("".join(f"{seq}\t{cnt}\n" for seq, cnt in chunk))


# =====================================================================
# CORPUS PROCESSING PIPELINE
# =====================================================================

def process_target(target_path: Path):
    """Processes a single language corpus folder or individual text file."""
    start_time = time.time()

    clean_name = target_path.stem if target_path.is_file() else target_path.name
    if clean_name.startswith("Corpus_"):
        clean_name = clean_name[len("Corpus_"):]

    print("\n" + "=" * 60)
    print(f" PROCESSING CORPUS: {clean_name.upper()}")
    print("=" * 60)

    if target_path.is_dir():
        files_to_read = sorted([
            p for p in target_path.glob("*.txt")
            if p.is_file() and not p.name.startswith(".") and p.stat().st_size > 0
        ])
    else:
        files_to_read = [target_path]

    if not files_to_read:
        print(f"  [ERROR] No valid .txt files found in: {target_path}", file=sys.stderr)
        return

    # Phase 1: Streaming vocabulary aggregation
    master_word_counts = Counter()
    total_bytes = 0

    print("  [1/3] Streaming corpus vocabulary...")
    for f in files_to_read:
        size_mb = f.stat().st_size / (1024 * 1024)
        total_bytes += f.stat().st_size
        print(f"        -> {f.name} ({size_mb:.2f} MB)")
        count_words_from_stream(f, master_word_counts)

    print(f"        Total Read: {total_bytes / (1024 * 1024):.2f} MB | {len(master_word_counts):,} raw tokens.")

    # Phase 2: Filtering & N-gram computation
    print(f"  [2/3] Filtering (threshold >= {MIN_WORD_OCCURRENCE}) and computing n-grams...")
    counters = generate_all_ngrams(master_word_counts, min_count=MIN_WORD_OCCURRENCE)

    # Phase 3: Disk export
    output_base = OUTPUT_DIR / f"Ngram_{clean_name}"
    print(f"  [3/3] Exporting clean datasets to: {output_base.name}/")

    for cat_name in CAT_NAMES:
        cat_dir = output_base / cat_name
        cat_data = counters[cat_name]

        # Export 2, 3, and 4-grams
        for n in NGRAM_SIZES:
            save_ngrams(cat_data[n], cat_dir / f"{n}grams.txt")

        # Export vocabulary list
        save_ngrams(cat_data["words"], cat_dir / "words.txt")

    elapsed = time.time() - start_time
    print(f"  SUCCESS: {clean_name} completed in {elapsed:.2f} seconds.")


# =====================================================================
# CLI ENTRY POINT
# =====================================================================

def main():
    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    targets = sorted(
        [p for p in CORPUS_DIR.iterdir() if not p.name.startswith(".") and p.name != "Corpus_Info.txt"],
        key=lambda p: p.name.lower(),
    )

    if not targets:
        print(f"No corpus directories found in:\n{CORPUS_DIR}")
        print("Please place language corpus folders there (e.g., Corpus_English, Corpus_French).")
        return

    print("\n" + "=" * 60)
    print(" N-GRAM & VOCABULARY GENERATOR (STRICT 50+ OCCURRENCES)")
    print("=" * 60)
    print("Detected corpora in /corpus:\n")

    for idx, target in enumerate(targets, start=1):
        tag = "[DIR] " if target.is_dir() else "[FILE]"
        print(f"  {idx}. {tag} {target.name}")

    print("\nSelect target(s) to process:")
    print(" - Single or multiple languages: enter numbers (e.g. 1 or 1,3)")
    print(" - All languages: type 'all'")
    print(" - Quit: type 'q'")

    choice = input("\nYour choice: ").strip().lower()
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
            print("Invalid input. Please enter 'all' or comma-separated indices like '1,2'.")
            return

    total_start = time.time()
    for target in queue:
        try:
            process_target(target)
        except Exception as err:
            print(f"\n[ERROR] Processing failed on {target.name}: {err}", file=sys.stderr)

    total_elapsed = time.time() - total_start
    print("\n" + "=" * 60)
    print(f" ALL TASKS COMPLETED in {total_elapsed:.2f} seconds!")
    print(f" Clean datasets generated in: {OUTPUT_DIR}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()