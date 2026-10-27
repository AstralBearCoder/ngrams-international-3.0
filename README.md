# ngramInternational (IntlNgram)

> A multilingual touch-typing trainer that finds **your** slowest letter combinations (n-grams), scores them against **your** personal speed, and builds drills to fix them.

[![Live Demo](https://img.shields.io/badge/demo-online-34d399?style=for-the-badge&logo=googlechrome&logoColor=white)](https://astralbearcoder.github.io/ngrams-international-3.0/)
[![Version](https://img.shields.io/badge/version-6.1-facc15?style=for-the-badge)](https://github.com/AstralBearCoder/ngrams-international-3.0)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Pure Web](https://img.shields.io/badge/dependencies-zero%20npm-88c0d0?style=for-the-badge&logo=javascript&logoColor=white)](https://github.com/AstralBearCoder/ngrams-international-3.0)

**ngramInternational** is an evolution of Ranel Padon's open-source [ngram-type](https://github.com/ranelpadon/ngram-type). The original offered exercises on sub-word combinations (bigrams, trigrams, tetragrams). This project adds weakness tracking, personalized scoring, progression charts, targeted drills and 8 languages.

---

## At a Glance

| | |
| :--- | :--- |
| 🌍 **8 languages** | English, French, German, Italian, Polish, Portuguese, Russian, Spanish |
| 🎯 **Weakness detection** | Records latency and errors for every word and n-gram you type |
| 📊 **Priority score (1–100)** | Judged against *your own* average WPM, weighted by how common the n-gram is |
| 📈 **Progress charts** | 5-sample checkpoints, *Recent 100* and *All-Time* views |
| 🏋️ **3 drill modes** | Classic, Sandwich, Ladder |
| 👤 **Multi-profile** | Separate stats per profile and language, JSON backup/restore |
| 🔒 **100 % client-side** | No telemetry, no server, no tracking |

**Try it now:** [astralbearcoder.github.io/ngrams-international-3.0](https://astralbearcoder.github.io/ngrams-international-3.0/)

> 👇 Everything below the screenshots is optional deep-dive material. Each section can be expanded on demand.

---

## Visual Preview

| 1. Main Typing Stage | 2. Weakness Detection & Priority Spectrum |
| :---: | :---: |
| ![Main Typing Stage](docs/Screen/Sh_Main.png) | ![Weakness Detection Table](docs/Screen/Sh_Weakness.png) |
| *Dead-center stage with real-time feedback & WPM tracking* | *Personalized priority scoring & dual latency/WPM metrics* |

| 3. All-Time Evolution & Progression SVG | 4. Targeted Drill Configurator |
| :---: | :---: |
| ![Evolution Chart](docs/Screen/Sh_Evolution.png) | ![Targeted Drill Configurator](docs/Screen/Sh_Drill.png) |
| *5-sample checkpoints with Recent 100 & All-Time overview* | *Focused bottleneck training: Classic, Sandwich & Ladder* |

---

## How It Works in 30 Seconds

1. **You type.** The app measures how long each n-gram takes you and whether you make errors.
2. **It compares you to yourself.** An n-gram is "slow" only relative to your own baseline WPM, not an arbitrary threshold.
3. **It ranks your bottlenecks.** Common n-grams you are slow on come first (`CRITICAL` ≥ 70, `HIGH` 50–69, `MODERATE` 30–49, `FLUID` < 30).
4. **It builds drills.** Repetition (Classic), real words around the target (Sandwich) or growing vocabulary (Ladder).
5. **It charts your progress** over time.

The language data (word lists and n-gram frequencies) comes from a **reproducible Python pipeline** that turns large public text corpora into clean frequency files. See [Where the Language Data Comes From](#where-the-language-data-comes-from).

---

## Evolution from the Original Engine

| Dimension | Original `ngram-type` | `ngramInternational` |
| :--- | :--- | :--- |
| **Languages** | English only | **8 corpora** with native frequency ranks |
| **Case & punctuation** | Lowercase alphanumeric only | **4 variants** per corpus (case × punctuation) |
| **Weakness detection** | *None* | **Word & n-gram tracking** of latency and error rate |
| **Difficulty scoring** | *None* | **Baseline-relative priority index (1–100)** |
| **Progression history** | *None* | **Vector SVG charts**: *Recent 100* and *All-Time* |
| **Remediation drills** | Random generation only | **3 modes**: Classic, Sandwich, Ladder |
| **Profiles & data** | Single local state | **Multi-profile** with per-language stats and JSON backup |

---

# Deep Dive

<details>
<summary><b>📐 1. The Priority Index: formulas and a worked example</b></summary>

<br>

Instead of using one absolute latency threshold (which would label beginners as failures and experts as flawless), every n-gram is compared with your **personal baseline speed**.

Notation: `L` = n-gram length in characters, `WPM` = your personal baseline words per minute (5 characters = 1 word).

**Step 1: Expected latency at your baseline**

```text
Baseline(L) = 12000 × L / BaselineWPM          (in milliseconds)
```

**Step 2: Relative latency ratio** (above 1 = slower than your baseline)

```text
R = ObservedLatency / Baseline(L)
```

**Step 3: Smoothed error penalty** (Laplace smoothing prevents a single error on few samples from exploding the score)

```text
E = 1 + ( RecentErrors / (RecentSamples + 2) ) × 2.5
```

**Step 4: Corpus frequency weight** (common n-grams matter more; only the top 200 ranks are distinguished)

```text
Wfreq = 0.35 + 0.65 × (201 − min(200, Rank)) / 200
```

**Step 5: Final score** (clamped between 1 and 100)

```text
Priority = clamp( 1, 100, round( R × E × Wfreq × 40 ) )
```

**Qualitative tiers**

| Tier | Score | Meaning |
| :--- | :---: | :--- |
| `CRITICAL` | ≥ 70 | High error rate or much slower than your baseline |
| `HIGH` | 50 – 69 | Noticeable bottleneck compared to your usual pace |
| `MODERATE` | 30 – 49 | In line with your current speed |
| `FLUID` | < 30 | Automatized pattern, faster than your baseline |

**Worked example**

You type at a baseline of **60 WPM**. The trigram `ing` (L = 3) is ranked **#10** in the corpus. Your recent history shows **2 errors in 8 samples**, and your average latency on it is **900 ms**.

```text
Baseline(3) = 12000 × 3 / 60            = 600 ms
R           = 900 / 600                 = 1.5
E           = 1 + (2 / (8 + 2)) × 2.5   = 1.5
Wfreq       = 0.35 + 0.65 × (201 − 10) / 200 = 0.971
Priority    = round(1.5 × 1.5 × 0.971 × 40)  = 87   →  CRITICAL
```

**Dual speed display.** Each n-gram shows both its raw latency (ms) and an equivalent WPM:

```text
WPM = 12000 × L / T_ms
```

### Where do the numbers come from?

#### Why 12 000?

It is just a unit conversion. By typing convention, **1 word = 5 characters**.

```text
1 minute            = 60 000 ms
1 word              = 5 characters

BaselineWPM words/min  =  5 × BaselineWPM characters/min

time per character  = 60 000 ms / (5 × BaselineWPM)
                    = 12 000 / BaselineWPM   ms        ← 60 000 / 5 = 12 000

time for L characters = 12 000 × L / BaselineWPM   ms
```

Quick check at **60 WPM**: 60 × 5 = 300 characters per minute = 5 per second = **200 ms per character**, and `12 000 / 60 = 200`. ✔ A 3-letter n-gram is therefore expected to take 600 ms.

Going the other way (from a measured latency back to WPM) is the same equation solved for WPM:

```text
T_ms = 12000 × L / WPM     ⇒     WPM = 12000 × L / T_ms
```

| Baseline WPM | ms per character | Expected time, bigram (L=2) | trigram (L=3) | tetragram (L=4) |
| :---: | :---: | :---: | :---: | :---: |
| 30 | 400 | 800 ms | 1 200 ms | 1 600 ms |
| 60 | 200 | 400 ms | 600 ms | 800 ms |
| 90 | 133 | 267 ms | 400 ms | 533 ms |
| 120 | 100 | 200 ms | 300 ms | 400 ms |

#### What the other constants do

| Constant | Where | Role | Effect |
| :---: | :--- | :--- | :--- |
| **+ 2** | `RecentSamples + 2` | **Laplace smoothing**: acts like 2 "phantom" samples with no errors | With few samples, the error ratio is pulled toward 0, so one early mistake cannot dominate. With many samples, it fades away. |
| **2.5** | `× 2.5` | **Error weight**: how much a 100 % error rate adds | `E` ranges from **1.0** (no errors) up to a ceiling of **3.5** (every sample wrong, many samples). |
| **0.35 / 0.65** | `0.35 + 0.65 × …` | **Floor and span** of the frequency weight (0.35 + 0.65 = 1.00) | Even a rare n-gram keeps at least 35 % of its score; the most common one keeps 100 %. |
| **201 and 200** | `(201 − min(200, Rank)) / 200` | **Rank window**: only the 200 most frequent n-grams are distinguished | Rank 1 → 200/200 = 1.0. Rank 200 or beyond → 1/200 = 0.005 (the `201` avoids a zero at rank 200). |
| **40** | `× 40` | **Scale factor** that maps the product onto the 1–100 scale | A "perfectly average" n-gram (R = 1, E = 1, W = 1) scores exactly **40**, in the middle of `MODERATE` (30–49). |
| **1 and 100** | `clamp(1, 100, …)` | Keeps the score on the displayed scale | No score below 1 or above 100. |

These are **tuning constants**, not physical laws. Only the 12 000 is fixed by definition. The rest are design choices that you can change to make the index stricter or more lenient.

#### Frequency weight at a glance

```text
Wfreq = 0.35 + 0.65 × (201 − min(200, Rank)) / 200
```

| Rank (1 = most frequent) | Wfreq |
| :---: | :---: |
| 1 | 1.000 |
| 10 | 0.971 |
| 50 | 0.841 |
| 100 | 0.678 |
| 200 or more | 0.353 |

#### Error penalty at a glance

```text
E = 1 + ( RecentErrors / (RecentSamples + 2) ) × 2.5
```

| Recent errors / samples | Calculation | E |
| :---: | :--- | :---: |
| 0 / 10 | 1 + 0/12 × 2.5 | 1.00 |
| 1 / 10 | 1 + 1/12 × 2.5 | 1.21 |
| 2 / 8 | 1 + 2/10 × 2.5 | 1.50 |
| 5 / 10 | 1 + 5/12 × 2.5 | 2.04 |
| 10 / 10 | 1 + 10/12 × 2.5 | 3.08 |
| 1 / 1 | 1 + 1/3 × 2.5 | 1.83 |

The last row shows the smoothing at work: a single error on a single sample gives 1.83, not the 3.5 that an unsmoothed 100 % error rate would give.

#### What the product `R × E × Wfreq` means for the tiers

The final score is `round(40 × R × E × Wfreq)`, so each tier corresponds to a threshold on the product:

| Tier | Score | Product `R × E × Wfreq` must be about… |
| :--- | :---: | :---: |
| `CRITICAL` | ≥ 70 | ≥ 1.75 |
| `HIGH` | 50 – 69 | 1.25 – 1.74 |
| `MODERATE` | 30 – 49 | 0.75 – 1.24 |
| `FLUID` | < 30 | < 0.75 |

Some concrete cases (no errors, so `E = 1`):

| Situation | R | Wfreq | Score | Tier |
| :--- | :---: | :---: | :---: | :--- |
| Typed at your baseline, very common n-gram | 1.0 | 1.00 | 40 | `MODERATE` |
| Typed at your baseline, rank-100 n-gram | 1.0 | 0.68 | 27 | `FLUID` |
| 50 % slower than baseline, very common | 1.5 | 1.00 | 60 | `HIGH` |
| Twice as slow as baseline, very common | 2.0 | 1.00 | 80 | `CRITICAL` |
| Twice as fast as baseline, very common | 0.5 | 1.00 | 20 | `FLUID` |
| 2.5× slower than baseline, very common | 2.5 | 1.00 | 100 (capped) | `CRITICAL` |

**Reading the table:** speed is not the only factor. Because of the frequency weight, an n-gram you type *at* your baseline can still be `FLUID` if it is uncommon, since there is little to gain from drilling it. Frequent n-grams are the ones that move your overall speed the most, so they are prioritized.

</details>

<details>
<summary><b>📈 2. Progression charts (Evolution Engine)</b></summary>

<br>

- **Granular checkpoints**: metrics are grouped into **5-sample blocks**.
- **Calibration phase (< 50 occurrences)**: initial blocks are shown with a progress indicator toward statistical maturity.
- **Two views (≥ 50 occurrences)**:
  - **Recent 100**: your last 100 occurrences as 20 checkpoints.
  - **All-Time**: downsampled and binned to a maximum of **40 points**, so the SVG stays clean and fast.

</details>

<details>
<summary><b>🏋️ 3. Drill modes</b></summary>

<br>

| Mode | What it does |
| :--- | :--- |
| **Classic** | Direct, rhythm-building repetition of your weak n-grams |
| **Sandwich** | Mixes the target n-gram with high-frequency anchor words of the selected language |
| **Ladder** | Expands the n-gram into real vocabulary of increasing length (3–4, 5–6, 7–9 letters) |

Independent toggles let you include or exclude **uppercase** characters and **punctuation** in drills.

</details>

---

## Where the Language Data Comes From

Every language is built the same way: **public text corpora → one Python script → clean frequency files the web app loads.**

```text
  Public corpora            Your /corpus folder            ngram-main.py              /data folder
 ┌────────────────┐       ┌───────────────────────┐      ┌───────────────┐      ┌───────────────────────┐
 │ Leipzig (3×)   │  ───▶ │ Corpus_French/        │ ───▶ │ clean, count, │ ───▶ │ Ngram_French/         │
 │ OpenSubtitles  │       │   fra_news.txt  ...   │      │ n-gram, sort  │      │   4 variants × 4 files│
 └────────────────┘       └───────────────────────┘      └───────────────┘      └───────────────────────┘
```

**In short:**

- **Sources**: for each language, 4 text files from different registers (news, web, Wikipedia, subtitles), documented in [`All_Corpus_Sources.txt`](All_Corpus_Sources.txt).
- **Processing**: [`ngram-main.py`](ngram-main.py) streams the files, cleans the words, keeps those seen **at least 50 times**, and counts all 2-, 3- and 4-grams.
- **Output**: for each language, 4 variants (lowercase / all cases × with / without punctuation), each containing `words.txt`, `2grams.txt`, `3grams.txt` and `4grams.txt`.

<details>
<summary><b>📚 4. Corpus sources (what is used and why)</b></summary>

<br>

Each language uses **four registers** so the vocabulary reflects formal writing, everyday web text, encyclopedic text and spoken language:

| Register | Source | Why it matters |
| :--- | :--- | :--- |
| **News** | [Leipzig Corpora Collection](https://wortschatz.uni-leipzig.de/en/download) | Recent, edited, contemporary vocabulary |
| **Web** | Leipzig Corpora Collection | Informal, everyday written language |
| **Wikipedia** | Leipzig Corpora Collection | Encyclopedic and technical vocabulary |
| **Subtitles** | [OpenSubtitles via OPUS](https://opus.nlpl.eu/datasets/OpenSubtitles) (v2018) | Conversational, spoken-style language |

The three Leipzig files are the **1M-sentence** editions. File names follow `<iso3>_<register>.txt` (e.g. `fra_news.txt`).

| Language | ISO | News | Web | Wikipedia | Subtitles |
| :--- | :---: | :---: | :--- | :---: | :---: |
| English | `eng` | 2025 | Public 2018 (UK) | 2016 | v2018 |
| French | `fra` | 2024 | 2017 (EU) | 2021 | v2018 |
| German | `deu` | 2025 | 2021 (Germany) | 2021 | v2018 |
| Italian | `ita` | 2024 | Public 2019 (Italian) | 2021 | v2018 |
| Polish | `pol` | 2024 | 2018 (.com) | 2021 | v2018 |
| Portuguese | `por` | 2024 | 2015 (Portugal) | 2021 | v2018 |
| Russian | `rus` | 2024 | Public 2019 (Russia) | 2021 | v2018 |
| Spanish | `spa` | 2024 | 2016 (General) | 2021 | v2018 |

The exact download URL and edition of every file are listed in [`All_Corpus_Sources.txt`](All_Corpus_Sources.txt), one block per language. Keep that file up to date whenever you add or replace a source, so every dataset stays traceable.

</details>

<details>
<summary><b>⚙️ 5. How <code>ngram-main.py</code> processes the corpora</b></summary>

<br>

### Running it

```bash
# 1. Put each language's text files in their own folder under ./corpus
#      corpus/Corpus_French/fra_news.txt
#      corpus/Corpus_French/fra_web.txt
#      corpus/Corpus_French/fra_wikipedia.txt
#      corpus/Corpus_French/fra_subtitles.txt

# 2. Run the script (Python 3, standard library only)
python ngram-main.py
```

The script lists every folder or file found in `./corpus` and asks what to process:

| Input | Effect |
| :--- | :--- |
| `1` or `1,3` | Process the selected corpora |
| `all` | Process everything |
| `q` | Quit |

A folder named `Corpus_<Name>` produces `data/Ngram_<Name>/`. The `Corpus_` prefix is removed automatically. A single `.txt` file is also accepted as a target. Files named `Corpus_Info.txt` or starting with `.` are ignored.

### The three phases

| Phase | What happens |
| :--- | :--- |
| **1. Stream** | Every `.txt` file of the folder is read line by line (1 MB buffer) and all whitespace-separated tokens are counted into one shared counter. The files are never loaded whole into memory; only the running token counter is kept. |
| **2. Filter & count** | Tokens seen fewer than **50 times** are dropped, survivors are sanitized, then 2-, 3- and 4-grams are computed for each of the 4 variants. |
| **3. Export** | Each list is written as TSV, sorted by count (descending) then alphabetically. |

### Cleaning rules

| Rule | Detail |
| :--- | :--- |
| **Unicode normalization** | NFC, so `e` + combining accent becomes `é`. Essential for French, Polish, Portuguese, etc. |
| **Typography standardized** | Curly quotes → `'`, `«` `»` and curly double quotes → `"`, all dash types → `-`, `…` → `.`, full-width punctuation → ASCII, exotic spaces → normal space |
| **Leipzig prefixes removed** | Lines like `1234⇥Sentence…` lose their numeric index |
| **Zero-digit policy** | Any token containing a digit or any Unicode number character is rejected entirely |
| **Allowed punctuation** | Only `'` `"` `:` `.` `,` `?` `!` `;` `_` `-` `/` |
| **Edges trimmed** | Leading/trailing characters that are neither letters nor allowed punctuation (brackets, parentheses…) are stripped |
| **Inner characters** | A token with any other invalid character inside is rejected |
| **At least one letter** | Pure punctuation such as `...` or `---` is rejected |
| **Letters are universal** | Any Unicode letter is accepted (Latin, Cyrillic, accented, etc.) |
| **Frequency threshold** | A token must appear **≥ 50 times** in the combined corpus. The count is taken on the raw token (case and attached punctuation included), *before* cleaning. |

### The four output variants

| Variant folder | Case | Punctuation | How tokens are built |
| :--- | :---: | :---: | :--- |
| `Lowercase_Alphanumeric` | lower | no | Letters only, lowercased |
| `All_Cases_Alphanumeric` | mixed | no | Letters only, original case |
| `Lowercase_Alphanumeric_Punctuation` | lower | yes | Allowed punctuation kept, lowercased |
| `All_Cases_Alphanumeric_Punctuation` | mixed | yes | Allowed punctuation kept, original case |

Good to know:

- The folder names say "Alphanumeric", but the **zero-digit policy** means digits never appear; the data is letters (plus punctuation in the punctuation variants).
- In the **non-punctuation** variants, punctuation is *removed from inside* the word (e.g. `l'homme` → `lhomme`) and words with fewer than 2 letters are skipped.
- In the **punctuation** variants, punctuation stays attached (e.g. `l'homme`, `bonjour,`), so n-grams can include it.
- **N-grams never cross word boundaries.** Each n-gram occurrence adds the **frequency of the word it came from**, so counts reflect real-world usage, not just vocabulary.
- Words and n-grams are exported as `words.txt`, `2grams.txt`, `3grams.txt` and `4grams.txt` in each variant folder. Row order = frequency order.

### Console feedback

For each corpus the script prints the files read and their sizes, the number of raw tokens, and a filter summary: words retained, words discarded for low count, and words discarded for digits or invalid characters.

</details>

<details>
<summary><b>🌐 6. Adding a new language</b></summary>

<br>

Adding a language needs **no changes to the processing logic**: gather the text, run the script, register the result.

**Step 1: Collect text.** Download several text files for the language (ideally news, web, Wikipedia and subtitles, as for the existing languages) and add their origin to `All_Corpus_Sources.txt`.

**Step 2: Place them in a corpus folder.**

```text
corpus/
└── Corpus_Dutch/
    ├── nld_news.txt
    ├── nld_web.txt
    ├── nld_wikipedia.txt
    └── nld_subtitles.txt
```

**Step 3: Generate the data.**

```bash
python ngram-main.py      # choose the Dutch entry, or type "all"
```

This creates the following structure. Each of the four variant folders holds the same four files:

```text
data/
└── Ngram_Dutch/
    ├── All_Cases_Alphanumeric/
    ├── All_Cases_Alphanumeric_Punctuation/
    ├── Lowercase_Alphanumeric/
    └── Lowercase_Alphanumeric_Punctuation/
        ├── words.txt
        ├── 2grams.txt
        ├── 3grams.txt
        └── 4grams.txt
```

**File format.** UTF-8, one entry per line, a tab, then the occurrence count (TSV):

```text
the	50000000
and	35000000
that	20000000
```

**Step 4: Register the corpus** in `app.js`, with anchor words for Sandwich drills:

```javascript
// Register language metadata
availableCorpora: [
    { id: 'Ngram_Dutch', label: 'Dutch', lang: 'nld' },
    // ...
]

// High-frequency anchor words for Sandwich drills
const LANGUAGE_ANCHORS = Object.freeze({
    nld: Object.freeze(['de', 'het', 'en', 'van', 'ik', 'te', 'dat', 'die', 'in', 'een']),
    // ...
});
```

</details>

<details>
<summary><b>🔒 7. Profiles & data privacy</b></summary>

<br>

- **100 % client-side**: no telemetry, no remote database, zero tracking.
- **Isolated storage**: statistics are partitioned per profile and per language code, under keys like `ngramWeakStats_u_<profileId>_l_<lang>`.
- **Full portability**: export your whole history, benchmarks and checkpoints as a JSON file at any time, and restore it on another machine.

</details>

---

## Credits & Acknowledgments

- **Original project**: forked from [ngram-type](https://github.com/ranelpadon/ngram-type) by **Ranel Padon**.
- **Architecture & enhancements**: engineered and maintained by **[AstralBearCoder](https://github.com/AstralBearCoder)**.
- **Corpora**: [Leipzig Corpora Collection](https://wortschatz.uni-leipzig.de/en/download) (University of Leipzig) and [OpenSubtitles](https://opus.nlpl.eu/datasets/OpenSubtitles) via OPUS.
- **Fonts & libraries**: *Inter*, *Fira Code*, *Bootstrap 4*, *Font Awesome 4.7* and *Vue.js*.

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details. Corpus data remains subject to the licenses of its original providers.
