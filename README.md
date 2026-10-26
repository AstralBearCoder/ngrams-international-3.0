Voici le `README.md` entièrement mis à jour, suivi de l'analyse critique de votre documentation.

---

# 1. Le README.md Mis à Jour

```markdown
# Ngram International — Multilingual Typing Trainer with Weakness Detection

A touch-typing trainer built around the most frequent **bigrams, trigrams, tetragrams, and words** of a language. It features **balanced multi-domain corpora across 8 languages**, **punctuation and capitalization toggles**, a **Weakness Detector** that pinpoints the n-grams *you* struggle with, and **targeted drills** to fix them.

---

### 🌐 [**👉 Click here to try the tool !**](https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/)

---

## 🌍 Supported Default Languages

Each language corpus is built on a **balanced 4-million sentence dataset** combining four distinct registers: **Conversational Dialogue** (OPUS OpenSubtitles), **Encyclopedic** (Wikipedia), **Everyday Web** (Leipzig Web-Public), and **Formal News** (Leipzig News).

| Flag | Language | Dataset Sources | Folder ID | `lang` |
| :---: | :--- | :--- | :--- | :---: |
| 🇬🇧 / 🇺🇸 | **English** | News (2025) + Web UK (2018) + Wiki (2016) + Subtitles | `Ngram_English` | `eng` |
| 🇫🇷 | **French** | News (2024) + Web EU (2017) + Wiki (2021) + Subtitles | `Ngram_French` | `fra` |
| 🇩🇪 | **German** | News (2025) + Web DE (2021) + Wiki (2021) + Subtitles | `Ngram_German` | `deu` |
| 🇮🇹 | **Italian** | News (2024) + Web IT (2019) + Wiki (2021) + Subtitles | `Ngram_Italian` | `ita` |
| 🇵🇱 | **Polish** | News (2024) + Web (2018) + Wiki (2021) + Subtitles | `Ngram_Polish` | `pol` |
| 🇵🇹 | **Portuguese** | News (2024) + Web PT (2015) + Wiki (2021) + Subtitles | `Ngram_Portuguese` | `por` |
| 🇷🇺 | **Russian** | News (2024) + Web RU (2019) + Wiki (2021) + Subtitles | `Ngram_Russian` | `rus` |
| 🇪🇸 | **Spanish** | News (2024) + Web (2016) + Wiki (2021) + Subtitles | `Ngram_Spanish` | `spa` |
| ➕ | **Your own** | Any custom language, book, code, or word list | `Ngram_<name>` | any |

---

## 📌 Credits & Attribution

This project is a fork and extension of **[Ngram Type](https://github.com/ranelpadon/ngram-type)** by **[Ranel Padon](https://github.com/ranelpadon)**.

The core typing engine, WPM/accuracy tracking, audio feedback, and lesson generation are based on his original work. Everything listed under *What this fork adds* was built on top of it.

---

## 🚀 What This Fork Adds

### Practice Material
* **Multi-Domain Corpora**: No "news-only" bias. Training includes conversational contractions (*I'm, c'est, don't*), everyday slang, academic terms, and journalistic prose.
* **Full Alphabet & Accent Support**: Native support for Cyrillic (Russian) and European accented characters (`é, à, ñ, ß, ł, ą, ç`).
* **Include Punctuation**: Practice real-world punctuation transitions (`¿ ? ¡ ! , . ; : « » ( ) ' -`).
* **Include Capitalization**: Practice uppercase shift reaches alongside lowercase flows.
* **Instant Switching**: Switching between Caps/Punctuation or languages is instant; data is streamed, frequency-sorted, and cached.

### Weakness Detector
* Every word you type is timed. Every contained n-gram receives latency and error samples. Typos and hesitations are tracked even when your minimum accuracy threshold is 100%.
* Tracks a sliding window of the last **50 samples** per n-gram.
* An n-gram requires at least **3 samples** before being flagged as a confirmed weakness to prevent outliers from skewing results.
* Statistics are saved **per profile and per language** in your browser (`localStorage`).

### Targeted Drills
* **Classic**: Direct repetition of your slowest n-grams.
* **Sandwich**: Interleaves your weak n-grams with curated, high-frequency anchor words of that language to maintain natural typing cadence.
* **Ladder**: Embeds weak n-grams into the two shortest real dictionary words containing them.

### Ergonomics & Customization
* **Profiles**: Multiple user profiles on one machine, with JSON **Export / Restore**.
* **Themes**: 15 themes included (Default: *Emerald*).
* **No-Reset Mode**: Prevents accidental test restarts via Tab or Escape.
* **Custom Words**: Train on your own custom word lists on demand.

---

## 🛠️ How to Add or Re-generate Corpora

The included high-performance generator aggregates multi-gigabyte corpora in seconds with a memory footprint under 150 MB.

### 1. Place your text files

You can add a single file or an entire folder of files inside `corpus/`:

```text
corpus/
├── Corpus_Japanese/
│   ├── news.txt
│   └── web.txt
└── Esperanto.txt
```
*Both plain text and Leipzig formats (`<digits>\t<sentence>`) are recognized automatically.*

### 2. Run the Generator

```bash
python ngrams.py
```
Type `all` (or enter specific numbers). The script will clean typography, aggregate vocabulary via Zipf reduction, compute 2-, 3-, 4-grams and words across all 4 categories, and output them to `data/Ngram_<Name>/`:

```text
data/
└── Ngram_German/
    ├── Lowercase_Alphanumeric/
    ├── All_Cases_Alphanumeric/
    ├── Lowercase_Alphanumeric_Punctuation/
    └── All_Cases_Alphanumeric_Punctuation/
```

### 3. Register it in `app.js`

Open `app.js` and add your entry to `availableCorpora`:

```javascript
availableCorpora: [
    // ...
    { id: 'Ngram_German', label: 'German', lang: 'deu' }
],
```

---

## ▶️ Running Locally & Deployment

Because data files are loaded dynamically via `fetch()`, run the application through a local web server:

```bash
python -m http.server 8000
```
Then open <http://localhost:8000>.

### Deploying to GitHub Pages
Simply push your repository to GitHub and enable Pages in your repository settings. 
* *Note:* Only commit `data/`, `assets/`, `media/`, `index.html`, and `app.js`. The raw source texts in `corpus/` are not needed at runtime and should be kept in `.gitignore`.

---

## 📄 License

MIT License — free to use, modify, and distribute. Original work by Ranel Padon.
```