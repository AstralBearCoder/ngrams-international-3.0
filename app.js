/**
 * ngramInternational — Core Typing, Statistical Weakness & Evolution Engine
 * v6.2 Multilingual Precision Engine:
 * - Atomic 27th letter ('qu=1') support with exact unit tokenization across all pyramid levels.
 * - Strict 500-scope dataset loader ignoring tokens with spaces or underscores.
 * - Isolated weakness statistics partitions for standard vs 'qu=1' modes.
 * - Individual lesson deck preservation across Bigrams, Trigrams, Tetragrams, and Words.
 * - Deterministic profile import and data fusion (no duplicate profiles, no '(Restored)' prefix).
 * - Exact corpus frequency rank badge (#XX) on weakness records.
 * - Compact No Reset mode positioned between Corpus and Source.
 */

const LANGUAGE_ANCHORS = Object.freeze({
    eng: Object.freeze(['the', 'and', 'that', 'with', 'from', 'this', 'have', 'were', 'which', 'they', 'time', 'been', 'word', 'what', 'some', 'other', 'into', 'them']),
    fra: Object.freeze(['de', 'la', 'le', 'et', 'les', 'des', 'en', 'un', 'du', 'une', 'que', 'est', 'pour', 'qui', 'dans', 'par', 'sur', 'au', 'plus', 'pas']),
    spa: Object.freeze(['de', 'la', 'que', 'el', 'en', 'los', 'del', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero']),
    deu: Object.freeze(['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als']),
    ita: Object.freeze(['di', 'che', 'il', 'la', 'in', 'per', 'un', 'del', 'non', 'da', 'con', 'le', 'si', 'dei', 'della', 'una', 'sono', 'ed', 'nel', 'al']),
    por: Object.freeze(['de', 'que', 'não', 'do', 'da', 'um', 'uma', 'para', 'com', 'no', 'se', 'na', 'por', 'mais', 'em', 'os', 'as', 'como', 'mas', 'ao']),
    pol: Object.freeze(['nie', 'się', 'to', 'do', 'na', 'że', 'co', 'jak', 'tak', 'ale', 'od', 'po', 'za', 'ze', 'jej', 'jego', 'dla', 'mnie', 'ci', 'tym']),
    rus: Object.freeze(['не', 'что', 'он', 'на', 'со', 'как', 'то', 'все', 'она', 'так', 'его', 'но', 'да', 'ты', 'же', 'бы', 'по', 'за', 'из', 'от'])
});

const CAPS_REGEX = /[\p{Lu}\p{Lt}]/u;
const PUNCT_REGEX = /\p{P}/u;

// Terminal clause punctuation only. Apostrophes (') and hyphens (-) are excluded intentionally.
const TERMINAL_CLAUSE_PUNCT = /^[,.:;?!]$/u;
const TERMINAL_CLAUSE_REGEX = /[,.:;?!]+$/u;

const MAX_SCOPE = 500;              // Highest "Top N" scope in the UI (50, 100, 200, 500)
const NGRAM_POOL_SIZE = 500;        // Pool size loaded from certified n-gram files
const CHUNK_SIZE = 5;               // Granular 5-occurrence checkpoints for evolution
const MIN_CONFIRMED_SAMPLES = 5;    // Minimum samples required to confirm a weakness
const MIN_ERROR_SORT_SAMPLES = 20;  // Threshold to avoid fluke 100% error rankings
const MAX_HISTORY_BLOCKS = 350;     // Maximum stored checkpoints per n-gram (~1,750 occurrences)
const MAX_CHART_POINTS = 40;        // Visual limit to preserve SVG clarity
const MAX_PHRASE_PARAM = 1000;      // Hard boundary for combinations/repetitions
const MAX_CHARS_PER_KEY_EVENT = 5;  // Protection guard against pasted input chunks

const safeStorage = {
    get(key, fallback = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : fallback;
        } catch {
            return fallback;
        }
    },
    set(key, val) {
        try {
            localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
            return true;
        } catch (e) {
            console.warn(`[Storage] Failed to save "${key}":`, e);
            return false;
        }
    },
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch {}
    },
    getString(key, fallback = null) {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : value;
        } catch {
            return fallback;
        }
    },
    setString(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch {
            return false;
        }
    },
    keysWithPrefix(prefix) {
        const keys = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) keys.push(key);
            }
        } catch {}
        return keys;
    }
};

// =============================================================================
// ATOMIC DIGRAPH & UNIT TOKENIZATION HELPERS ("qu=1" Support)
// =============================================================================

function tokenizeAtomicUnits(text, quAsOne = false) {
    if (!text) return [];
    if (!quAsOne) return Array.from(text);

    if (!text.includes('q') && !text.includes('Q')) {
        return Array.from(text);
    }

    const units = [];
    let i = 0;
    const len = text.length;
    while (i < len) {
        if (i + 1 < len && (text[i] === 'q' || text[i] === 'Q') && (text[i + 1] === 'u' || text[i + 1] === 'U')) {
            units.push(text.substring(i, i + 2));
            i += 2;
        } else {
            units.push(text[i]);
            i++;
        }
    }
    return units;
}

function countAtomicUnits(text, quAsOne = false) {
    if (!text) return 0;
    if (!quAsOne) return text.length;

    if (!text.includes('q') && !text.includes('Q')) {
        return text.length;
    }

    let count = 0;
    let i = 0;
    const len = text.length;
    while (i < len) {
        if (i + 1 < len && (text[i] === 'q' || text[i] === 'Q') && (text[i + 1] === 'u' || text[i + 1] === 'U')) {
            count++;
            i += 2;
        } else {
            count++;
            i++;
        }
    }
    return count;
}

function sanitizePositiveInt(value) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, MAX_PHRASE_PARAM);
}

function cleanProfileName(rawName) {
    if (!rawName) return 'Main User';
    return String(rawName).replace(/\s*\(\s*Restored\s*\)/gi, '').trim() || 'Main User';
}

function parseTokenLine(rawLine, expectedUnits = null, quAsOne = false) {
    if (!rawLine) return null;
    const tabIdx = rawLine.indexOf('\t');
    let token = tabIdx === -1 ? rawLine : rawLine.substring(0, tabIdx);
    token = token.replace(/[\r\n]/g, '').trim();

    // Strict discard for empty tokens, any whitespace, or underscores
    if (!token || /\s/.test(token) || token.includes('_')) return null;

    if (expectedUnits !== null) {
        const units = countAtomicUnits(token, quAsOne);
        if (units !== expectedUnits) return null;
    }
    return token;
}

function buildNgramPyramid(raw2, raw3, raw4, quAsOne = false) {
    const tetragramsSet = new Set(raw4.slice(0, NGRAM_POOL_SIZE));
    const trigramsSet = new Set(raw3.slice(0, NGRAM_POOL_SIZE));

    tetragramsSet.forEach(qg => {
        const units = tokenizeAtomicUnits(qg, quAsOne);
        if (units.length === 4) {
            trigramsSet.add(units.slice(0, 3).join(''));
            trigramsSet.add(units.slice(1, 4).join(''));
        }
    });

    const bigramsSet = new Set(raw2.slice(0, NGRAM_POOL_SIZE));
    trigramsSet.forEach(tg => {
        const units = tokenizeAtomicUnits(tg, quAsOne);
        if (units.length === 3) {
            bigramsSet.add(units.slice(0, 2).join(''));
            bigramsSet.add(units.slice(1, 3).join(''));
        }
    });

    tetragramsSet.forEach(qg => {
        const units = tokenizeAtomicUnits(qg, quAsOne);
        if (units.length === 4) {
            bigramsSet.add(units.slice(0, 2).join(''));
            bigramsSet.add(units.slice(1, 3).join(''));
            bigramsSet.add(units.slice(2, 4).join(''));
        }
    });

    return {
        bigrams: Object.freeze(Array.from(bigramsSet)),
        trigrams: Object.freeze(Array.from(trigramsSet)),
        tetragrams: Object.freeze(Array.from(tetragramsSet)),
        bigramsSet,
        trigramsSet,
        tetragramsSet
    };
}

function emptyWeakStats() {
    return { meta: { completedTests: 0, totalKeystrokes: 0, lastRun: null }, ngrams: {} };
}

