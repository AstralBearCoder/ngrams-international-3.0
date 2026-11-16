/**
 * ngramInternational — Core Typing, Statistical Weakness & Evolution Engine
 * v6.3 Multilingual Precision Engine:
 * - Live per-attempt IKI state machine matching extension-ngram-multi-tests (commit 3908122):
 *   charTs (Float64), charOk, charDirty (mistypes only), charEpoch (incremented on deletion), winErr per (unitEnd, len).
 * - Native fmt: 5 telemetry schema ([okCount, okSumMs, errCount, timestamp] + cur) with full fmt: 4 upconversion.
 * - Seamless extension-ngram-multi-tests (v2.0.0) JSON import & checkpoint deduplication.
 * - Hybrid Method C save/resume + Weaknesses corpus scope filtering & calibration (<50 occ.) drills.
 * - Non-blocking companion extension toast with permanent dismiss option.
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
const CHUNK_SIZE = 5;               // Granular 5-occurrence checkpoints for internal tests
const MIN_CONFIRMED_SAMPLES = 5;    // Minimum samples required to confirm a weakness
const MIN_ERROR_SORT_SAMPLES = 20;  // Threshold to avoid fluke 100% error rankings
const MAX_HISTORY_BLOCKS = 350;     // Maximum stored checkpoints per n-gram
const MAX_CHART_POINTS = 40;        // Visual limit to preserve SVG clarity
const MAX_PHRASE_PARAM = 1000;      // Hard boundary for combinations/repetitions
const MAX_CHARS_PER_KEY_EVENT = 5;  // Protection guard against pasted input chunks
const MIN_CLEAN_IKI_MS = 15;        // Discard sub-15ms glitches
const MAX_CLEAN_IKI_MS = 3500;      // Discard AFK pauses > 3.5s
const CALIBRATION_OCCURRENCE_LIMIT = 50;

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
    if (!quAsOne) return Array.from(text).length;

    if (!text.includes('q') && !text.includes('Q')) {
        return Array.from(text).length;
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

function newSessionId() {
    return `tst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Unpacks fmt: 5 ([okCount, okSumMs, errCount, timestamp] + cur)
 * or legacy fmt: 4 ([avgTime, errorCount, timestamp, count] + t/e/samples).
 */
function unpackNgramEntry(ngram, obj, quAsOne = false, fmt = 4) {
    if (!obj || typeof obj !== 'object') return null;
    const len = Number.isInteger(obj.len) ? obj.len : countAtomicUnits(ngram, quAsOne);
    if (len < 2 || len > 4) return null;

    const isFmt5 = (fmt === 5 || Array.isArray(obj.cur));
    const history = [];
    let cur = [0, 0, 0];

    if (isFmt5) {
        if (Array.isArray(obj.cur)) {
            cur = [
                Math.max(0, Math.round(Number(obj.cur[0]) || 0)),
                Math.max(0, Math.round(Number(obj.cur[1]) || 0)),
                Math.max(0, Math.round(Number(obj.cur[2]) || 0))
            ];
        }
        if (Array.isArray(obj.h)) {
            for (let i = 0; i < obj.h.length; i++) {
                const item = obj.h[i];
                if (!Array.isArray(item) || item.length < 4) continue;
                const okCount = Math.max(0, Math.round(Number(item[0]) || 0));
                const okSumMs = Math.max(0, Math.round(Number(item[1]) || 0));
                const errorCount = Math.max(0, Math.round(Number(item[2]) || 0));
                const timestamp = Number(item[3]) || Date.now();
                if (okCount + errorCount > 0) {
                    history.push({ okCount, okSumMs, errorCount, timestamp });
                }
            }
        }
    } else {
        if (Array.isArray(obj.history)) {
            for (const h of obj.history) {
                if (!h) continue;
                if (Number.isFinite(h.okCount)) {
                    const okCount = Math.max(0, Math.round(h.okCount));
                    const errorCount = Math.max(0, Math.round(h.errorCount || 0));
                    if (okCount + errorCount > 0) {
                        history.push({
                            okCount,
                            okSumMs: Math.max(0, Math.round(h.okSumMs || 0)),
                            errorCount,
                            timestamp: Number(h.timestamp) || Date.now()
                        });
                    }
                } else if (Number.isFinite(h.avgTime)) {
                    const count = Math.max(1, Number(h.count) || CHUNK_SIZE);
                    const errorCount = Math.max(0, Number(h.errorCount) || 0);
                    const okCount = Math.max(0, count - errorCount);
                    history.push({
                        okCount,
                        okSumMs: Math.round(h.avgTime) * okCount,
                        errorCount,
                        timestamp: Number(h.timestamp) || Date.now()
                    });
                }
            }
        } else if (Array.isArray(obj.h)) {
            for (const item of obj.h) {
                if (Array.isArray(item) && Number.isFinite(item[0])) {
                    const count = Math.max(1, Number(item[3]) || CHUNK_SIZE);
                    const errorCount = Math.max(0, Number(item[1]) || 0);
                    const okCount = Math.max(0, count - errorCount);
                    history.push({
                        okCount,
                        okSumMs: Math.round(item[0]) * okCount,
                        errorCount,
                        timestamp: Number(item[2]) || Date.now()
                    });
                }
            }
        }

        const samples = [];
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

        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            if (s.hadError) {
                cur[2] += 1;
            } else {
                cur[0] += 1;
                cur[1] += Math.round(s.time);
            }
            if (cur[0] + cur[2] >= CHUNK_SIZE) {
                history.push({
                    okCount: cur[0],
                    okSumMs: cur[1],
                    errorCount: cur[2],
                    timestamp: Date.now()
                });
                cur = [0, 0, 0];
            }
        }
    }

    if (!history.length && cur[0] + cur[2] === 0) return null;
    return { len, cur, history };
}

function normalizeWeakStats(parsed, quAsOne = false) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const fmt = Number(parsed.fmt) || 4;
    const hasEnvelope = !!(parsed.meta && parsed.ngrams && typeof parsed.ngrams === 'object');
    const rawNgrams = hasEnvelope ? parsed.ngrams : (parsed.ngrams && typeof parsed.ngrams === 'object' ? parsed.ngrams : parsed);
    const stats = emptyWeakStats();

    if (parsed.meta && typeof parsed.meta === 'object') {
        stats.meta.completedTests = Number(parsed.meta.completedTests) || 0;
        stats.meta.totalKeystrokes = Number(parsed.meta.totalKeystrokes) || 0;
        stats.meta.lastRun = typeof parsed.meta.lastRun === 'string' ? parsed.meta.lastRun : null;
    }

    for (const [ngram, entry] of Object.entries(rawNgrams)) {
        if (ngram === '__proto__' || ngram === 'meta' || ngram === 'fmt') continue;
        const unpacked = unpackNgramEntry(ngram, entry, quAsOne, fmt);
        if (unpacked) stats.ngrams[ngram] = unpacked;
    }
    return stats;
}