function unpackNgramEntry(ngram, obj, quAsOne = false) {
    if (!obj || typeof obj !== 'object') return null;
    const len = Number.isInteger(obj.len) ? obj.len : countAtomicUnits(ngram, quAsOne);
    let samples = [];
    const history = [];

    // 1. Unpack history
    if (Array.isArray(obj.history)) {
        for (const h of obj.history) {
            if (h && Number.isFinite(h.avgTime)) {
                history.push({
                    count: Number(h.count) || CHUNK_SIZE,
                    avgTime: Math.round(h.avgTime),
                    errorCount: Number(h.errorCount) || 0,
                    timestamp: Number(h.timestamp) || Date.now()
                });
            }
        }
    } else if (Array.isArray(obj.h)) {
        for (const item of obj.h) {
            if (Array.isArray(item) && Number.isFinite(item[0])) {
                history.push({
                    count: Number(item[3]) || CHUNK_SIZE,
                    avgTime: Math.round(item[0]),
                    errorCount: Number(item[1]) || 0,
                    timestamp: Number(item[2]) || Date.now()
                });
            }
        }
    }

    // 2. Unpack recent samples
    if (Array.isArray(obj.samples)) {
        for (const s of obj.samples) {
            if (s && Number.isFinite(s.time) && s.time >= 0) {
                samples.push({ time: s.time, hadError: !!s.hadError });
            }
        }
    } else if (Array.isArray(obj.t)) {
        const flags = typeof obj.e === 'string' ? obj.e : '';
        for (let i = 0; i < obj.t.length; i++) {
            const time = obj.t[i];
            if (Number.isFinite(time) && time >= 0) {
                samples.push({ time, hadError: flags.charAt(i) === '1' });
            }
        }
    }

    // 3. Checkpoint into chunks if needed
    if (samples.length >= CHUNK_SIZE) {
        while (samples.length >= CHUNK_SIZE) {
            const chunk = samples.splice(0, CHUNK_SIZE);
            let sumT = 0;
            let errs = 0;
            for (let k = 0; k < CHUNK_SIZE; k++) {
                sumT += chunk[k].time;
                if (chunk[k].hadError) errs++;
            }
            history.push({
                count: CHUNK_SIZE,
                avgTime: Math.round(sumT / CHUNK_SIZE),
                errorCount: errs,
                timestamp: Date.now()
            });
        }
    }

    if (!samples.length && !history.length) return null;
    if (len < 2 || len > 4) return null;

    return { len, samples, history };
}

function normalizeWeakStats(parsed, quAsOne = false) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const hasEnvelope = !!(parsed.meta && parsed.ngrams && typeof parsed.ngrams === 'object');
    const rawNgrams = hasEnvelope ? parsed.ngrams : parsed;
    const stats = emptyWeakStats();

    if (hasEnvelope && typeof parsed.meta === 'object') {
        stats.meta.completedTests = Number(parsed.meta.completedTests) || 0;
        stats.meta.totalKeystrokes = Number(parsed.meta.totalKeystrokes) || 0;
        stats.meta.lastRun = typeof parsed.meta.lastRun === 'string' ? parsed.meta.lastRun : null;
    }

    for (const [ngram, entry] of Object.entries(rawNgrams)) {
        if (ngram === '__proto__') continue;
        const unpacked = unpackNgramEntry(ngram, entry, quAsOne);
        if (unpacked) stats.ngrams[ngram] = unpacked;
    }
    return stats;
}

function serializeWeakStats(stats) {
    const ngrams = {};
    for (const [ngram, entry] of Object.entries(stats.ngrams || {})) {
        const samples = entry && entry.samples;
        const history = entry && entry.history;
        const hasSamples = Array.isArray(samples) && samples.length > 0;
        const hasHistory = Array.isArray(history) && history.length > 0;
        if (!hasSamples && !hasHistory) continue;

        const times = hasSamples ? new Array(samples.length) : [];
        let flags = '';
        if (hasSamples) {
            for (let i = 0; i < samples.length; i++) {
                times[i] = Math.round(samples[i].time);
                flags += samples[i].hadError ? '1' : '0';
            }
        }

        const h = [];
        if (hasHistory) {
            for (let j = 0; j < history.length; j++) {
                h.push([history[j].avgTime, history[j].errorCount, history[j].timestamp, history[j].count]);
            }
        }

        ngrams[ngram] = { len: entry.len, t: times, e: flags, h };
    }
    return { fmt: 4, meta: stats.meta, ngrams };
}

// =============================================================================
// VUE APPLICATION CONFIGURATION
// =============================================================================