function serializeWeakStats(stats) {
    const ngrams = {};
    for (const [ngram, entry] of Object.entries(stats.ngrams || {})) {
        const cur = Array.isArray(entry?.cur) ? entry.cur : [0, 0, 0];
        const history = Array.isArray(entry?.history) ? entry.history : [];
        const hasCur = (cur[0] + cur[2]) > 0;
        const hasHistory = history.length > 0;
        if (!hasCur && !hasHistory) continue;

        const h = new Array(history.length);
        for (let j = 0; j < history.length; j++) {
            const b = history[j];
            h[j] = [
                Math.max(0, Math.round(b.okCount || 0)),
                Math.max(0, Math.round(b.okSumMs || 0)),
                Math.max(0, Math.round(b.errorCount || 0)),
                b.timestamp || Date.now()
            ];
        }

        ngrams[ngram] = {
            len: entry.len,
            cur: [Math.round(cur[0] || 0), Math.round(cur[1] || 0), Math.round(cur[2] || 0)],
            h
        };
    }
    return { fmt: 5, meta: stats.meta, ngrams };
}

// =============================================================================
// VUE APPLICATION CONFIGURATION
// =============================================================================

const ngramTypeConfig = {
    el: '#app',

    data() {
        return {
            VERSION: 6.3,

            showThemeMenu: false,
            showAudioMenu: false,
            showResumeMenu: false,
            showExtensionPromo: false,
            isTypingInputFocused: true,
            corpusLoadError: '',
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
            currentTestKeystrokes: 0,
            currentSessionId: newSessionId(),
            currentSessionCounted: false,

            weakBigrams: [],
            weakTrigrams: [],
            weakTetragrams: [],
            activeWeakTab: 'bigrams',
            weaknessSortBy: 'priority',
            weaknessCorpusScope: 'all',

            // Drill configuration modal state
            drillFocus: 'ranked', // 'ranked' | 'calibrate50'
            calibrateIncludeUnseen: false,
            drillNgramType: 'bigrams',
            drillSortBy: 'priority',
            drillCorpusScope: 'all',
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

            // Unfinished test bookmarks (max 1 per test type)
            savedUnfinishedSlots: {},
            unfinishedJustSaved: false,

            currentWordIdx: 0,
            wordEpoch: 0,
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
        hasUnfinishedProgress() {
            const ds = this.dataSource;
            if (!ds || !Array.isArray(ds.phrases) || ds.phrases.length === 0) return false;
            return ds.phrasesCurrentIndex > 0 || Object.keys(this.currentTestStaging).length > 0;
        },
        isCurrentStateSaved() {
            const ds = this.dataSource;
            const slot = this.savedUnfinishedSlots?.[this.getCurrentSlotKey()];
            if (!ds || !slot) return false;
            return (
                slot.sessionId === this.currentSessionId &&
                slot.phrasesCurrentIndex === ds.phrasesCurrentIndex &&
                Object.keys(this.currentTestStaging).length === 0
            );
        },
        savedUnfinishedList() {
            const map = this.savedUnfinishedSlots || {};
            const out = [];
            for (const [key, slot] of Object.entries(map)) {
                if (!slot || !Array.isArray(slot.phrases) || !slot.phrases.length) continue;
                const corp = this.availableCorpora.find(c => c.id === slot.corpus);
                const srcLabel = slot.source === 'custom_words'
                    ? 'Custom'
                    : (slot.source ? slot.source.charAt(0).toUpperCase() + slot.source.slice(1) : 'N-grams');
                const variantParts = [];
                if (slot.includeUppercase) variantParts.push('Caps');
                if (slot.includePunctuation) variantParts.push('Punct');
                out.push({
                    key,
                    corpusLabel: corp ? corp.label : slot.corpus,
                    sourceLabel: srcLabel,
                    scope: slot.scope || null,
                    variantLabel: variantParts.length ? variantParts.join('+') : 'Lower',
                    quAsOneChar: !!slot.quAsOneChar,
                    phrasesCurrentIndex: slot.phrasesCurrentIndex || 0,
                    totalPhrases: slot.phrases.length,
                    savedAt: slot.savedAt || 0
                });
            }
            out.sort((a, b) => b.savedAt - a.savedAt);
            return out;
        },
        filteredWeakBigrams() {
            return this.filterByCorpusScope(this.weakBigrams, this.weaknessCorpusScope);
        },
        filteredWeakTrigrams() {
            return this.filterByCorpusScope(this.weakTrigrams, this.weaknessCorpusScope);
        },
        filteredWeakTetragrams() {
            return this.filterByCorpusScope(this.weakTetragrams, this.weaknessCorpusScope);
        },
        activeWeakList() {
            let list = [];
            if (this.activeWeakTab === 'bigrams') list = this.filteredWeakBigrams;
            else if (this.activeWeakTab === 'trigrams') list = this.filteredWeakTrigrams;
            else list = this.filteredWeakTetragrams;

            return this.sortWeaknessList(list, this.weaknessSortBy);
        },
        activeListAvailableCount() {
            return this.activeWeakList?.length ?? 0;
        },
        calibrationEligibleCount() {
            return this.activeWeakList.filter(item => item.totalCount < CALIBRATION_OCCURRENCE_LIMIT).length;
        },
        drillPoolCount() {
            return this.getDrillCandidates().length;
        },
        drillModeDescription() {
            if (this.drillMode === 'classic') return 'Direct repetition drill of your selected n-grams.';
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
        this._saveFlashTimer = null;

        // Per-word fixed-capacity live IKI state machine buffers
        this.wordCharTs = new Float64Array(128);
        this.wordCharOk = new Uint8Array(128);
        this.wordCharDirty = new Uint8Array(128);
        this.wordCharEpoch = new Int32Array(128);
        this.wordWinErr = new Uint8Array(128 * 3);

        this.custom_words = safeStorage.get('ngram_custom_words_backup', []);
    },

    async mounted() {
        this.initProfiles();

        const savedData = safeStorage.get('ngramTypeAppdata');
        if (savedData) {
            this.load(savedData);
            if (!savedData.version || savedData.version < this.VERSION) {
                this.updateDataVersion();
            }
        } else {
            this.updateDataVersion();
        }

        this.loadSavedUnfinishedMap();

        if (!safeStorage.getString('ngramForkDisclaimerSeen')) {
            $('#fork-disclaimer-modal').modal('show');
        }

        this.showExtensionPromo = !safeStorage.getString('ngramExtensionPromoDismissed');

        this.applyTheme(this.data.theme || 'dracula');

        await this.reloadNgramData({ attemptRestoreDraftOrSlot: true, preserveExistingDeck: true });
        this.loadLanguageWeakStats();

        this.$inputEl = $('#input-typing');
        this.$timerEl = $('.timer');

        if (this.$timerEl && $.fn.countimer) {
            this.$timerEl.countimer({ autoStart: false });
        }

        this.isTypingInputFocused = !!(this.$inputEl && this.$inputEl[0] && document.activeElement === this.$inputEl[0]);

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

        this._onBeforeUnload = () => {
            this.saveActiveDraft();
        };
        window.addEventListener('beforeunload', this._onBeforeUnload);

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
        if (this._onBeforeUnload) {
            window.removeEventListener('beforeunload', this._onBeforeUnload);
        }
        if (this._saveFlashTimer) {
            clearTimeout(this._saveFlashTimer);
        }
    },

    methods: {
        onInputFocus() {
            this.isTypingInputFocused = true;
            this.closeDropdowns();
        },
        onInputBlur() {
            this.isTypingInputFocused = false;
        },

        // =====================================================================
        // PROFILES & BACKUPS / EXTENSION JSON IMPORT
        // =====================================================================

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
            this.resetSessionCounters();
            this.loadSavedUnfinishedMap();
            this.loadLanguageWeakStats();
            this.resetCurrentPhraseMetrics();
            if (!this.tryRestoreDraftOrSlot()) {
                this.refreshPhrases();
            }
        },

        deleteProfile(id) {
            if (this.profiles.length <= 1) {
                alert('You must maintain at least one active profile.');
                return;
            }
            const target = this.profiles.find(p => p.id === id);
            if (!confirm(`Delete profile '${target ? target.name : id}'?`)) return;

            this.removeProfileStats(id);
            safeStorage.remove(this.getUnfinishedStorageKey(id));
            safeStorage.remove(this.getDraftStorageKey(id));

            this.profiles = this.profiles.filter(p => p.id !== id);
            if (this.currentProfileId === id) {
                this.currentProfileId = this.profiles[0].id;
                this.resetSessionCounters();
                this.loadSavedUnfinishedMap();
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

                    const summary = this.importStatsPayload(parsed, targetId, isMerged);
                    this.saveProfiles();
                    this.switchProfile(targetId);

                    if (isMerged) {
                        alert(`Profile '${existingProfile.name}' updated (${summary}).`);
                    } else {
                        alert(`Profile '${cleanName}' imported successfully (${summary}).`);
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

        importExtensionToActiveProfile(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const parsed = JSON.parse(event.target.result);
                    if (!parsed || typeof parsed !== 'object') {
                        alert('Invalid JSON format.');
                        return;
                    }

                    let payload = parsed;
                    if (!parsed.stats && parsed.ngrams) {
                        const langSuffix = this.data.quAsOneChar ? `${this.currentLangCode}_qu` : this.currentLangCode;
                        payload = { stats: { [langSuffix]: parsed } };
                    }

                    if (!payload.stats || typeof payload.stats !== 'object') {
                        alert('Invalid extension JSON: missing "stats" object.');
                        return;
                    }

                    const summary = this.importStatsPayload(payload, this.currentProfileId, true);
                    this.loadLanguageWeakStats();
                    alert(`Imported into '${this.currentProfile.name}': ${summary}`);
                } catch (err) {
                    alert('Error importing extension JSON: ' + err.message);
                } finally {
                    e.target.value = '';
                }
            };
            reader.onerror = () => {
                alert('Error importing extension JSON: the file could not be read.');
                e.target.value = '';
            };
            reader.readAsText(file);
        },

        importStatsPayload(parsed, targetId, isMerged) {
            const partitions = [];
            let totalAddedBlocks = 0;
            let totalSkippedDuplicates = 0;

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
                        const mergeRes = this.mergeNormalizedStats(currentNormalized, importedNormalized);
                        safeStorage.set(key, serializeWeakStats(mergeRes.merged));
                        totalAddedBlocks += mergeRes.addedBlocks;
                        totalSkippedDuplicates += mergeRes.skippedDuplicates;
                    } else {
                        safeStorage.set(key, serializeWeakStats(importedNormalized));
                    }

                    const testsCount = importedNormalized.meta?.completedTests || 0;
                    partitions.push(`${langSuffix.toUpperCase()} (${testsCount} test${testsCount === 1 ? '' : 's'})`);
                }
            }

            if (!partitions.length) return 'no language partitions found';
            const partsMsg = partitions.join(', ');
            if (isMerged && totalSkippedDuplicates > 0) {
                return `${partsMsg}; ${totalAddedBlocks} new checkpoints merged, ${totalSkippedDuplicates} duplicate checkpoints skipped`;
            }
            return partsMsg;
        },

        mergeNormalizedStats(target, source) {
            let addedBlocks = 0;
            let skippedDuplicates = 0;
            let totalSourceBlocks = 0;
            let curAdded = false;

            for (const [ngram, srcItem] of Object.entries(source.ngrams || {})) {
                const srcHist = srcItem.history || [];
                const srcCur = srcItem.cur || [0, 0, 0];
                totalSourceBlocks += srcHist.length;

                if (!target.ngrams[ngram]) {
                    target.ngrams[ngram] = {
                        len: srcItem.len,
                        cur: srcCur.slice(),
                        history: srcHist.slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).slice(-MAX_HISTORY_BLOCKS)
                    };
                    addedBlocks += srcHist.length;
                    if (srcCur[0] + srcCur[2] > 0) curAdded = true;
                    continue;
                }

                const tgtItem = target.ngrams[ngram];
                if (!Array.isArray(tgtItem.history)) tgtItem.history = [];
                if (!Array.isArray(tgtItem.cur)) tgtItem.cur = [0, 0, 0];

                const existingKeys = new Set();
                for (let i = 0; i < tgtItem.history.length; i++) {
                    const b = tgtItem.history[i];
                    existingKeys.add(`${b.timestamp}|${b.okCount}|${b.okSumMs}|${b.errorCount}`);
                }

                for (let i = 0; i < srcHist.length; i++) {
                    const b = srcHist[i];
                    const k = `${b.timestamp}|${b.okCount}|${b.okSumMs}|${b.errorCount}`;
                    if (existingKeys.has(k)) {
                        skippedDuplicates++;
                    } else {
                        existingKeys.add(k);
                        tgtItem.history.push(b);
                        addedBlocks++;
                    }
                }

                tgtItem.history.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

                if (srcCur[0] + srcCur[2] > 0) {
                    curAdded = true;
                    tgtItem.cur[0] += srcCur[0];
                    tgtItem.cur[1] += srcCur[1];
                    tgtItem.cur[2] += srcCur[2];

                    while (tgtItem.cur[0] + tgtItem.cur[2] >= CHUNK_SIZE) {
                        tgtItem.history.push({
                            okCount: tgtItem.cur[0],
                            okSumMs: Math.round(tgtItem.cur[1]),
                            errorCount: tgtItem.cur[2],
                            timestamp: Date.now()
                        });
                        tgtItem.cur = [0, 0, 0];
                    }
                }

                if (tgtItem.history.length > MAX_HISTORY_BLOCKS) {
                    tgtItem.history = tgtItem.history.slice(-MAX_HISTORY_BLOCKS);
                }
            }

            const srcTests = source.meta?.completedTests || 0;
            const srcStrokes = source.meta?.totalKeystrokes || 0;
            if (totalSourceBlocks === 0 && curAdded) {
                target.meta.completedTests = (target.meta.completedTests || 0) + srcTests;
                target.meta.totalKeystrokes = (target.meta.totalKeystrokes || 0) + srcStrokes;
            } else if (addedBlocks > 0 || curAdded) {
                const ratio = totalSourceBlocks > 0 ? Math.min(1, addedBlocks / totalSourceBlocks) : 1;
                const testsToAdd = Math.max(addedBlocks > 0 ? 1 : 0, Math.round(srcTests * ratio));
                target.meta.completedTests = (target.meta.completedTests || 0) + testsToAdd;
                target.meta.totalKeystrokes = (target.meta.totalKeystrokes || 0) + Math.round(srcStrokes * ratio);
            }

            const tLast = target.meta.lastRun ? new Date(target.meta.lastRun).getTime() : 0;
            const sLast = source.meta?.lastRun ? new Date(source.meta.lastRun).getTime() : 0;
            target.meta.lastRun = new Date(Math.max(tLast, sLast) || Date.now()).toISOString();

            return { merged: target, addedBlocks, skippedDuplicates };
        },

        getWeakStorageKey(userId, lang) {
            const quSuffix = this.data.quAsOneChar ? '_qu' : '';
            return `ngramWeakStats_u_${userId}_l_${lang}${quSuffix}`;
        },

        // =====================================================================
        // HYBRID METHOD C: AUTO-DRAFT + EXPLICIT SAVE TO WEAKNESSES & BOOKMARK
        // =====================================================================

        resetSessionCounters() {
            this.currentTestStaging = {};
            this.currentTestKeystrokes = 0;
            this.currentSessionId = newSessionId();
            this.currentSessionCounted = false;
        },

        getUnfinishedStorageKey(profileId = this.currentProfileId) {
            return `ngramUnfinished_u_${profileId}`;
        },

        getDraftStorageKey(profileId = this.currentProfileId) {
            return `ngramDraft_u_${profileId}`;
        },

        getCurrentSlotKey(corpus = this.data.selectedCorpus, cat = this.categoryFolder, source = this.data.source) {
            return `${corpus}|${cat}|${source}`;
        },

        loadSavedUnfinishedMap() {
            const map = safeStorage.get(this.getUnfinishedStorageKey(), {});
            this.savedUnfinishedSlots = (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
        },

        saveActiveDraft() {
            const ds = this.dataSource;
            if (!ds || !Array.isArray(ds.phrases) || !ds.phrases.length) return;
            const hasData = ds.phrasesCurrentIndex > 0 || Object.keys(this.currentTestStaging).length > 0;
            if (!hasData) {
                safeStorage.remove(this.getDraftStorageKey());
                return;
            }
            safeStorage.set(this.getDraftStorageKey(), {
                slotKey: this.getCurrentSlotKey(),
                scope: ds.scope,
                combination: ds.combination,
                repetition: ds.repetition,
                minimumWPM: ds.minimumWPM,
                minimumAccuracy: ds.minimumAccuracy,
                phrases: ds.phrases.slice(),
                phrasesCurrentIndex: ds.phrasesCurrentIndex || 0,
                WPMs: Array.isArray(ds.WPMs) ? ds.WPMs.slice() : [],
                currentTestStaging: this.currentTestStaging,
                currentTestKeystrokes: this.currentTestKeystrokes || 0,
                sessionId: this.currentSessionId,
                sessionCounted: !!this.currentSessionCounted,
                savedAt: Date.now()
            });
        },

        clearActiveDraft() {
            safeStorage.remove(this.getDraftStorageKey());
        },

        applyRestoredState(record) {
            const ds = this.dataSource;
            if (!ds || !record || !Array.isArray(record.phrases) || !record.phrases.length) return false;

            ds.scope = record.scope ?? ds.scope;
            ds.combination = record.combination ?? ds.combination;
            ds.repetition = record.repetition ?? ds.repetition;
            ds.minimumWPM = record.minimumWPM ?? ds.minimumWPM;
            ds.minimumAccuracy = record.minimumAccuracy ?? ds.minimumAccuracy;
            ds.phrases = record.phrases.slice();
            ds.phrasesCurrentIndex = Math.min(record.phrases.length - 1, Math.max(0, record.phrasesCurrentIndex || 0));
            ds.WPMs = Array.isArray(record.WPMs) ? record.WPMs.slice() : [];

            this.currentTestStaging = record.currentTestStaging ? JSON.parse(JSON.stringify(record.currentTestStaging)) : {};
            this.currentTestKeystrokes = record.currentTestKeystrokes || 0;
            this.currentSessionId = record.sessionId || newSessionId();
            this.currentSessionCounted = !!record.sessionCounted;

            this.expectedPhrase = ds.phrases[ds.phrasesCurrentIndex] || '';
            if (this.expectedPhrase) {
                this.buildPhraseWordRanges(this.expectedPhrase);
            }
            this.resetCurrentPhraseMetrics();
            this.save();
            return true;
        },

        tryRestoreDraftOrSlot(matchScope = null) {
            const currentKey = this.getCurrentSlotKey();
            const draft = safeStorage.get(this.getDraftStorageKey(), null);
            if (draft && draft.slotKey === currentKey && (matchScope === null || draft.scope === matchScope)) {
                return this.applyRestoredState(draft);
            }

            const slot = this.savedUnfinishedSlots?.[currentKey];
            if (slot && (matchScope === null || slot.scope === matchScope)) {
                return this.applyRestoredState(slot);
            }
            return false;
        },

        saveCurrentUnfinishedTest() {
            const ds = this.dataSource;
            if (!ds || !Array.isArray(ds.phrases) || !ds.phrases.length) return;

            const hasStaged = Object.keys(this.currentTestStaging).length > 0;
            if (hasStaged || this.currentTestKeystrokes > 0) {
                const shouldIncrement = hasStaged && !this.currentSessionCounted;
                this.commitStagingToWeakStats({ incrementTestCount: shouldIncrement });
                if (shouldIncrement) {
                    this.currentSessionCounted = true;
                }
                this.refreshWeakStats();
            }

            const key = this.getCurrentSlotKey();
            const map = Object.assign({}, this.savedUnfinishedSlots);
            map[key] = {
                corpus: this.data.selectedCorpus,
                categoryFolder: this.categoryFolder,
                includePunctuation: !!this.data.includePunctuation,
                includeUppercase: !!this.data.includeUppercase,
                quAsOneChar: !!this.data.quAsOneChar,
                source: this.data.source,
                scope: ds.scope,
                combination: ds.combination,
                repetition: ds.repetition,
                minimumWPM: ds.minimumWPM,
                minimumAccuracy: ds.minimumAccuracy,
                phrases: ds.phrases.slice(),
                phrasesCurrentIndex: ds.phrasesCurrentIndex || 0,
                WPMs: Array.isArray(ds.WPMs) ? ds.WPMs.slice() : [],
                sessionId: this.currentSessionId,
                sessionCounted: !!this.currentSessionCounted,
                savedAt: Date.now()
            };

            if (safeStorage.set(this.getUnfinishedStorageKey(), map)) {
                this.savedUnfinishedSlots = map;
                this.saveActiveDraft();
                this.unfinishedJustSaved = true;
                if (this._saveFlashTimer) clearTimeout(this._saveFlashTimer);
                this._saveFlashTimer = setTimeout(() => {
                    this.unfinishedJustSaved = false;
                }, 1800);
            }
        },

        clearCurrentUnfinishedSlot() {
            const key = this.getCurrentSlotKey();
            if (this.savedUnfinishedSlots && this.savedUnfinishedSlots[key]) {
                const map = Object.assign({}, this.savedUnfinishedSlots);
                delete map[key];
                this.savedUnfinishedSlots = map;
                safeStorage.set(this.getUnfinishedStorageKey(), map);
            }
        },

        discardUnfinishedTest() {
            if (this.data.noResetMode) return;
            this.clearActiveDraft();
            this.resetSessionCounters();
            if (this.dataSource) this.dataSource.WPMs = [];
            this.refreshPhrasesAndCurrentMetrics();
        },

        async resumeSavedUnfinishedSlot(slotKey) {
            const slot = this.savedUnfinishedSlots?.[slotKey];
            if (!slot) return;
            this.showResumeMenu = false;

            const quChanged = (this.data.quAsOneChar !== !!slot.quAsOneChar);
            this._suppressSourceWatcher = true;
            this.data.selectedCorpus = slot.corpus;
            this.data.includePunctuation = !!slot.includePunctuation;
            this.data.includeUppercase = !!slot.includeUppercase;
            this.data.quAsOneChar = !!slot.quAsOneChar;
            this.data.source = slot.source;
            this._suppressSourceWatcher = false;

            await this.reloadNgramData({ forceRestoreSlotKey: slotKey });
            if (quChanged || !this.weakStatsData) {
                this.loadLanguageWeakStats();
            }
            this.pauseTimer();
            this.$nextTick(() => {
                if (this.$inputEl) this.$inputEl.focus();
            });
        },

        deleteSavedUnfinishedSlot(slotKey) {
            if (!this.savedUnfinishedSlots?.[slotKey]) return;
            const map = Object.assign({}, this.savedUnfinishedSlots);
            delete map[slotKey];
            this.savedUnfinishedSlots = map;
            safeStorage.set(this.getUnfinishedStorageKey(), map);
        },

        // =====================================================================
        // UI NAVIGATION & SETTINGS
        // =====================================================================

        acknowledgeDisclaimer() {
            safeStorage.setString('ngramForkDisclaimerSeen', 'true');
            $('#fork-disclaimer-modal').modal('hide');
        },

        dismissExtensionPromo(permanent = false) {
            this.showExtensionPromo = false;
            if (permanent) {
                safeStorage.setString('ngramExtensionPromoDismissed', 'true');
            }
        },

        stepValue(field, delta, min, max) {
            const target = this.data[this.data.source];
            if (!target) return;
            let next = (target[field] || 0) + delta;
            if (min !== undefined && next < min) next = min;
            if (max !== undefined && next > max) next = max;
            target[field] = next;

            if (field === 'combination' || field === 'repetition') {
                this.resetSessionCounters();
                this.refreshPhrases();
            } else {
                this.save();
            }
        },

        toggleThemeMenu() {
            this.showThemeMenu = !this.showThemeMenu;
            this.showAudioMenu = false;
            this.showResumeMenu = false;
        },
        toggleAudioMenu() {
            this.showAudioMenu = !this.showAudioMenu;
            this.showThemeMenu = false;
            this.showResumeMenu = false;
        },
        toggleResumeMenu() {
            this.showResumeMenu = !this.showResumeMenu;
            this.showThemeMenu = false;
            this.showAudioMenu = false;
        },
        selectTheme(themeId) {
            this.data.theme = themeId;
            this.showThemeMenu = false;
        },
        closeDropdowns() {
            this.showThemeMenu = false;
            this.showAudioMenu = false;
            this.showResumeMenu = false;
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
            this.resetSessionCounters();

            if (newSource === 'custom_words') {
                if (!this.tryRestoreDraftOrSlot()) {
                    const ds = this.data.custom_words;
                    const hasExistingDeck = ds && Array.isArray(ds.phrases) && ds.phrases.length > 0;
                    if (!hasExistingDeck) this.refreshPhrases();
                    else this.restoreCurrentDeck();
                }
            } else {
                await this.reloadNgramData({ attemptRestoreDraftOrSlot: true, preserveExistingDeck: true });
            }

            this.resetCurrentPhraseMetrics();
            this.pauseTimer();
            this.save();
        },

        setScope(sc) {
            const ds = this.dataSource;
            if (!ds) return;
            ds.scope = sc;
            this.resetSessionCounters();
            const restored = this.tryRestoreDraftOrSlot(sc);
            if (!restored) {
                this.refreshPhrasesAndCurrentMetrics();
            } else {
                this.pauseTimer();
            }
        },

        async onCorpusSelectionChanged() {
            this.invalidateAllDecks();
            this.resetSessionCounters();
            await this.reloadNgramData({ attemptRestoreDraftOrSlot: true });
            this.loadLanguageWeakStats();
            this.resetCurrentPhraseMetrics();
            this.pauseTimer();
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
            this.resetSessionCounters();
            await this.reloadNgramData({ attemptRestoreDraftOrSlot: true });
            this.resetCurrentPhraseMetrics();
            this.pauseTimer();
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
            this.corpusLoadError = '';
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

            this.resetSessionCounters();
            this.resetCurrentPhraseMetrics();

            if (!pool.words.length && !pool.bigrams.length && !pool.trigrams.length && !pool.tetragrams.length) {
                this.corpusLoadError = window.location.protocol === 'file:'
                    ? 'Blocked by browser file:// CORS policy. Start a local server (python3 -m http.server 8000) and open http://localhost:8000.'
                    : `Unable to load corpus files from ${this.getBasePath()}.`;
                this.expectedPhrase = '';
                this.refreshWeakStats();
                return;
            }

            let restored = false;
            if (options.forceRestoreSlotKey) {
                const slot = this.savedUnfinishedSlots?.[options.forceRestoreSlotKey];
                if (slot) restored = this.applyRestoredState(slot);
            } else if (options.attemptRestoreDraftOrSlot) {
                restored = this.tryRestoreDraftOrSlot();
            }

            if (!restored) {
                const ds = this.dataSource;
                if (!options.preserveExistingDeck || !ds?.phrases?.length) {
                    this.refreshPhrases();
                } else {
                    this.restoreCurrentDeck();
                }
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

        getNgramRank(ngram) {
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
                const isLocalOk = (window.location.protocol === 'file:' && response.status === 0);
                if (!response.ok && !isLocalOk) return [];

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

        // =====================================================================
        // LIVE PER-ATTEMPT IKI STATE MACHINE (commit 3908122 parity)
        // =====================================================================

        ensureWordBufferCapacity(charLen, unitLen) {
            if (charLen > this.wordCharTs.length) {
                const nextCharCap = Math.max(charLen + 32, this.wordCharTs.length * 2);
                const newTs = new Float64Array(nextCharCap);
                const newOk = new Uint8Array(nextCharCap);
                const newDirty = new Uint8Array(nextCharCap);
                const newEpoch = new Int32Array(nextCharCap);
                newTs.set(this.wordCharTs);
                newOk.set(this.wordCharOk);
                newDirty.set(this.wordCharDirty);
                newEpoch.set(this.wordCharEpoch);
                this.wordCharTs = newTs;
                this.wordCharOk = newOk;
                this.wordCharDirty = newDirty;
                this.wordCharEpoch = newEpoch;
            }
            const neededWin = unitLen * 3;
            if (neededWin > this.wordWinErr.length) {
                const nextWinCap = Math.max(neededWin + 64, this.wordWinErr.length * 2);
                const newWin = new Uint8Array(nextWinCap);
                newWin.set(this.wordWinErr);
                this.wordWinErr = newWin;
            }
        },

        resetWordBuffers() {
            this.wordEpoch = 0;
            this.wordCharTs.fill(0);
            this.wordCharOk.fill(0);
            this.wordCharDirty.fill(0);
            this.wordCharEpoch.fill(0);
            this.wordWinErr.fill(0);
        },

        /**
         * Evaluates all n-gram windows [a..b] (len 2..4) ending at newly completed atomic unit b.
         * Supports any word length >= 2.
         */
        evaluateUnitWindowEnd(range, b) {
            const unitLen = range.unitLen;
            if (unitLen < 2) return;

            const starts = range.starts;
            const ends = range.ends;
            const units = range.units;
            const ts = this.wordCharTs;
            const ok = this.wordCharOk;
            const dirty = this.wordCharDirty;
            const epochs = this.wordCharEpoch;
            const winErr = this.wordWinErr;

            for (let nLen = 2; nLen <= 4; nLen++) {
                const a = b - nLen + 1;
                if (a < 0) break;

                const ngram = units.slice(a, b + 1).join('');
                if (!this.isAllowedPyramidNgram(ngram, nLen)) continue;

                const slot = b * 3 + (nLen - 2);
                const startC = starts[a];
                const endC = ends[b];

                let allOk = true;
                for (let c = startC; c <= endC; c++) {
                    if (ok[c] !== 1) {
                        allOk = false;
                        break;
                    }
                }

                if (!allOk) {
                    this.stageNgramSample(ngram, nLen, 0, true);
                    winErr[slot] = 1;
                } else if (epochs[startC] === epochs[endC]) {
                    const dt = ts[endC] - ts[startC];
                    if (dt >= MIN_CLEAN_IKI_MS && dt <= MAX_CLEAN_IKI_MS) {
                        this.stageNgramSample(ngram, nLen, Math.round(dt), false);
                    }
                } else {
                    if (winErr[slot] === 0) {
                        let anyNonAnchorDirty = false;
                        for (let c = startC + 1; c <= endC; c++) {
                            if (dirty[c] === 1) {
                                anyNonAnchorDirty = true;
                                break;
                            }
                        }
                        if (anyNonAnchorDirty) {
                            this.stageNgramSample(ngram, nLen, 0, true);
                            winErr[slot] = 1;
                        }
                    }
                }
            }
        },

        markIncompleteWordErrors(range, typedWordLen) {
            if (!range || typedWordLen >= range.word.length || range.unitLen < 2) return;
            for (let b = 0; b < range.unitLen; b++) {
                if (range.ends[b] < typedWordLen) continue;
                for (let nLen = 2; nLen <= 4; nLen++) {
                    const a = b - nLen + 1;
                    if (a < 0) break;
                    const slot = b * 3 + (nLen - 2);
                    if (this.wordWinErr[slot] === 0) {
                        const ngram = range.units.slice(a, b + 1).join('');
                        if (this.isAllowedPyramidNgram(ngram, nLen)) {
                            this.stageNgramSample(ngram, nLen, 0, true);
                            this.wordWinErr[slot] = 1;
                        }
                    }
                }
            }
        },

        buildPhraseWordRanges(phrase) {
            const quAsOne = !!this.data.quAsOneChar;
            const ranges = [];
            const words = phrase.split(' ');
            let cursor = 0;

            for (let i = 0; i < words.length; i++) {
                const w = words[i];
                const start = cursor;
                const end = cursor + w.length;
                const isLast = (i === words.length - 1);
                const boundary = isLast ? end : end + 1;

                const units = tokenizeAtomicUnits(w, quAsOne);
                const unitLen = units.length;
                const starts = new Array(unitLen);
                const ends = new Array(unitLen);
                const endCharToUnit = new Int32Array(w.length);
                endCharToUnit.fill(-1);

                let cPos = 0;
                for (let u = 0; u < unitLen; u++) {
                    starts[u] = cPos;
                    cPos += units[u].length;
                    ends[u] = cPos - 1;
                    if (ends[u] >= 0 && ends[u] < w.length) {
                        endCharToUnit[ends[u]] = u;
                    }
                }

                ranges.push({
                    word: w,
                    start,
                    end,
                    boundary,
                    isLast,
                    units,
                    unitLen,
                    starts,
                    ends,
                    endCharToUnit
                });

                cursor = end + 1;
            }
            this.phraseWordRanges = ranges;
            this.currentWordIdx = 0;
            this.resetWordBuffers();
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
            }

            const isPrefixValid = expected.startsWith(typed);
            this.isInputCorrect = isPrefixValid;

            const ranges = this.phraseWordRanges;
            const targetRange = ranges[this.currentWordIdx];

            // 1. Deletion / Backspace: increment epoch and clear charOk (do NOT modify charDirty)
            if (typedLen < this.lastInputLength) {
                this.wordEpoch++;
                if (targetRange) {
                    const wLen = targetRange.end - targetRange.start;
                    this.ensureWordBufferCapacity(wLen, targetRange.unitLen);
                    for (let p = typedLen; p < this.lastInputLength; p++) {
                        if (p >= targetRange.start && p < targetRange.end) {
                            const cIdx = p - targetRange.start;
                            this.wordCharOk[cIdx] = 0;
                        }
                    }
                }
                this.lastInputLength = typedLen;
                this.lastInputValue = typed;
                return;
            }

            if (typed === this.lastInputValue) return;
            const prevLen = this.lastInputLength;
            const addedChars = Math.min(MAX_CHARS_PER_KEY_EVENT, Math.max(1, typedLen - prevLen));
            this.lastInputLength = typedLen;
            this.lastInputValue = typed;
            this.currentTestKeystrokes += addedChars;

            this.resumeTimer();

            if (isPrefixValid) {
                this.hitsCorrect += addedChars;
                if (this.data.soundCorrectLetterEnabled) {
                    this.playSound(this.correctLetterSound);
                }
            } else {
                this.hitsWrong += addedChars;
                if (this.data.soundIncorrectLetterEnabled) {
                    this.playSound(this.incorrectLetterSound);
                }
            }

            // 2. Unified forward typing pass across newly typed indices [prevLen .. typedLen - 1]
            for (let p = prevLen; p < typedLen; p++) {
                const activeRange = ranges[this.currentWordIdx];
                if (!activeRange) break;

                if (p < activeRange.start) continue;

                if (p >= activeRange.start && p < activeRange.end) {
                    const wLen = activeRange.end - activeRange.start;
                    this.ensureWordBufferCapacity(wLen, activeRange.unitLen);
                    const cIdx = p - activeRange.start;

                    this.wordCharTs[cIdx] = now;
                    this.wordCharEpoch[cIdx] = this.wordEpoch;

                    if (typed[p] === expected[p]) {
                        this.wordCharOk[cIdx] = 1;
                    } else {
                        this.wordCharOk[cIdx] = 0;
                        this.wordCharDirty[cIdx] = 1;
                    }

                    const unitEndIdx = activeRange.endCharToUnit[cIdx];
                    if (unitEndIdx !== -1) {
                        this.evaluateUnitWindowEnd(activeRange, unitEndIdx);
                    }
                } else if (p === activeRange.end && !activeRange.isLast && isPrefixValid) {
                    const typedWordLen = Math.min(activeRange.word.length, p - activeRange.start);
                    this.markIncompleteWordErrors(activeRange, typedWordLen);
                    this.currentWordIdx++;
                    this.resetWordBuffers();
                }
            }

            if (isPrefixValid) {
                while (this.currentWordIdx < ranges.length) {
                    const r = ranges[this.currentWordIdx];
                    if (r.isLast && typedLen >= r.boundary) {
                        this.currentWordIdx++;
                        this.resetWordBuffers();
                    } else {
                        break;
                    }
                }
            }

            // 3. Phrase completion check
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

        stageNgramSample(ngram, len, duration, hadError) {
            if (!this.isAllowedPyramidNgram(ngram, len)) return;

            let staged = this.currentTestStaging[ngram];
            if (!staged) {
                staged = this.currentTestStaging[ngram] = { samples: [], len };
            }
            staged.samples.push({ time: hadError ? 0 : duration, hadError: !!hadError });
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
            this.resetWordBuffers();
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
                this.saveActiveDraft();
            } else {
                this.clearCurrentUnfinishedSlot();
                this.clearActiveDraft();
                this.commitStagingToWeakStats({ incrementTestCount: !this.currentSessionCounted });
                this.resetSessionCounters();
                this.refreshWeakStats();
                $('#weakness-modal').modal('show');
                this.refreshPhrases();
            }
        },

        // =====================================================================
        // WEAKNESS STATS PERSISTENCE & RANKING (fmt: 5)
        // =====================================================================

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

        commitStagingToWeakStats({ incrementTestCount = true } = {}) {
            const ngrams = this.weakStatsData.ngrams;

            for (const [ngram, staged] of Object.entries(this.currentTestStaging)) {
                let target = ngrams[ngram];
                if (!target) {
                    this.$set(ngrams, ngram, { len: staged.len, cur: [0, 0, 0], history: [] });
                    target = ngrams[ngram];
                }
                if (!Array.isArray(target.history)) this.$set(target, 'history', []);
                if (!Array.isArray(target.cur)) this.$set(target, 'cur', [0, 0, 0]);

                const samples = staged.samples || [];
                for (let i = 0; i < samples.length; i++) {
                    const s = samples[i];
                    if (s.hadError) {
                        target.cur[2] += 1;
                    } else {
                        target.cur[0] += 1;
                        target.cur[1] += Math.round(s.time);
                    }

                    if (target.cur[0] + target.cur[2] >= CHUNK_SIZE) {
                        target.history.push({
                            okCount: target.cur[0],
                            okSumMs: Math.round(target.cur[1]),
                            errorCount: target.cur[2],
                            timestamp: Date.now()
                        });
                        target.cur = [0, 0, 0];
                    }
                }

                if (target.history.length > MAX_HISTORY_BLOCKS) {
                    target.history = target.history.slice(-MAX_HISTORY_BLOCKS);
                }
            }

            if (incrementTestCount) {
                this.weakStatsData.meta.completedTests = (this.weakStatsData.meta.completedTests || 0) + 1;
            }
            this.weakStatsData.meta.totalKeystrokes = (this.weakStatsData.meta.totalKeystrokes || 0) + (this.currentTestKeystrokes || 0);
            this.weakStatsData.meta.lastRun = new Date().toISOString();

            this.currentTestStaging = {};
            this.currentTestKeystrokes = 0;
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

                const cur = item.cur || [0, 0, 0];
                const history = item.history || [];

                let historySamplesCount = 0;
                for (let b = 0; b < history.length; b++) {
                    historySamplesCount += (history[b].okCount || 0) + (history[b].errorCount || 0);
                }
                const curTotal = (cur[0] || 0) + (cur[2] || 0);
                const totalCount = historySamplesCount + curTotal;
                if (totalCount < 1) continue;

                let recentOk = cur[0] || 0;
                let recentSum = cur[1] || 0;
                let recentErr = cur[2] || 0;
                let recentCount = curTotal;

                if (history.length > 0 && recentCount < 40) {
                    for (let b = history.length - 1; b >= 0 && recentCount < 40; b--) {
                        const blk = history[b];
                        const bOk = blk.okCount || 0;
                        const bErr = blk.errorCount || 0;
                        recentOk += bOk;
                        recentSum += (blk.okSumMs || 0);
                        recentErr += bErr;
                        recentCount += (bOk + bErr);
                    }
                }

                if (recentCount === 0) continue;

                const hasSpeedData = recentOk > 0;
                const avg = hasSpeedData ? (recentSum / recentOk) : baselineLatency;
                const rawErrRate = recentErr / recentCount;

                const ngramWpm = hasSpeedData ? Math.round((12000 * len) / Math.max(40, avg)) : 0;
                const relativeRatio = avg / baselineLatency;
                const laplaceErrRate = recentErr / (recentCount + 2);
                const personalDifficulty = relativeRatio * (1 + (laplaceErrRate * 2.5));

                const rank = this.getNgramRank(ngram);
                const maxPool = NGRAM_POOL_SIZE;
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
                    hasSpeedData,
                    avgTime: Math.round(avg),
                    wpm: ngramWpm,
                    errorRate: Math.round(rawErrRate * 100),
                    errors: recentErr,
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

        filterByCorpusScope(list, scope) {
            if (!list || !list.length) return [];
            if (scope === 'all' || !scope) return list;
            const limit = Number(scope);
            if (!Number.isFinite(limit) || limit <= 0) return list;
            return list.filter(item => item.corpusRank <= limit);
        },

        sortWeaknessList(list, sortBy) {
            const sorted = list.slice();
            if (sortBy === 'latency') {
                sorted.sort((a, b) =>
                    (b.confirmed - a.confirmed) ||
                    (b.hasSpeedData - a.hasSpeedData) ||
                    (b.avgTime - a.avgTime)
                );
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
                this.currentTestKeystrokes = 0;
                this.currentSessionCounted = false;
                safeStorage.remove(this.getWeakStorageKey(this.currentProfileId, this.currentLangCode));
                this.refreshWeakStats();
                if (this.selectedNgramData) {
                    $('#ngram-history-modal').modal('hide');
                    this.selectedNgramData = null;
                }
            }
        },

        // =====================================================================
        // PER-NGRAM EVOLUTION MODAL
        // =====================================================================

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
                    plotBlocks = rawBlocks.map((b, idx) => {
                        const bOk = b.okCount || 0;
                        const bErr = b.errorCount || 0;
                        const bTotal = bOk + bErr;
                        const bAvg = bOk > 0 ? Math.round((b.okSumMs || 0) / bOk) : this.currentBaselineLatency;
                        return {
                            avgTime: bAvg,
                            noCleanSpeed: (bOk === 0),
                            errorCount: bErr,
                            count: bTotal,
                            timestamp: b.timestamp,
                            label: `Block #${idx + 1} (${bTotal} occ.)`
                        };
                    });
                } else {
                    const binSize = Math.ceil(rawBlocks.length / MAX_CHART_POINTS);
                    let runningOcc = 0;
                    for (let i = 0; i < rawBlocks.length; i += binSize) {
                        const bin = rawBlocks.slice(i, i + binSize);
                        let binOk = 0, binSumMs = 0, binErr = 0, binTotal = 0;
                        bin.forEach(b => {
                            const bOk = b.okCount || 0;
                            const bErr = b.errorCount || 0;
                            binOk += bOk;
                            binSumMs += (b.okSumMs || 0);
                            binErr += bErr;
                            binTotal += (bOk + bErr);
                        });
                        const binAvg = binOk > 0 ? Math.round(binSumMs / binOk) : this.currentBaselineLatency;
                        const startOcc = runningOcc + 1;
                        runningOcc += binTotal;
                        plotBlocks.push({
                            avgTime: binAvg,
                            noCleanSpeed: (binOk === 0),
                            errorCount: binErr,
                            count: binTotal,
                            timestamp: bin[bin.length - 1].timestamp,
                            label: `Occurrences ${startOcc}–${runningOcc}`
                        });
                    }
                }

                const cleanTimes = plotBlocks.filter(b => !b.noCleanSpeed).map(b => b.avgTime);
                const allTimes = cleanTimes.length ? cleanTimes : plotBlocks.map(b => b.avgTime);
                bestBlockTime = Math.min(...allTimes);
                worstBlockTime = Math.max(...allTimes);

                if (plotBlocks.length >= 2) {
                    const nEdge = Math.min(3, plotBlocks.length);
                    const earlyAvg = plotBlocks.slice(0, nEdge).reduce((acc, h) => acc + h.avgTime, 0) / nEdge;
                    const lateAvg = plotBlocks.slice(-nEdge).reduce((acc, h) => acc + h.avgTime, 0) / nEdge;
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
                    const wpmEq = b.noCleanSpeed ? 0 : Math.round((12000 * item.len) / Math.max(40, b.avgTime));
                    return {
                        x: cx,
                        y: cy,
                        label: b.label,
                        avgTime: b.avgTime,
                        noCleanSpeed: b.noCleanSpeed,
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
            this.resetSessionCounters();
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

        // =====================================================================
        // TARGETED DRILLS & CALIBRATION (< 50 OCCURRENCES)
        // =====================================================================

        openDrillModal() {
            this.drillFocus = 'ranked';
            this.drillNgramType = this.activeWeakTab;
            this.drillSortBy = this.weaknessSortBy;
            this.drillCorpusScope = this.weaknessCorpusScope;
            if (this.drillScope === 'all') this.drillScope = 25;

            const ds = this.data[this.data.source];
            this.drillConfig.combination = ds.combination || 2;
            this.drillConfig.repetition = ds.repetition || 3;
            this.drillConfig.minimumWPM = ds.minimumWPM || 40;
            this.drillConfig.minimumAccuracy = ds.minimumAccuracy || 100;

            $('#weakness-modal').modal('hide');
            $('#drill-modal').modal('show');
        },

        openCalibrationDrillModal() {
            this.drillFocus = 'calibrate50';
            this.drillNgramType = this.activeWeakTab;
            this.drillCorpusScope = this.weaknessCorpusScope;
            this.drillScope = 'all';

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

        getDrillCandidates() {
            let list = [];
            if (this.drillNgramType === 'bigrams') list = this.weakBigrams;
            else if (this.drillNgramType === 'trigrams') list = this.weakTrigrams;
            else list = this.weakTetragrams;

            let scoped = this.filterByCorpusScope(list, this.drillCorpusScope);

            if (this.drillFocus === 'calibrate50') {
                scoped = scoped.filter(item => item.totalCount < CALIBRATION_OCCURRENCE_LIMIT);

                if (this.calibrateIncludeUnseen) {
                    const seenSet = new Set(list.map(x => x.ngram));
                    const pool = this[this.drillNgramType] || [];
                    const corpusCap = (this.drillCorpusScope !== 'all' && Number(this.drillCorpusScope) > 0)
                        ? Number(this.drillCorpusScope)
                        : NGRAM_POOL_SIZE;

                    const unseen = [];
                    for (let i = 0; i < pool.length; i++) {
                        const ng = pool[i];
                        const rank = this.getNgramRank(ng);
                        if (rank > corpusCap) continue;
                        if (seenSet.has(ng)) continue;
                        unseen.push({
                            ngram: ng,
                            totalCount: 0,
                            corpusRank: rank,
                            priorityScore: 0,
                            avgTime: 0,
                            errorRate: 0,
                            errors: 0,
                            confirmed: false,
                            hasSpeedData: false
                        });
                    }
                    scoped = scoped.concat(unseen);
                }
            }

            return scoped.filter(item => {
                if (!this.drillFilterCaps && CAPS_REGEX.test(item.ngram)) return false;
                if (!this.drillFilterPunct && PUNCT_REGEX.test(item.ngram)) return false;
                return true;
            });
        },

        async launchConfiguredDrill() {
            if (this._drillStarting) return;
            this._drillStarting = true;

            try {
                this.refreshWeakStats();

                const filtered = this.getDrillCandidates();
                if (!filtered.length) return;

                let sorted;
                if (this.drillFocus === 'calibrate50') {
                    sorted = filtered.slice().sort((a, b) =>
                        (a.totalCount - b.totalCount) || (a.corpusRank - b.corpusRank)
                    );
                } else {
                    sorted = this.sortWeaknessList(filtered, this.drillSortBy);
                }

                const sliceLimit = (this.drillScope === 'all') ? sorted.length : Math.max(1, Number(this.drillScope) || 25);
                const selected = sorted.slice(0, sliceLimit).map(item => item.ngram);

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

                        const closingAnchor = anchors[anchorIdx % anchors.length];
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
                this.resetSessionCounters();
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
            this.clearActiveDraft();
            this.resetSessionCounters();
            this.refreshPhrasesAndCurrentMetrics();
        }
    }
};

var ngramTypeApp = new Vue(ngramTypeConfig);