const ngramTypeConfig = {
    el: '#app',

    data() {
        return {
            VERSION: 6.2,

            showThemeMenu: false,
            showAudioMenu: false,
            newProfileInput: '',
            customWordsInput: '',

            profiles: [],
            currentProfileId: 'default',

            themes: [
                { id: 'dracula',         label: 'Dracula',         color: '#ff79c6', isLight: false },
                { id: 'emerald',         label: 'Emerald',         color: '#34d399', isLight: false },
                { id: 'carbon',          label: 'Carbon',          color: '#facc15', isLight: false },
                { id: 'nord',            label: 'Nord',            color: '#88c0d0', isLight: false },
                { id: 'paper',           label: 'Paper',           color: '#c25e1a', isLight: false },
                { id: 'midnight',        label: 'Midnight',        color: '#cba6f7', isLight: false },
                { id: 'gruvbox',         label: 'Gruvbox',         color: '#fabd2f', isLight: false },
                { id: 'tokyo-night',     label: 'Tokyo Night',     color: '#7aa2f7', isLight: false },
                { id: 'solarized',       label: 'Solarized',       color: '#2aa198', isLight: false },
                { id: 'crimson',         label: 'Crimson',         color: '#fb7185', isLight: false },
                { id: 'latte',           label: 'Latte',           color: '#1e66f5', isLight: true },
                { id: 'solarized-light', label: 'Solarized Light', color: '#268bd2', isLight: true },
                { id: 'nord-light',      label: 'Nord Light',      color: '#5e81ac', isLight: true },
                { id: 'sakura',          label: 'Sakura Light',    color: '#d43f6a', isLight: true },
                { id: 'clean-white',     label: 'Clean White',     color: '#2563eb', isLight: true }
            ],

            availableCorpora: [
                { id: 'Ngram_English',    label: 'English',    lang: 'eng' },
                { id: 'Ngram_French',     label: 'French',     lang: 'fra' },
                { id: 'Ngram_German',     label: 'German',     lang: 'deu' },
                { id: 'Ngram_Italian',    label: 'Italian',    lang: 'ita' },
                { id: 'Ngram_Polish',     label: 'Polish',     lang: 'pol' },
                { id: 'Ngram_Portuguese', label: 'Portuguese', lang: 'por' },
                { id: 'Ngram_Russian',    label: 'Russian',    lang: 'rus' },
                { id: 'Ngram_Spanish',    label: 'Spanish',    lang: 'spa' }
            ],

            bigrams: [],
            trigrams: [],
            tetragrams: [],
            words: [],
            custom_words: [],

            weakStatsData: emptyWeakStats(),
            currentTestStaging: {},

            weakBigrams: [],
            weakTrigrams: [],
            weakTetragrams: [],
            activeWeakTab: 'bigrams',
            weaknessSortBy: 'priority',

            // Drill configuration modal state
            drillNgramType: 'bigrams',
            drillScope: 25,
            drillMode: 'classic',
            drillFilterCaps: true,
            drillFilterPunct: true,
            drillConfig: {
                combination: 2,
                repetition: 3,
                minimumWPM: 40,
                minimumAccuracy: 100
            },

            // Per-ngram evolution modal state
            selectedNgramData: null,
            evolutionViewMode: 'recent',
            hoveredPointIdx: null,

            currentWordIdx: 0,
            currentWordStartTime: 0,
            currentWordErrors: 0,
            phraseWordRanges: [],
            lastInputLength: 0,
            lastInputValue: '',

            data: {
                sidebarOpen: true,
                source: 'bigrams',
                theme: 'dracula',
                selectedCorpus: 'Ngram_English',
                includePunctuation: true,
                includeUppercase: true,
                quAsOneChar: false,
                noResetMode: false,

                soundCorrectLetterEnabled: true,
                soundIncorrectLetterEnabled: true,
                soundPassedThresholdEnabled: true,
                soundFailedThresholdEnabled: true,

                bigrams: {
                    scope: 50,
                    combination: 2,
                    repetition: 3,
                    minimumWPM: 40,
                    minimumAccuracy: 100,
                    WPMs: [],
                    phrases: [],
                    phrasesCurrentIndex: 0
                },
                trigrams: {
                    scope: 50,
                    combination: 2,
                    repetition: 3,
                    minimumWPM: 40,
                    minimumAccuracy: 100,
                    WPMs: [],
                    phrases: [],
                    phrasesCurrentIndex: 0
                },
                tetragrams: {
                    scope: 50,
                    combination: 2,
                    repetition: 3,
                    minimumWPM: 40,
                    minimumAccuracy: 100,
                    WPMs: [],
                    phrases: [],
                    phrasesCurrentIndex: 0
                },
                words: {
                    scope: 50,
                    combination: 2,
                    repetition: 3,
                    minimumWPM: 40,
                    minimumAccuracy: 100,
                    WPMs: [],
                    phrases: [],
                    phrasesCurrentIndex: 0
                },
                custom_words: {
                    scope: null,
                    combination: 2,
                    repetition: 3,
                    minimumWPM: 40,
                    minimumAccuracy: 100,
                    WPMs: [],
                    phrases: [],
                    phrasesCurrentIndex: 0
                }
            },

            expectedPhrase: '',
            typedPhrase: '',
            startTime: 0,
            hitsCorrect: 0,
            hitsWrong: 0,
            isInputCorrect: true,
            rawWPM: 0,
            accuracy: 0
        };
    },

    computed: {
        currentProfile() {
            return this.profiles.find(p => p.id === this.currentProfileId) || { id: 'default', name: 'Main User' };
        },
        currentThemeObj() {
            return this.themes.find(t => t.id === this.data.theme) || this.themes[0];
        },
        dataSource() {
            return this.data[this.data.source];
        },
        averageWPM() {
            const ds = this.dataSource;
            if (!ds?.WPMs.length) return 0;
            const sum = ds.WPMs.reduce((a, b) => a + b, 0);
            return Math.round(sum / ds.WPMs.length);
        },
        effectiveBaselineWpm() {
            const avg = this.averageWPM;
            if (avg && avg >= 20) return avg;
            const targetMin = this.dataSource?.minimumWPM;
            if (targetMin && targetMin >= 20) return targetMin;
            return 45;
        },
        activeNgramLength() {
            if (this.activeWeakTab === 'bigrams') return 2;
            if (this.activeWeakTab === 'trigrams') return 3;
            return 4;
        },
        activeNgramLengthLabel() {
            if (this.activeWeakTab === 'bigrams') return 'bi';
            if (this.activeWeakTab === 'trigrams') return 'tri';
            return 'tetra';
        },
        currentBaselineLatency() {
            return Math.round((12000 * this.activeNgramLength) / this.effectiveBaselineWpm);
        },
        categoryFolder() {
            const prefix = this.data.quAsOneChar ? 'Qu_As_1_Character_Normal_' : 'Normal_';
            const casePart = this.data.includeUppercase ? 'All_Cases_Alphanumeric' : 'Lowercase_Alphanumeric';
            const punctPart = this.data.includePunctuation ? '_Punctuation' : '';
            return `${prefix}${casePart}${punctPart}`;
        },
        currentCorpusMeta() {
            return this.availableCorpora.find(c => c.id === this.data.selectedCorpus) || { id: this.data.selectedCorpus, label: 'Unknown', lang: 'eng' };
        },
        readableCorpusName() {
            return this.currentCorpusMeta.label;
        },
        currentLangCode() {
            return this.currentCorpusMeta.lang;
        },
        completedTestsCount() {
            return this.weakStatsData.meta?.completedTests ?? 0;
        },
        confidenceStatus() {
            const c = this.completedTestsCount;
            if (c === 0) return { label: 'No Data', class: 'badge-secondary', text: 'Finish at least 1 test.' };
            if (c < 3) return { label: 'Calibrating', class: 'badge-warning', text: `Need ${3 - c} more test(s).` };
            if (c < 8) return { label: 'Moderate', class: 'badge-info', text: 'Patterns over recent tests.' };
            return { label: 'High Precision', class: 'badge-success', text: 'High statistical confidence.' };
        },
        activeWeakList() {
            let list = [];
            if (this.activeWeakTab === 'bigrams') list = this.weakBigrams;
            else if (this.activeWeakTab === 'trigrams') list = this.weakTrigrams;
            else list = this.weakTetragrams;

            return this.sortWeaknessList(list, this.weaknessSortBy);
        },
        activeListAvailableCount() {
            return this.activeWeakList?.length ?? 0;
        },
        drillPoolCount() {
            let list = [];
            if (this.drillNgramType === 'bigrams') list = this.weakBigrams;
            else if (this.drillNgramType === 'trigrams') list = this.weakTrigrams;
            else list = this.weakTetragrams;

            const filtered = list.filter(item => {
                if (!this.drillFilterCaps && CAPS_REGEX.test(item.ngram)) return false;
                if (!this.drillFilterPunct && PUNCT_REGEX.test(item.ngram)) return false;
                return true;
            });

            return filtered.length;
        },
        drillModeDescription() {
            if (this.drillMode === 'classic') return 'Direct repetition drill of your priority n-grams.';
            if (this.drillMode === 'sandwich') return `Wraps each n-gram with high-frequency ${this.readableCorpusName} anchor words.`;
            return 'Lexical ladder expanding each n-gram into real words of increasing length.';
        },
        hoveredPoint() {
            if (this.hoveredPointIdx === null || !this.selectedNgramData?.chart?.points) return null;
            return this.selectedNgramData.chart.points[this.hoveredPointIdx] || null;
        }
    },

    watch: {
        'data.theme'(newTheme) {
            this.applyTheme(newTheme);
            this.save();
        },
        'data.noResetMode'() { this.save(); },
        'data.soundCorrectLetterEnabled'() { this.save(); },
        'data.soundIncorrectLetterEnabled'() { this.save(); },
        'data.soundPassedThresholdEnabled'() { this.save(); },
        'data.soundFailedThresholdEnabled'() { this.save(); },
        custom_words() {
            if (!this._suppressSourceWatcher) {
                this.refreshPhrasesAndCurrentMetrics();
            }
        }
    },

    created() {
        this._allowedBigramsSet = new Set();
        this._allowedTrigramsSet = new Set();
        this._allowedTetragramsSet = new Set();
        this._ngramRanks = new Map();
        this._loadSeq = 0;
        this._latestLoad = Promise.resolve();
        this._poolCache = new Map();
        this._fullWordList = { path: null, pending: null };
        this._drillStarting = false;
        this._storageWarningShown = false;
        this._suppressSourceWatcher = false;
        this.custom_words = safeStorage.get('ngram_custom_words_backup', []);
    },

    async mounted() {
        this.initProfiles();

        const savedData = safeStorage.get('ngramTypeAppdata');
        if (savedData && savedData.version >= this.VERSION) {
            this.load(savedData);
        } else {
            this.updateDataVersion();
        }

        if (!safeStorage.getString('ngramForkDisclaimerSeen')) {
            $('#fork-disclaimer-modal').modal('show');
        }

        this.applyTheme(this.data.theme || 'dracula');

        // Initial corpus load while preserving saved lesson deck if present
        await this.reloadNgramData({ preserveExistingDeck: true });
        this.loadLanguageWeakStats();

        this.$inputEl = $('#input-typing');
        this.$timerEl = $('.timer');

        if (this.$timerEl && $.fn.countimer) {
            this.$timerEl.countimer({ autoStart: false });
        }

        this._onKeydown = (e) => {
            if (e.code === 'Tab' || e.code === 'Escape') {
                e.preventDefault();
                if (this.data.noResetMode) {
                    return false;
                }
                this.resetCurrentPhraseMetrics();
            }
        };
        this.$inputEl.on('keydown', this._onKeydown);

        this.correctLetterSound = new Audio('./media/sounds/click.mp3');
        this.incorrectLetterSound = new Audio('./media/sounds/clack.mp3');
        this.incorrectPhraseSound = new Audio('./media/sounds/failed.mp3');
        this.correctPhraseSound = new Audio('./media/sounds/ding.wav');
        this.currentPlayingSound = null;
    },

    beforeDestroy() {
        if (this.$inputEl && this._onKeydown) {
            this.$inputEl.off('keydown', this._onKeydown);
        }
    },

    methods: {
        initProfiles() {
            const stored = safeStorage.get('ngram_user_profiles', []);
            this.profiles = Array.isArray(stored) && stored.length ? stored : [
                { id: 'usr_default', name: 'Main User', createdAt: Date.now() }
            ];

            if (!stored?.length) this.saveProfiles();

            const active = safeStorage.getString('ngram_active_profile_id');
            this.currentProfileId = this.profiles.some(p => p.id === active) ? active : this.profiles[0].id;
        },

        saveProfiles() {
            safeStorage.set('ngram_user_profiles', this.profiles);
            safeStorage.setString('ngram_active_profile_id', this.currentProfileId);
        },

        createProfile() {
            const clean = cleanProfileName(this.newProfileInput);
            if (!this.newProfileInput.trim()) return;

            const existing = this.profiles.find(p => cleanProfileName(p.name).toLowerCase() === clean.toLowerCase());
            if (existing) {
                this.switchProfile(existing.id);
                this.newProfileInput = '';
                return;
            }

            const newId = `usr_${Date.now()}`;
            this.profiles.push({ id: newId, name: clean, createdAt: Date.now() });
            this.newProfileInput = '';
            this.saveProfiles();
            this.switchProfile(newId);
        },

        switchProfile(id) {
            this.currentProfileId = id;
            safeStorage.setString('ngram_active_profile_id', id);
            this.currentTestStaging = {};
            this.loadLanguageWeakStats();
            this.resetCurrentPhraseMetrics();
        },

        deleteProfile(id) {
            if (this.profiles.length <= 1) {
                alert('You must maintain at least one active profile.');
                return;
            }
            const target = this.profiles.find(p => p.id === id);
            if (!confirm(`Delete profile '${target ? target.name : id}'?`)) return;

            this.removeProfileStats(id);

            this.profiles = this.profiles.filter(p => p.id !== id);
            if (this.currentProfileId === id) {
                this.currentProfileId = this.profiles[0].id;
                this.currentTestStaging = {};
                this.resetCurrentPhraseMetrics();
            }
            this.saveProfiles();
            this.loadLanguageWeakStats();
        },

        removeProfileStats(id) {
            const keys = safeStorage.keysWithPrefix(`ngramWeakStats_u_${id}_l_`);
            for (let i = 0; i < keys.length; i++) {
                safeStorage.remove(keys[i]);
            }
        },

        exportProfileData() {
            const backup = {
                version: this.VERSION,
                profile: this.currentProfile,
                timestamp: new Date().toISOString(),
                stats: {}
            };
            const prefix = `ngramWeakStats_u_${this.currentProfileId}_l_`;
            const keys = safeStorage.keysWithPrefix(prefix);
            for (let i = 0; i < keys.length; i++) {
                const stored = safeStorage.get(keys[i], null);
                if (stored) backup.stats[keys[i].slice(prefix.length)] = stored;
            }

            const cleanName = cleanProfileName(this.currentProfile.name);
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ngram-${cleanName.toLowerCase().replace(/\s+/g, '_')}-backup.json`;
            a.click();
            URL.revokeObjectURL(url);
        },

        importProfileData(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const parsed = JSON.parse(event.target.result);
                    if (!parsed || !parsed.profile) {
                        alert('Invalid backup format.');
                        return;
                    }

                    const cleanName = cleanProfileName(parsed.profile.name);
                    const existingProfile = this.profiles.find(p => cleanProfileName(p.name).toLowerCase() === cleanName.toLowerCase());

                    let targetId;
                    let isMerged = false;

                    if (existingProfile) {
                        targetId = existingProfile.id;
                        isMerged = true;
                    } else {
                        targetId = `usr_${Date.now()}`;
                        this.profiles.push({ id: targetId, name: cleanName, createdAt: Date.now() });
                    }

                    if (parsed.stats && typeof parsed.stats === 'object') {
                        for (const [langSuffix, langStats] of Object.entries(parsed.stats)) {
                            if (!/^[A-Za-z0-9_-]{1,24}$/.test(langSuffix)) continue;

                            const key = `ngramWeakStats_u_${targetId}_l_${langSuffix}`;
                            const isQuLang = langSuffix.endsWith('_qu');
                            const importedNormalized = normalizeWeakStats(langStats, isQuLang);
                            if (!importedNormalized) continue;

                            if (isMerged) {
                                const currentRaw = safeStorage.get(key, null);
                                const currentNormalized = normalizeWeakStats(currentRaw, isQuLang) || emptyWeakStats();
                                const fused = this.mergeNormalizedStats(currentNormalized, importedNormalized);
                                safeStorage.set(key, serializeWeakStats(fused));
                            } else {
                                safeStorage.set(key, serializeWeakStats(importedNormalized));
                            }
                        }
                    }

                    this.saveProfiles();
                    this.switchProfile(targetId);

                    if (isMerged) {
                        alert(`Profile '${existingProfile.name}' updated: existing and imported statistics fused.`);
                    } else {
                        alert(`Profile '${cleanName}' imported successfully.`);
                    }
                } catch (err) {
                    alert('Error importing backup: ' + err.message);
                } finally {
                    e.target.value = '';
                }
            };
            reader.onerror = () => {
                alert('Error importing backup: the file could not be read.');
                e.target.value = '';
            };
            reader.readAsText(file);
        },

        mergeNormalizedStats(target, source) {
            target.meta.completedTests = (target.meta.completedTests || 0) + (source.meta.completedTests || 0);
            target.meta.totalKeystrokes = (target.meta.totalKeystrokes || 0) + (source.meta.totalKeystrokes || 0);

            const tLast = target.meta.lastRun ? new Date(target.meta.lastRun).getTime() : 0;
            const sLast = source.meta.lastRun ? new Date(source.meta.lastRun).getTime() : 0;
            target.meta.lastRun = new Date(Math.max(tLast, sLast) || Date.now()).toISOString();

            for (const [ngram, srcItem] of Object.entries(source.ngrams || {})) {
                if (!target.ngrams[ngram]) {
                    target.ngrams[ngram] = srcItem;
                    continue;
                }
                const tgtItem = target.ngrams[ngram];
                tgtItem.history = (tgtItem.history || []).concat(srcItem.history || []);
                tgtItem.history.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

                tgtItem.samples = (tgtItem.samples || []).concat(srcItem.samples || []);
                while (tgtItem.samples.length >= CHUNK_SIZE) {
                    const chunk = tgtItem.samples.splice(0, CHUNK_SIZE);
                    let sumT = 0, errs = 0;
                    for (let k = 0; k < CHUNK_SIZE; k++) {
                        sumT += chunk[k].time;
                        if (chunk[k].hadError) errs++;
                    }
                    tgtItem.history.push({
                        count: CHUNK_SIZE,
                        avgTime: Math.round(sumT / CHUNK_SIZE),
                        errorCount: errs,
                        timestamp: Date.now()
                    });
                }
                if (tgtItem.history.length > MAX_HISTORY_BLOCKS) {
                    tgtItem.history = tgtItem.history.slice(-MAX_HISTORY_BLOCKS);
                }
            }
            return target;
        },

        getWeakStorageKey(userId, lang) {
            const quSuffix = this.data.quAsOneChar ? '_qu' : '';
            return `ngramWeakStats_u_${userId}_l_${lang}${quSuffix}`;
        },

        acknowledgeDisclaimer() {
            safeStorage.setString('ngramForkDisclaimerSeen', 'true');
            $('#fork-disclaimer-modal').modal('hide');
        },

        stepValue(field, delta, min, max) {
            const target = this.data[this.data.source];
            if (!target) return;
            let next = (target[field] || 0) + delta;
            if (min !== undefined && next < min) next = min;
            if (max !== undefined && next > max) next = max;
            target[field] = next;

            if (field === 'combination' || field === 'repetition') {
                this.refreshPhrases();
            } else {
                this.save();
            }
        },

        toggleThemeMenu() {
            this.showThemeMenu = !this.showThemeMenu;
            this.showAudioMenu = false;
        },
        toggleAudioMenu() {
            this.showAudioMenu = !this.showAudioMenu;
            this.showThemeMenu = false;
        },
        selectTheme(themeId) {
            this.data.theme = themeId;
            this.showThemeMenu = false;
        },
        closeDropdowns() {
            this.showThemeMenu = false;
            this.showAudioMenu = false;
        },
        applyTheme(themeId) {
            document.documentElement.setAttribute('data-theme', themeId);
        },

        getBasePath() {
            return `./data/${this.data.selectedCorpus}/${this.categoryFolder}/`;
        },

        async setSource(newSource) {
            if (this.data.source === newSource) return;
            this.data.source = newSource;
            this.currentTestStaging = {};

            const ds = this.data[newSource];
            const hasExistingDeck = ds && Array.isArray(ds.phrases) && ds.phrases.length > 0;

            if (newSource === 'custom_words') {
                if (!hasExistingDeck) this.refreshPhrases();
                else this.restoreCurrentDeck();
            } else {
                await this.reloadNgramData({ preserveExistingDeck: true });
                if (!hasExistingDeck) this.refreshPhrases();
                else this.restoreCurrentDeck();
            }

            this.resetCurrentPhraseMetrics();
            this.save();
        },

        setScope(sc) {
            const ds = this.dataSource;
            if (!ds) return;
            ds.scope = sc;
            this.refreshPhrasesAndCurrentMetrics();
        },

        async onCorpusSelectionChanged() {
            this.invalidateAllDecks();
            this.currentTestStaging = {};
            await this.reloadNgramData();
            this.loadLanguageWeakStats();
            this.resetCurrentPhraseMetrics();
        },

        async togglePunctuation() {
            this.data.includePunctuation = !this.data.includePunctuation;
            await this.onDatasetVariantChanged();
        },

        async toggleUppercase() {
            this.data.includeUppercase = !this.data.includeUppercase;
            await this.onDatasetVariantChanged();
        },

        async toggleQuMode() {
            this.data.quAsOneChar = !this.data.quAsOneChar;
            await this.onDatasetVariantChanged();
            this.loadLanguageWeakStats();
        },

        async onDatasetVariantChanged() {
            this.invalidateAllDecks();
            this.currentTestStaging = {};
            await this.reloadNgramData();
            this.resetCurrentPhraseMetrics();
            this.save();
        },

        invalidateAllDecks() {
            for (const src of ['bigrams', 'trigrams', 'tetragrams', 'words']) {
                if (this.data[src]) {
                    this.data[src].phrases = [];
                    this.data[src].phrasesCurrentIndex = 0;
                }
            }
        },

        restoreCurrentDeck() {
            const ds = this.dataSource;
            if (!ds || !ds.phrases || !ds.phrases.length) return;
            if (ds.phrasesCurrentIndex === undefined || ds.phrasesCurrentIndex >= ds.phrases.length) {
                ds.phrasesCurrentIndex = 0;
            }
            this.expectedPhrase = ds.phrases[ds.phrasesCurrentIndex] || '';
            if (this.expectedPhrase) {
                this.buildPhraseWordRanges(this.expectedPhrase);
            }
        },

        reloadNgramData(options = {}) {
            const seq = ++this._loadSeq;
            const run = this.applyNgramData(seq, options);
            this._latestLoad = run;
            return run;
        },

        async applyNgramData(seq, options = {}) {
            const pool = await this.loadNgramPool(this.getBasePath());
            if (seq !== this._loadSeq) return this._latestLoad;

            this.words = pool.words;
            this.bigrams = pool.bigrams;
            this.trigrams = pool.trigrams;
            this.tetragrams = pool.tetragrams;

            this._allowedBigramsSet = pool.bigramsSet;
            this._allowedTrigramsSet = pool.trigramsSet;
            this._allowedTetragramsSet = pool.tetragramsSet;
            this._ngramRanks = pool.ranks;

            this.currentTestStaging = {};
            this.resetCurrentPhraseMetrics();

            const ds = this.dataSource;
            if (!options.preserveExistingDeck || !ds?.phrases?.length) {
                this.refreshPhrases();
            } else {
                this.restoreCurrentDeck();
            }

            this.refreshWeakStats();
        },

        loadNgramPool(basePath) {
            let pending = this._poolCache.get(basePath);
            if (!pending) {
                const qu = this.data.quAsOneChar;
                pending = Promise.all([
                    this.fetchRawList(`${basePath}words.txt`, null, MAX_SCOPE, qu),
                    this.fetchRawList(`${basePath}2grams.txt`, 2, NGRAM_POOL_SIZE, qu),
                    this.fetchRawList(`${basePath}3grams.txt`, 3, NGRAM_POOL_SIZE, qu),
                    this.fetchRawList(`${basePath}4grams.txt`, 4, NGRAM_POOL_SIZE, qu)
                ]).then(([words, raw2, raw3, raw4]) => {
                    if (!words.length || !raw2.length || !raw3.length || !raw4.length) {
                        this._poolCache.delete(basePath);
                    }
                    const pyramid = buildNgramPyramid(raw2, raw3, raw4, qu);
                    const ranks = new Map();

                    raw2.forEach((ng, idx) => ranks.set(ng, idx + 1));
                    raw3.forEach((ng, idx) => ranks.set(ng, idx + 1));
                    raw4.forEach((ng, idx) => ranks.set(ng, idx + 1));

                    return Object.assign({ words: Object.freeze(words), ranks }, pyramid);
                });
                this._poolCache.set(basePath, pending);
            }
            return pending;
        },

        getNgramRank(ngram, len) {
            if (this._ngramRanks && this._ngramRanks.has(ngram)) {
                return this._ngramRanks.get(ngram);
            }
            return MAX_SCOPE + 1;
        },

        loadFullWordList(basePath) {
            if (this._fullWordList.path !== basePath) {
                const pending = this.fetchRawList(`${basePath}words.txt`, null, Infinity, this.data.quAsOneChar);
                this._fullWordList = { path: basePath, pending };
                pending.then(list => {
                    if (!list.length && this._fullWordList.pending === pending) {
                        this._fullWordList = { path: null, pending: null };
                    }
                });
            }
            return this._fullWordList.pending;
        },

        async fetchRawList(filePath, expectedUnits = null, limit = Infinity, quAsOne = false) {
            try {
                const response = await fetch(filePath);
                if (!response.ok) return [];

                const list = [];
                const addLine = (rawLine) => {
                    const token = parseTokenLine(rawLine, expectedUnits, quAsOne);
                    if (token !== null) list.push(token);
                    return list.length >= limit;
                };

                if (!response.body || typeof response.body.getReader !== 'function') {
                    const lines = (await response.text()).split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (addLine(lines[i])) break;
                    }
                    return list;
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let pending = '';
                let streamEnded = false;
                let full = false;

                try {
                    while (!full && !streamEnded) {
                        const chunk = await reader.read();
                        streamEnded = chunk.done;
                        pending += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });

                        let start = 0;
                        let newline;
                        while (!full && (newline = pending.indexOf('\n', start)) !== -1) {
                            full = addLine(pending.substring(start, newline));
                            start = newline + 1;
                        }
                        pending = pending.substring(start);

                        if (streamEnded && !full && pending) addLine(pending);
                    }
                } finally {
                    if (!streamEnded) reader.cancel().catch(() => {});
                }
                return list;
            } catch (err) {
                console.error(`Failed to load ${filePath}:`, err);
                return [];
            }
        },

        isAllowedPyramidNgram(ngram, len) {
            if (len === 2) return this._allowedBigramsSet.has(ngram);
            if (len === 3) return this._allowedTrigramsSet.has(ngram);
            if (len === 4) return this._allowedTetragramsSet.has(ngram);
            return false;
        },

        save() {
            try {
                // Phrases and current indices are preserved for each source
                safeStorage.set('ngramTypeAppdata', this.data);
            } catch (e) {
                console.warn('[Storage] Failed to save appdata:', e);
            }
        },

        load(savedData) {
            const saved = savedData || safeStorage.get('ngramTypeAppdata');
            if (saved) {
                $.extend(true, this.data, saved);
            }
        },

        updateDataVersion() {
            this.data.version = this.VERSION;
            this.save();
        },

        shuffle(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = (Math.random() * (i + 1)) | 0;
                const temp = array[i];
                array[i] = array[j];
                array[j] = temp;
            }
        },

        playSound(audioObj) {
            if (!audioObj) return;
            if (this.currentPlayingSound && this.currentPlayingSound !== this.correctPhraseSound && this.currentPlayingSound !== this.incorrectPhraseSound) {
                this.currentPlayingSound.currentTime = 0;
            }
            audioObj.currentTime = 0;
            audioObj.play().catch(() => {});
            this.currentPlayingSound = audioObj;
        },

        buildPhraseWordRanges(phrase) {
            const ranges = [];
            const words = phrase.split(' ');
            let cursor = 0;

            for (let i = 0; i < words.length; i++) {
                const w = words[i];
                const start = cursor;
                const end = cursor + w.length;
                const isLast = (i === words.length - 1);
                const boundary = isLast ? end : end + 1;

                ranges.push({
                    word: w,
                    start,
                    end,
                    boundary,
                    isLast
                });

                cursor = end + 1;
            }
            this.phraseWordRanges = ranges;
            this.currentWordIdx = 0;
        },

        refreshPhrases() {
            const ds = this.dataSource;
            if (!ds) return;
            ds.combination = sanitizePositiveInt(ds.combination);
            ds.repetition = sanitizePositiveInt(ds.repetition);

            if (this.data.source === 'custom_words' && (!this.custom_words || !this.custom_words.length)) {
                if (ds.phrases && ds.phrases.length) {
                    ds.phrasesCurrentIndex = 0;
                    this.expectedPhrase = ds.phrases[0] || '';
                    if (this.expectedPhrase) {
                        this.buildPhraseWordRanges(this.expectedPhrase);
                    }
                    this.save();
                    return;
                }
            }

            ds.phrases = this.generatePhrases(ds.combination, ds.repetition);
            this.expectedPhrase = ds.phrases?.[0] ?? '';
            ds.phrasesCurrentIndex = 0;
            if (this.expectedPhrase) {
                this.buildPhraseWordRanges(this.expectedPhrase);
            }
            this.save();
        },

        refreshPhrasesAndCurrentMetrics() {
            this.refreshPhrases();
            this.resetCurrentPhraseMetrics();
            this.pauseTimer();
        },

        generatePhrases(numberOfItemsToCombine, repetitions) {
            const dataSource = this.data.source;
            let source = this[dataSource];
            if (!source || !source.length) return [];

            const scope = this.data[dataSource].scope;
            if (scope) source = source.slice(0, scope);

            const ngrams = source.slice();
            this.shuffle(ngrams);
            const phrases = [];

            while (ngrams.length) {
                const ngramsSublist = ngrams.splice(0, numberOfItemsToCombine);
                const subPhrase = ngramsSublist.join(' ');
                const phraseParts = new Array(repetitions).fill(subPhrase);
                phrases.push(phraseParts.join(' '));
            }
            return phrases;
        },

        pauseTimer() {
            if (this.$timerEl && !this.$timerEl.countimer('stopped')) {
                this.$timerEl.countimer('stop');
            }
        },

        resumeTimer() {
            if (this.$timerEl && this.$timerEl.countimer('stopped')) {
                this.$timerEl.countimer('resume');
            }
        },

        keyHandler() {
            const typed = this.typedPhrase;
            const typedLen = typed.length;
            const expected = this.expectedPhrase;
            const now = performance.now();

            if (!typedLen) {
                this.resetCurrentPhraseMetrics();
                return;
            }

            if (!this.startTime) {
                this.startTime = now;
                this.currentWordStartTime = now;
            }

            const isPrefixValid = expected.startsWith(typed);
            this.isInputCorrect = isPrefixValid;

            if (typedLen < this.lastInputLength) {
                this.currentWordErrors++;
                this.lastInputLength = typedLen;
                this.lastInputValue = typed;
                return;
            }

            if (typed === this.lastInputValue) return;
            const addedChars = Math.min(MAX_CHARS_PER_KEY_EVENT, Math.max(1, typedLen - this.lastInputLength));
            this.lastInputLength = typedLen;
            this.lastInputValue = typed;

            this.resumeTimer();

            if (!isPrefixValid) {
                this.currentWordErrors++;
                this.hitsWrong += addedChars;
                if (this.data.soundIncorrectLetterEnabled) {
                    this.playSound(this.incorrectLetterSound);
                }
                return;
            }

            this.hitsCorrect += addedChars;
            if (this.data.soundCorrectLetterEnabled) {
                this.playSound(this.correctLetterSound);
            }

            // Deterministic catch-up loop
            const ranges = this.phraseWordRanges;
            while (this.currentWordIdx < ranges.length && typedLen >= ranges[this.currentWordIdx].boundary) {
                const targetRange = ranges[this.currentWordIdx];
                const duration = Math.round(now - this.currentWordStartTime);
                const hadError = (this.currentWordErrors > 0);

                this.recordDeterministicWord(targetRange.word, duration, hadError);

                this.currentWordIdx++;
                this.currentWordStartTime = now;
                this.currentWordErrors = 0;
            }

            if (typed === expected) {
                const elapsedSec = Math.max(0.2, (now - this.startTime) / 1000);
                const totalHits = this.hitsCorrect + this.hitsWrong;
                this.rawWPM = Math.round(((totalHits / 5) / elapsedSec) * 60);
                const exactAccuracy = (this.hitsCorrect / (totalHits || 1)) * 100;
                this.accuracy = this.hitsWrong === 0 ? 100 : Math.min(99, Math.max(0, Math.round(exactAccuracy)));

                const dataSource = this.dataSource;
                const passedThreshold = (this.rawWPM >= dataSource.minimumWPM && this.accuracy >= dataSource.minimumAccuracy);

                if (!passedThreshold) {
                    if (this.data.soundFailedThresholdEnabled) {
                        this.playSound(this.incorrectPhraseSound);
                    }
                    this.resetCurrentPhraseMetrics();
                    this.pauseTimer();
                    return;
                }

                if (dataSource.phrasesCurrentIndex === 0) {
                    dataSource.WPMs = [];
                }
                dataSource.WPMs.push(this.rawWPM);

                if (this.data.soundPassedThresholdEnabled) {
                    this.playSound(this.correctPhraseSound);
                }
                this.pauseTimer();
                this.nextPhrase();
            }
        },

        recordDeterministicWord(word, duration, hadError) {
            const quAsOne = !!this.data.quAsOneChar;
            const units = tokenizeAtomicUnits(word, quAsOne);
            const unitLen = units.length;
            const boundedDuration = Math.max(100, Math.min(4500, duration));

            if (unitLen >= 2 && unitLen <= 4) {
                this.stageNgramSample(word, unitLen, boundedDuration, hadError);
            }

            if (unitLen === 4) {
                const subTriTime = Math.round(boundedDuration * 0.75);
                this.stageNgramSample(units.slice(0, 3).join(''), 3, subTriTime, hadError);
                this.stageNgramSample(units.slice(1, 4).join(''), 3, subTriTime, hadError);

                const subBiTime = Math.round(boundedDuration * 0.5);
                this.stageNgramSample(units.slice(0, 2).join(''), 2, subBiTime, hadError);
                this.stageNgramSample(units.slice(1, 3).join(''), 2, subBiTime, hadError);
                this.stageNgramSample(units.slice(2, 4).join(''), 2, subBiTime, hadError);
            } else if (unitLen === 3) {
                const subBiTime = Math.round(boundedDuration * 0.65);
                this.stageNgramSample(units.slice(0, 2).join(''), 2, subBiTime, hadError);
                this.stageNgramSample(units.slice(1, 3).join(''), 2, subBiTime, hadError);
            }
        },

        stageNgramSample(ngram, len, duration, hadError) {
            if (!this.isAllowedPyramidNgram(ngram, len)) return;

            let staged = this.currentTestStaging[ngram];
            if (!staged) {
                staged = this.currentTestStaging[ngram] = { samples: [], len };
            }
            staged.samples.push({ time: duration, hadError });
        },

        resetCurrentPhraseMetrics() {
            this.hitsCorrect = 0;
            this.hitsWrong = 0;
            this.typedPhrase = '';
            this.lastInputLength = 0;
            this.lastInputValue = '';
            this.startTime = 0;
            this.isInputCorrect = true;
            this.currentWordIdx = 0;
            this.currentWordStartTime = 0;
            this.currentWordErrors = 0;
        },

        nextPhrase() {
            this.resetCurrentPhraseMetrics();
            const ds = this.dataSource;
            const isTestFinished = (ds.phrasesCurrentIndex + 1 >= ds.phrases.length);

            if (!isTestFinished) {
                ds.phrasesCurrentIndex += 1;
                this.expectedPhrase = ds.phrases[ds.phrasesCurrentIndex];
                if (this.expectedPhrase) {
                    this.buildPhraseWordRanges(this.expectedPhrase);
                }
                this.save();
            } else {
                this.commitTestStatsToPermanent();
                this.refreshWeakStats();
                $('#weakness-modal').modal('show');
                this.refreshPhrases();
            }
        },

        loadLanguageWeakStats() {
            const key = this.getWeakStorageKey(this.currentProfileId, this.currentLangCode);
            this.weakStatsData = normalizeWeakStats(safeStorage.get(key, null), this.data.quAsOneChar) || emptyWeakStats();
            this.refreshWeakStats();
        },

        saveLanguageWeakStats() {
            const key = this.getWeakStorageKey(this.currentProfileId, this.currentLangCode);
            const saved = safeStorage.set(key, serializeWeakStats(this.weakStatsData));
            if (!saved && !this._storageWarningShown) {
                this._storageWarningShown = true;
                alert('Browser storage is full or unavailable: your latest weakness statistics could not be saved. Export a backup from the profile menu.');
            }
        },

        commitTestStatsToPermanent() {
            const ngrams = this.weakStatsData.ngrams;

            for (const [ngram, staged] of Object.entries(this.currentTestStaging)) {
                let target = ngrams[ngram];
                if (!target) {
                    this.$set(ngrams, ngram, { len: staged.len, samples: [], history: [] });
                    target = ngrams[ngram];
                }
                if (!Array.isArray(target.history)) this.$set(target, 'history', []);
                if (!Array.isArray(target.samples)) this.$set(target, 'samples', []);

                target.samples.push(...staged.samples);

                while (target.samples.length >= CHUNK_SIZE) {
                    const chunk = target.samples.splice(0, CHUNK_SIZE);
                    let sumTime = 0;
                    let errorCount = 0;
                    for (let i = 0; i < CHUNK_SIZE; i++) {
                        sumTime += chunk[i].time;
                        if (chunk[i].hadError) errorCount++;
                    }
                    target.history.push({
                        count: CHUNK_SIZE,
                        avgTime: Math.round(sumTime / CHUNK_SIZE),
                        errorCount,
                        timestamp: Date.now()
                    });
                }

                if (target.history.length > MAX_HISTORY_BLOCKS) {
                    target.history = target.history.slice(-MAX_HISTORY_BLOCKS);
                }
            }

            this.weakStatsData.meta.completedTests = (this.weakStatsData.meta.completedTests || 0) + 1;
            this.weakStatsData.meta.lastRun = new Date().toISOString();

            this.currentTestStaging = {};
            this.saveLanguageWeakStats();
        },

        getRankedNgramList(len) {
            const list = [];
            const ngrams = this.weakStatsData.ngrams;
            if (!ngrams) return list;

            const baselineWpm = this.effectiveBaselineWpm;
            const baselineLatency = Math.max(80, (12000 * len) / baselineWpm);

            for (const [ngram, item] of Object.entries(ngrams)) {
                if (item.len !== len || !this.isAllowedPyramidNgram(ngram, len)) continue;

                const samples = item.samples || [];
                const history = item.history || [];
                const historySamplesCount = history.reduce((acc, h) => acc + (h.count || CHUNK_SIZE), 0);
                const totalCount = historySamplesCount + samples.length;
                if (totalCount < 1) continue;

                let recentSumTime = 0;
                let recentErrors = 0;
                let recentCount = 0;

                for (let i = 0; i < samples.length; i++) {
                    recentSumTime += samples[i].time;
                    if (samples[i].hadError) recentErrors++;
                    recentCount++;
                }

                if (history.length > 0) {
                    const needed = Math.max(0, 40 - recentCount);
                    const blocksToTake = Math.min(history.length, Math.ceil(needed / CHUNK_SIZE));
                    const recentBlocks = history.slice(-blocksToTake);
                    for (let b = 0; b < recentBlocks.length; b++) {
                        const bCount = recentBlocks[b].count || CHUNK_SIZE;
                        recentSumTime += recentBlocks[b].avgTime * bCount;
                        recentErrors += recentBlocks[b].errorCount;
                        recentCount += bCount;
                    }
                }

                if (recentCount === 0) continue;

                const avg = recentSumTime / recentCount;
                const rawErrRate = recentErrors / recentCount;

                const ngramWpm = Math.round((12000 * len) / Math.max(40, avg));
                const relativeRatio = avg / baselineLatency;
                const laplaceErrRate = recentErrors / (recentCount + 2);
                const personalDifficulty = relativeRatio * (1 + (laplaceErrRate * 2.5));

                const rank = this.getNgramRank(ngram, len);
                const maxPool = NGRAM_POOL_SIZE; // 500
                const freqWeight = 0.35 + (0.65 * ((maxPool + 1 - Math.min(maxPool, rank)) / maxPool));

                const priorityScore = Math.min(100, Math.max(1, Math.round(personalDifficulty * freqWeight * 40)));

                let tierLabel = 'FLUID';
                let tierClass = 'badge-priority-fluid';
                let barColor = '#10b981';

                if (priorityScore >= 70) {
                    tierLabel = 'CRITICAL';
                    tierClass = 'badge-priority-critical';
                    barColor = '#ef4444';
                } else if (priorityScore >= 50) {
                    tierLabel = 'HIGH';
                    tierClass = 'badge-priority-high';
                    barColor = '#f59e0b';
                } else if (priorityScore >= 30) {
                    tierLabel = 'MODERATE';
                    tierClass = 'badge-priority-moderate';
                    barColor = 'var(--text-target)';
                }

                const barPct = Math.min(100, Math.max(15, Math.round(personalDifficulty * 45)));

                list.push({
                    ngram,
                    len,
                    avgTime: Math.round(avg),
                    wpm: ngramWpm,
                    errorRate: Math.round(rawErrRate * 100),
                    errors: recentErrors,
                    count: recentCount,
                    totalCount,
                    history,
                    score: Math.round(personalDifficulty * 100),
                    priorityScore,
                    tierLabel,
                    tierClass,
                    corpusRank: rank,
                    barPct,
                    barColor,
                    confirmed: totalCount >= MIN_CONFIRMED_SAMPLES,
                    isRelegated: totalCount < MIN_ERROR_SORT_SAMPLES
                });
            }

            return list;
        },

        sortWeaknessList(list, sortBy) {
            const sorted = list.slice();
            if (sortBy === 'latency') {
                sorted.sort((a, b) => (b.confirmed - a.confirmed) || (b.avgTime - a.avgTime));
            } else if (sortBy === 'error') {
                sorted.sort((a, b) => {
                    const aValid = (a.totalCount >= MIN_ERROR_SORT_SAMPLES);
                    const bValid = (b.totalCount >= MIN_ERROR_SORT_SAMPLES);
                    if (aValid !== bValid) return bValid ? 1 : -1;
                    return (b.errorRate - a.errorRate) || (b.errors - a.errors) || (b.totalCount - a.totalCount);
                });
            } else {
                sorted.sort((a, b) => (b.confirmed - a.confirmed) || (b.priorityScore - a.priorityScore));
            }
            return sorted;
        },

        refreshWeakStats() {
            this.weakBigrams = this.getRankedNgramList(2);
            this.weakTrigrams = this.getRankedNgramList(3);
            this.weakTetragrams = this.getRankedNgramList(4);
        },

        resetLanguageWeakStats() {
            const quLabel = this.data.quAsOneChar ? ' [qu=1]' : '';
            const label = `${this.readableCorpusName} (${this.currentLangCode.toUpperCase()})${quLabel}`;
            if (confirm(`Reset all weakness data for ${label}?`)) {
                this.weakStatsData = emptyWeakStats();
                this.currentTestStaging = {};
                safeStorage.remove(this.getWeakStorageKey(this.currentProfileId, this.currentLangCode));
                this.refreshWeakStats();
                if (this.selectedNgramData) {
                    $('#ngram-history-modal').modal('hide');
                    this.selectedNgramData = null;
                }
            }
        },

        // =========================================================================
        // PER-NGRAM EVOLUTION MODAL
        // =========================================================================

        setEvolutionViewMode(mode) {
            this.evolutionViewMode = mode;
            if (this.selectedNgramData) {
                this.buildEvolutionChart(this.selectedNgramData);
            }
        },

        openNgramHistory(item) {
            if (!item) return;
            this.evolutionViewMode = (item.totalCount >= 50) ? 'recent' : 'alltime';
            this.buildEvolutionChart(item);
            $('#weakness-modal').modal('hide');
            $('#ngram-history-modal').modal('show');
        },

        buildEvolutionChart(item) {
            const history = item.history || [];
            const totalCount = item.totalCount;
            const hasPoints = (history.length > 0);

            let chartData = null;
            let bestBlockTime = 0;
            let worstBlockTime = 0;
            let trendLabel = 'Stable';
            let trendClass = 'text-warning';
            let trendIcon = 'fa-minus';

            if (hasPoints) {
                let rawBlocks = history.slice();
                if (this.evolutionViewMode === 'recent' && totalCount >= 50) {
                    rawBlocks = rawBlocks.slice(-20);
                }

                let plotBlocks = [];
                if (rawBlocks.length <= MAX_CHART_POINTS) {
                    plotBlocks = rawBlocks.map((b, idx) => ({
                        avgTime: b.avgTime,
                        errorCount: b.errorCount,
                        count: b.count || CHUNK_SIZE,
                        timestamp: b.timestamp,
                        label: `Block #${idx + 1} (${b.count || CHUNK_SIZE} occ.)`
                    }));
                } else {
                    const binSize = Math.ceil(rawBlocks.length / MAX_CHART_POINTS);
                    for (let i = 0; i < rawBlocks.length; i += binSize) {
                        const bin = rawBlocks.slice(i, i + binSize);
                        let sumT = 0, errs = 0, occs = 0;
                        bin.forEach(b => {
                            const c = b.count || CHUNK_SIZE;
                            sumT += b.avgTime * c;
                            errs += b.errorCount;
                            occs += c;
                        });
                        plotBlocks.push({
                            avgTime: Math.round(sumT / occs),
                            errorCount: errs,
                            count: occs,
                            timestamp: bin[bin.length - 1].timestamp,
                            label: `Occurrences ${i * CHUNK_SIZE + 1}–${Math.min(totalCount, (i + bin.length) * CHUNK_SIZE)}`
                        });
                    }
                }

                const times = plotBlocks.map(b => b.avgTime);
                bestBlockTime = Math.min(...times);
                worstBlockTime = Math.max(...times);

                if (plotBlocks.length >= 2) {
                    const earlyAvg = plotBlocks.slice(0, Math.min(3, plotBlocks.length)).reduce((acc, h) => acc + h.avgTime, 0) / Math.min(3, plotBlocks.length);
                    const lateAvg = plotBlocks.slice(-Math.min(3, plotBlocks.length)).reduce((acc, h) => acc + h.avgTime, 0) / Math.min(3, plotBlocks.length);
                    const delta = lateAvg - earlyAvg;

                    if (delta < -15) {
                        trendLabel = 'Improving';
                        trendClass = 'text-success';
                        trendIcon = 'fa-arrow-down';
                    } else if (delta > 20) {
                        trendLabel = 'Needs Work';
                        trendClass = 'text-danger';
                        trendIcon = 'fa-arrow-up';
                    }
                }

                const svgW = 600;
                const svgH = 220;
                const padLeft = 52;
                const padRight = 20;
                const padTop = 24;
                const padBottom = 28;

                const plotW = svgW - padLeft - padRight;
                const plotH = svgH - padTop - padBottom;

                const minVal = Math.max(60, Math.floor((bestBlockTime - 25) / 50) * 50);
                const maxVal = Math.max(minVal + 100, Math.ceil((worstBlockTime + 25) / 50) * 50);

                const getX = (idx) => padLeft + (idx / Math.max(1, plotBlocks.length - 1)) * plotW;
                const getY = (val) => padTop + (1 - ((val - minVal) / Math.max(1, maxVal - minVal))) * plotH;

                const points = plotBlocks.map((b, idx) => {
                    const cx = Math.round(getX(idx));
                    const cy = Math.round(getY(b.avgTime));
                    const wpmEq = Math.round((12000 * item.len) / Math.max(40, b.avgTime));
                    return {
                        x: cx,
                        y: cy,
                        label: b.label,
                        avgTime: b.avgTime,
                        wpm: wpmEq,
                        errorCount: b.errorCount,
                        count: b.count,
                        errorRate: Math.round((b.errorCount / Math.max(1, b.count)) * 100),
                        dateFormatted: moment(b.timestamp).format('MMM D, HH:mm'),
                        tooltipLeft: Math.min(svgW - 90, Math.max(90, cx)),
                        tooltipTop: Math.max(15, cy)
                    };
                });

                const linePointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
                const baselineY = Math.round(getY(this.currentBaselineLatency));

                const gridY = [];
                const step = (maxVal - minVal) <= 150 ? 50 : 100;
                for (let v = minVal; v <= maxVal; v += step) {
                    gridY.push({ y: Math.round(getY(v)), val: v });
                }

                const areaPointsStr = `${points[0].x},${padTop + plotH} ${linePointsStr} ${points[points.length - 1].x},${padTop + plotH}`;

                chartData = {
                    points,
                    linePoints: linePointsStr,
                    areaPoints: areaPointsStr,
                    gridY,
                    baselineY: (baselineY >= padTop && baselineY <= padTop + plotH) ? baselineY : null
                };
            }

            this.selectedNgramData = {
                ...item,
                hasPoints,
                viewMode: this.evolutionViewMode,
                bestBlockTime,
                worstBlockTime,
                trendLabel,
                trendClass,
                trendIcon,
                chart: chartData
            };
            this.hoveredPointIdx = null;
        },

        backToWeaknessFromHistory() {
            $('#ngram-history-modal').modal('hide');
            this.selectedNgramData = null;
            $('#weakness-modal').modal('show');
        },

        launchSingleNgramDrill(targetNgram) {
            if (!targetNgram) return;
            $('#ngram-history-modal').modal('hide');

            const ds = this.data[this.data.source];
            const comb = Math.max(1, ds.combination || 2);
            const rep = Math.max(1, ds.repetition || 3);
            const unit = new Array(comb).fill(targetNgram).join(' ');
            const singlePhrase = new Array(rep).fill(unit).join(' ');

            this._suppressSourceWatcher = true;
            this.data.source = 'custom_words';
            this.data.custom_words.phrases = [singlePhrase];
            this.data.custom_words.phrasesCurrentIndex = 0;
            this.expectedPhrase = singlePhrase;
            this.buildPhraseWordRanges(this.expectedPhrase);
            this.resetCurrentPhraseMetrics();
            this.pauseTimer();
            this.save();

            this.$nextTick(() => {
                this._suppressSourceWatcher = false;
                if (this.$inputEl) this.$inputEl.focus();
            });
        },

        // =========================================================================
        // TARGETED DRILLS CONFIGURATION & LAUNCH
        // =========================================================================

        openDrillModal() {
            this.drillNgramType = this.activeWeakTab;
            const ds = this.data[this.data.source];

            this.drillConfig.combination = ds.combination || 2;
            this.drillConfig.repetition = ds.repetition || 3;
            this.drillConfig.minimumWPM = ds.minimumWPM || 40;
            this.drillConfig.minimumAccuracy = ds.minimumAccuracy || 100;

            $('#weakness-modal').modal('hide');
            $('#drill-modal').modal('show');
        },

        cancelDrillConfig() {
            $('#drill-modal').modal('hide');
            $('#weakness-modal').modal('show');
        },

        async launchConfiguredDrill() {
            if (this._drillStarting) return;
            this._drillStarting = true;

            try {
                this.refreshWeakStats();

                let list = [];
                if (this.drillNgramType === 'bigrams') list = this.weakBigrams;
                else if (this.drillNgramType === 'trigrams') list = this.weakTrigrams;
                else list = this.weakTetragrams;

                const filtered = list.filter(item => {
                    if (!this.drillFilterCaps && CAPS_REGEX.test(item.ngram)) return false;
                    if (!this.drillFilterPunct && PUNCT_REGEX.test(item.ngram)) return false;
                    return true;
                });

                const sorted = this.sortWeaknessList(filtered, 'priority');
                if (!sorted.length) return;

                const selected = sorted.slice(0, this.drillScope).map(item => item.ngram);
                const comb = Math.max(1, sanitizePositiveInt(this.drillConfig.combination));
                const rep = Math.max(1, sanitizePositiveInt(this.drillConfig.repetition));
                const minWPM = Math.max(1, Math.min(500, Number(this.drillConfig.minimumWPM) || 40));
                const minAcc = Math.max(1, Math.min(100, Number(this.drillConfig.minimumAccuracy) || 100));

                const generatedPhrases = [];

                if (this.drillMode === 'sandwich') {
                    const anchors = this.getLanguageAnchorWords();
                    let anchorIdx = 0;

                    for (let i = 0; i < selected.length; i += comb) {
                        const chunk = selected.slice(i, i + comb);
                        const unitTokens = [];

                        for (const ng of chunk) {
                            let anchor = anchors[anchorIdx % anchors.length];
                            anchorIdx++;
                            const hasCaps = CAPS_REGEX.test(ng);
                            anchor = (hasCaps && this.drillFilterCaps) ? anchor.toUpperCase() : anchor.toLowerCase();
                            unitTokens.push(anchor);
                            unitTokens.push(ng);
                        }

                        let closingAnchor = anchors[anchorIdx % anchors.length];
                        anchorIdx++;
                        unitTokens.push(closingAnchor.toLowerCase());

                        const singleUnit = unitTokens.join(' ');
                        const fullPhrase = new Array(rep).fill(singleUnit).join(' ');
                        generatedPhrases.push(fullPhrase);
                    }

                } else if (this.drillMode === 'ladder') {
                    const basePath = this.getBasePath();
                    const wordPool = await this.loadFullWordList(basePath);
                    if (basePath !== this.getBasePath()) return;

                    const ladderSets = this.buildLadderWords(selected, wordPool);

                    for (let i = 0; i < ladderSets.length; i += comb) {
                        const chunk = ladderSets.slice(i, i + comb);
                        const combinedLadder = chunk.flat();
                        const singleUnit = combinedLadder.join(' ');
                        const fullPhrase = new Array(rep).fill(singleUnit).join(' ');
                        generatedPhrases.push(fullPhrase);
                    }

                } else {
                    for (let i = 0; i < selected.length; i += comb) {
                        const chunk = selected.slice(i, i + comb);
                        const singleUnit = chunk.join(' ');
                        const fullPhrase = new Array(rep).fill(singleUnit).join(' ');
                        generatedPhrases.push(fullPhrase);
                    }
                }

                this._suppressSourceWatcher = true;
                this.data.source = 'custom_words';

                this.data.custom_words.combination = comb;
                this.data.custom_words.repetition = rep;
                this.data.custom_words.minimumWPM = minWPM;
                this.data.custom_words.minimumAccuracy = minAcc;

                if (this.data[this.drillNgramType]) {
                    this.data[this.drillNgramType].combination = comb;
                    this.data[this.drillNgramType].repetition = rep;
                    this.data[this.drillNgramType].minimumWPM = minWPM;
                    this.data[this.drillNgramType].minimumAccuracy = minAcc;
                }

                this.data.custom_words.phrases = generatedPhrases;
                this.data.custom_words.phrasesCurrentIndex = 0;
                this.expectedPhrase = generatedPhrases[0] || '';
                if (this.expectedPhrase) {
                    this.buildPhraseWordRanges(this.expectedPhrase);
                }
                this.resetCurrentPhraseMetrics();
                this.pauseTimer();
                this.save();

                $('#drill-modal').modal('hide');

                this.$nextTick(() => {
                    this._suppressSourceWatcher = false;
                    if (this.$inputEl) {
                        this.$inputEl.focus();
                    }
                });
            } finally {
                this._drillStarting = false;
            }
        },

        getLanguageAnchorWords() {
            const curated = LANGUAGE_ANCHORS[this.currentLangCode];
            if (curated) return curated;
            const derived = this.deriveAnchorWords();
            return derived.length >= 5 ? derived : LANGUAGE_ANCHORS.eng;
        },

        deriveAnchorWords() {
            const anchors = [];
            for (let i = 0; i < this.words.length && anchors.length < 20; i++) {
                const w = this.words[i];
                if (w.length >= 2 && w.length <= 4 && /^\p{Ll}+$/u.test(w)) anchors.push(w);
            }
            return anchors;
        },

        buildLadderWords(selected, wordPool) {
            const cleanPool = [];
            const maxCandidates = Math.min(4000, wordPool.length);
            for (let i = 0; i < maxCandidates; i++) {
                const w = wordPool[i];
                if (!w || /\d/.test(w) || w.length < 2) continue;
                if (!this.drillFilterCaps && CAPS_REGEX.test(w)) continue;
                if (!this.drillFilterPunct && PUNCT_REGEX.test(w)) continue;
                cleanPool.push(w);
            }

            const ladders = [];

            for (const ng of selected) {
                const ladder = [ng];
                const lastChar = ng.slice(-1);
                const hasTerminalPunct = TERMINAL_CLAUSE_PUNCT.test(lastChar);

                let rootNg = ng;
                let attachedPunct = '';

                if (hasTerminalPunct) {
                    attachedPunct = lastChar;
                    rootNg = ng.slice(0, -1);
                }

                const rootLower = rootNg.toLowerCase();
                const ngLower = ng.toLowerCase();

                let shortWord = null;
                let medWord = null;
                let longWord = null;

                for (const candidate of cleanPool) {
                    const cleanCandidate = candidate.replace(TERMINAL_CLAUSE_REGEX, '');
                    const cLower = cleanCandidate.toLowerCase();

                    if (cLower === rootLower || cLower === ngLower) continue;

                    let matches = false;
                    let wordToAdd = '';

                    if (hasTerminalPunct) {
                        if (cLower.endsWith(rootLower)) {
                            matches = true;
                            wordToAdd = cleanCandidate + attachedPunct;
                        }
                    } else {
                        if (cLower.includes(ngLower)) {
                            matches = true;
                            wordToAdd = cleanCandidate;
                        }
                    }

                    if (!matches) continue;

                    const len = cleanCandidate.length;

                    if (!shortWord && len >= 3 && len <= 4) {
                        shortWord = wordToAdd;
                    } else if (!medWord && len >= 5 && len <= 6) {
                        medWord = wordToAdd;
                    } else if (!longWord && len >= 7 && len <= 9) {
                        longWord = wordToAdd;
                    }

                    if (shortWord && medWord && longWord) break;
                }

                if (shortWord) ladder.push(shortWord);
                if (medWord) ladder.push(medWord);
                if (longWord) ladder.push(longWord);

                ladders.push(ladder);
            }

            return ladders;
        },

        customWordsModalShow() {
            this.customWordsInput = (this.custom_words || []).join('\n');
        },

        customWordsModalSubmit() {
            const raw = this.customWordsInput || '';
            const processed = raw.split(/\s+/).filter(Boolean);

            $('#custom-words-modal').modal('hide');
            this.custom_words = processed;
            safeStorage.set('ngram_custom_words_backup', processed);
            if (processed.length) this.data.source = 'custom_words';
            this.refreshPhrasesAndCurrentMetrics();
        }
    }
};

var ngramTypeApp = new Vue(ngramTypeConfig);