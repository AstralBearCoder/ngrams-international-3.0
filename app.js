/**
 * ngramInternational — Core Typing & Statistical Weakness Engine
 * v5.8 Clean Precision Engine:
 * - Deterministic word ranges with multi-word burst boundary handling.
 * - Robust weakness tracking across sliding windows (last 50 occurrences).
 * - Cumulative staging across restarts and retries preserved for natural difficulty weighting.
 * - Precision Ladder drills: Strict elision preservation (d', l', c', qu') and terminal punct validation.
 * - Lightweight localStorage footprint with automated runtime phrase pruning.
 * - Race-condition guard preventing drill double-launch glitches.
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

const MAX_SCOPE = 200;              // Highest "Top N" scope in the UI
const NGRAM_POOL_SIZE = 200;        // Pool size loaded from n-gram TSV files
const MAX_SAMPLES_PER_NGRAM = 50;   // Sliding window sample limit for error analytics
const MIN_CONFIRMED_SAMPLES = 3;    // Minimum samples required to confirm a weakness
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
// HELPERS
// =============================================================================

function sanitizePositiveInt(value) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, MAX_PHRASE_PARAM);
}

function parseTokenLine(rawLine, expectedLength) {
    if (!rawLine) return null;
    const tabIdx = rawLine.indexOf('\t');
    let token = tabIdx === -1 ? rawLine : rawLine.substring(0, tabIdx);
    token = token.replace(/[\r\n]/g, '');
    if (!token || /\s/.test(token) || token.includes('_')) return null;
    if (expectedLength !== null && token.length !== expectedLength) return null;
    return token;
}

function buildNgramPyramid(raw2, raw3, raw4) {
    const tetragramsSet = new Set(raw4.slice(0, NGRAM_POOL_SIZE));

    const trigramsSet = new Set(raw3.slice(0, NGRAM_POOL_SIZE));
    tetragramsSet.forEach(qg => {
        if (qg.length === 4) {
            trigramsSet.add(qg.substring(0, 3));
            trigramsSet.add(qg.substring(1, 4));
        }
    });

    const bigramsSet = new Set(raw2.slice(0, NGRAM_POOL_SIZE));
    trigramsSet.forEach(tg => {
        if (tg.length === 3) {
            bigramsSet.add(tg.substring(0, 2));
            bigramsSet.add(tg.substring(1, 3));
        }
    });
    tetragramsSet.forEach(qg => {
        if (qg.length === 4) {
            bigramsSet.add(qg.substring(0, 2));
            bigramsSet.add(qg.substring(1, 3));
            bigramsSet.add(qg.substring(2, 4));
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

function unpackNgramEntry(ngram, obj) {
    if (!obj || typeof obj !== 'object') return null;
    const len = Number.isInteger(obj.len) ? obj.len : ngram.length;
    let samples = [];

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
    } else {
        const count = Math.min(MAX_SAMPLES_PER_NGRAM, obj.count || 1);
        const avg = obj.count ? (obj.totalTime / obj.count) : 250;
        const errCount = Math.min(count, obj.errors || 0);
        if (Number.isFinite(avg) && avg >= 0) {
            for (let s = 0; s < count; s++) {
                samples.push({ time: avg, hadError: s < errCount });
            }
        }
    }

    if (samples.length > MAX_SAMPLES_PER_NGRAM) {
        samples = samples.slice(-MAX_SAMPLES_PER_NGRAM);
    }
    if (!samples.length || len < 2 || len > 4) return null;
    return { len, samples };
}

function normalizeWeakStats(parsed) {
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
        const unpacked = unpackNgramEntry(ngram, entry);
        if (unpacked) stats.ngrams[ngram] = unpacked;
    }
    return stats;
}

function serializeWeakStats(stats) {
    const ngrams = {};
    for (const [ngram, entry] of Object.entries(stats.ngrams || {})) {
        const samples = entry && entry.samples;
        if (!Array.isArray(samples) || !samples.length) continue;
        const times = new Array(samples.length);
        let flags = '';
        for (let i = 0; i < samples.length; i++) {
            times[i] = Math.round(samples[i].time);
            flags += samples[i].hadError ? '1' : '0';
        }
        ngrams[ngram] = { len: entry.len, t: times, e: flags };
    }
    return { fmt: 2, meta: stats.meta, ngrams };
}

// =============================================================================
// VUE APPLICATION CONFIGURATION
// =============================================================================

const ngramTypeConfig = {
    el: '#app',

    data() {
        return {
            VERSION: 5.8,

            showThemeMenu: false,
            showAudioMenu: false,
            newProfileInput: '',
            customWordsInput: '',

            profiles: [],
            currentProfileId: 'default',

            themes: [
                { id: 'emerald',         label: 'Emerald',         color: '#34d399', isLight: false },
                { id: 'carbon',          label: 'Carbon',          color: '#facc15', isLight: false },
                { id: 'nord',            label: 'Nord',            color: '#88c0d0', isLight: false },
                { id: 'paper',           label: 'Paper',           color: '#c25e1a', isLight: false },
                { id: 'midnight',        label: 'Midnight',        color: '#cba6f7', isLight: false },
                { id: 'dracula',         label: 'Dracula',         color: '#ff79c6', isLight: false },
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

            weakStatsData: {
                meta: { completedTests: 0, totalKeystrokes: 0, lastRun: null },
                ngrams: {}
            },

            currentTestStaging: {},

            weakBigrams: [],
            weakTrigrams: [],
            weakTetragrams: [],
            activeWeakTab: 'bigrams',
            drillScope: 25,
            drillMode: 'classic',
            weaknessFilterCaps: true,
            weaknessFilterPunct: true,

            currentWordIdx: 0,
            currentWordStartTime: 0,
            currentWordErrors: 0,
            phraseWordRanges: [],
            lastInputLength: 0,
            lastInputValue: '',

            data: {
                sidebarOpen: true,
                source: 'bigrams',
                theme: 'emerald',
                selectedCorpus: 'Ngram_English',
                includePunctuation: true,
                includeUppercase: true,
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
        categoryFolder() {
            const casePart = this.data.includeUppercase ? 'All_Cases_Alphanumeric' : 'Lowercase_Alphanumeric';
            return this.data.includePunctuation ? `${casePart}_Punctuation` : casePart;
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
            if (c < 8) return { label: 'Moderate', class: 'badge-info', text: 'Patterns over last 50 occurrences.' };
            return { label: 'High Precision', class: 'badge-success', text: 'High statistical confidence.' };
        },
        activeWeakList() {
            let list = [];
            if (this.activeWeakTab === 'bigrams') list = this.weakBigrams;
            else if (this.activeWeakTab === 'trigrams') list = this.weakTrigrams;
            else list = this.weakTetragrams;

            return list.filter(item => {
                if (!this.weaknessFilterCaps && CAPS_REGEX.test(item.ngram)) return false;
                if (!this.weaknessFilterPunct && PUNCT_REGEX.test(item.ngram)) return false;
                return true;
            });
        },
        activeListAvailableCount() {
            return this.activeWeakList?.length ?? 0;
        },
        drillModeDescription() {
            if (this.drillMode === 'classic') return 'Direct repetitive drill of your slowest n-grams.';
            if (this.drillMode === 'sandwich') return `Wraps each weak n-gram with high-frequency ${this.readableCorpusName} anchor words.`;
            return 'Step-by-step ladder progression expanding each n-gram into real words.';
        }
    },

    watch: {
        'data.theme'(newTheme) {
            this.applyTheme(newTheme);
            this.save();
        },
        async 'data.selectedCorpus'() {
            this.currentTestStaging = {};
            await this.reloadNgramData();
            this.loadLanguageWeakStats();
            this.resetCurrentPhraseMetrics();
        },
        async 'data.source'(newSource) {
            if (this._suppressSourceWatcher) return;

            this.currentTestStaging = {};
            if (newSource === 'custom_words') {
                this.refreshPhrases();
            } else {
                await this.reloadNgramData();
            }
            this.resetCurrentPhraseMetrics();
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

        this.applyTheme(this.data.theme || 'emerald');

        await this.reloadNgramData();
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
            const name = (this.newProfileInput || '').trim();
            if (!name) return;
            const newId = `usr_${Date.now()}`;
            this.profiles.push({ id: newId, name, createdAt: Date.now() });
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
            const keys = safeStorage.keysWithPrefix(this.getWeakStorageKey(id, ''));
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
            const prefix = this.getWeakStorageKey(this.currentProfileId, '');
            const keys = safeStorage.keysWithPrefix(prefix);
            for (let i = 0; i < keys.length; i++) {
                const stored = safeStorage.get(keys[i], null);
                if (stored) backup.stats[keys[i].slice(prefix.length)] = stored;
            }

            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ngram-${this.currentProfile.name.toLowerCase().replace(/\s+/g, '_')}-backup.json`;
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

                    const importedName = String(parsed.profile.name || 'Imported User').slice(0, 60);
                    const newId = `usr_${Date.now()}`;

                    let skipped = 0;
                    const validEntries = [];
                    if (parsed.stats && typeof parsed.stats === 'object') {
                        for (const [lang, langStats] of Object.entries(parsed.stats)) {
                            const normalized = /^[A-Za-z0-9_-]{1,16}$/.test(lang) ? normalizeWeakStats(langStats) : null;
                            if (normalized) validEntries.push([lang, normalized]);
                            else skipped++;
                        }
                    }

                    this.profiles.push({ id: newId, name: `${importedName} (Restored)`, createdAt: Date.now() });
                    for (const [lang, normalized] of validEntries) {
                        safeStorage.set(this.getWeakStorageKey(newId, lang), serializeWeakStats(normalized));
                    }

                    this.saveProfiles();
                    this.switchProfile(newId);
                    alert(`Profile '${importedName}' restored successfully.` + (skipped ? ` ${skipped} invalid entr${skipped === 1 ? 'y was' : 'ies were'} skipped.` : ''));
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

        getWeakStorageKey(userId, lang) {
            return `ngramWeakStats_u_${userId}_l_${lang}`;
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

        reloadNgramData() {
            const seq = ++this._loadSeq;
            const run = this.applyNgramData(seq);
            this._latestLoad = run;
            return run;
        },

        async applyNgramData(seq) {
            const pool = await this.loadNgramPool(this.getBasePath());
            if (seq !== this._loadSeq) return this._latestLoad;

            this.words = pool.words;
            this.bigrams = pool.bigrams;
            this.trigrams = pool.trigrams;
            this.tetragrams = pool.tetragrams;

            this._allowedBigramsSet = pool.bigramsSet;
            this._allowedTrigramsSet = pool.trigramsSet;
            this._allowedTetragramsSet = pool.tetragramsSet;

            this.currentTestStaging = {};
            this.resetCurrentPhraseMetrics();
            this.refreshPhrases();
        },

        loadNgramPool(basePath) {
            let pending = this._poolCache.get(basePath);
            if (!pending) {
                pending = Promise.all([
                    this.fetchRawList(`${basePath}words.txt`, null, MAX_SCOPE),
                    this.fetchRawList(`${basePath}2grams.txt`, 2, NGRAM_POOL_SIZE),
                    this.fetchRawList(`${basePath}3grams.txt`, 3, NGRAM_POOL_SIZE),
                    this.fetchRawList(`${basePath}4grams.txt`, 4, NGRAM_POOL_SIZE)
                ]).then(([words, raw2, raw3, raw4]) => {
                    if (!words.length || !raw2.length || !raw3.length || !raw4.length) {
                        this._poolCache.delete(basePath);
                    }
                    return Object.assign({ words: Object.freeze(words) }, buildNgramPyramid(raw2, raw3, raw4));
                });
                this._poolCache.set(basePath, pending);
            }
            return pending;
        },

        loadFullWordList(basePath) {
            if (this._fullWordList.path !== basePath) {
                const pending = this.fetchRawList(`${basePath}words.txt`, null);
                this._fullWordList = { path: basePath, pending };
                pending.then(list => {
                    if (!list.length && this._fullWordList.pending === pending) {
                        this._fullWordList = { path: null, pending: null };
                    }
                });
            }
            return this._fullWordList.pending;
        },

        async fetchRawList(filePath, expectedLength = null, limit = Infinity) {
            try {
                const response = await fetch(filePath);
                if (!response.ok) return [];

                const list = [];
                const addLine = (rawLine) => {
                    const token = parseTokenLine(rawLine, expectedLength);
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
                // Prune large runtime-generated phrase arrays before serializing to localStorage
                const dataToSave = { ...this.data };
                for (const src of ['bigrams', 'trigrams', 'tetragrams', 'words', 'custom_words']) {
                    if (dataToSave[src]) {
                        const { phrases, ...rest } = dataToSave[src];
                        dataToSave[src] = rest;
                    }
                }
                safeStorage.set('ngramTypeAppdata', dataToSave);
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

            // Safeguard: Preserve existing active drill phrases when in custom_words mode
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

            // Deterministic catch-up loop: Handles multi-character bursts or rapid typing
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
            const wordLen = word.length;
            const boundedDuration = Math.max(120, Math.min(4500, duration));

            this.stageNgramSample(word, wordLen, boundedDuration, hadError);

            if (wordLen === 4) {
                const subTriTime = Math.round(boundedDuration * 0.75);
                this.stageNgramSample(word.substring(0, 3), 3, subTriTime, hadError);
                this.stageNgramSample(word.substring(1, 4), 3, subTriTime, hadError);

                const subBiTime = Math.round(boundedDuration * 0.5);
                this.stageNgramSample(word.substring(0, 2), 2, subBiTime, hadError);
                this.stageNgramSample(word.substring(1, 3), 2, subBiTime, hadError);
                this.stageNgramSample(word.substring(2, 4), 2, subBiTime, hadError);
            } else if (wordLen === 3) {
                const subBiTime = Math.round(boundedDuration * 0.65);
                this.stageNgramSample(word.substring(0, 2), 2, subBiTime, hadError);
                this.stageNgramSample(word.substring(1, 3), 2, subBiTime, hadError);
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
            // Note: currentTestStaging is preserved to maintain cumulative retry weighting
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
            this.weakStatsData = normalizeWeakStats(safeStorage.get(key, null)) || emptyWeakStats();
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
                    this.$set(ngrams, ngram, { len: staged.len, samples: [] });
                    target = ngrams[ngram];
                }

                target.samples.push(...staged.samples);

                if (target.samples.length > MAX_SAMPLES_PER_NGRAM) {
                    target.samples = target.samples.slice(-MAX_SAMPLES_PER_NGRAM);
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

            for (const [ngram, item] of Object.entries(ngrams)) {
                const samples = item.samples || [];
                const count = samples.length;

                if (item.len === len && count >= 1 && this.isAllowedPyramidNgram(ngram, len)) {
                    let sumTime = 0;
                    let errorCount = 0;

                    for (let i = 0; i < count; i++) {
                        sumTime += samples[i].time;
                        if (samples[i].hadError) errorCount++;
                    }

                    const avg = sumTime / count;
                    const rawErrRate = errorCount / count;

                    // Empirical Laplace smoothing prevents low-sample flukes from dominating ranking
                    const smoothedErrRate = errorCount / (count + 2);
                    const score = Math.round(avg * (1 + (smoothedErrRate * 2.5)));

                    const barPct = Math.min(100, Math.max(15, Math.round((score / 550) * 100)));
                    let barColor = '#10b981';
                    if (score > 220 || rawErrRate > 0.10) barColor = '#f59e0b';
                    if (score > 340 || rawErrRate > 0.25) barColor = '#ef4444';

                    list.push({
                        ngram,
                        avgTime: Math.round(avg),
                        errorRate: Math.round(rawErrRate * 100),
                        errors: errorCount,
                        count,
                        score,
                        barPct,
                        barColor,
                        confirmed: count >= MIN_CONFIRMED_SAMPLES
                    });
                }
            }
            list.sort((a, b) => (b.confirmed - a.confirmed) || (b.score - a.score));
            return list;
        },

        refreshWeakStats() {
            this.weakBigrams = this.getRankedNgramList(2);
            this.weakTrigrams = this.getRankedNgramList(3);
            this.weakTetragrams = this.getRankedNgramList(4);
        },

        resetLanguageWeakStats() {
            const label = `${this.readableCorpusName} (${this.currentLangCode.toUpperCase()})`;
            if (confirm(`Reset all weakness data for ${label}?`)) {
                this.weakStatsData = emptyWeakStats();
                this.currentTestStaging = {};
                safeStorage.remove(this.getWeakStorageKey(this.currentProfileId, this.currentLangCode));
                this.refreshWeakStats();
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

        async startWeaknessDrill() {
            if (this._drillStarting) return;
            this._drillStarting = true;

            try {
                this.refreshWeakStats();
                const list = this.activeWeakList;
                if (!list.length) return;

                const selected = list.slice(0, this.drillScope).map(item => item.ngram);
                const ds = this.data[this.data.source];
                const comb = Math.max(1, ds.combination || 2);
                const rep = Math.max(1, ds.repetition || 3);
                const generatedPhrases = [];

                if (this.drillMode === 'sandwich') {
                    // SANDWICH DRILL: Strict Anchor -> Target Ngram -> Anchor rhythm
                    const anchors = this.getLanguageAnchorWords();
                    let anchorIdx = 0;

                    for (let i = 0; i < selected.length; i += comb) {
                        const chunk = selected.slice(i, i + comb);
                        const unitTokens = [];

                        for (const ng of chunk) {
                            const anchor = anchors[anchorIdx % anchors.length];
                            anchorIdx++;
                            const hasCaps = CAPS_REGEX.test(ng);
                            unitTokens.push(hasCaps ? anchor.toUpperCase() : anchor.toLowerCase());
                            unitTokens.push(ng);
                        }

                        // Closing anchor ensures symmetric rhythm wrapping
                        const closingAnchor = anchors[anchorIdx % anchors.length];
                        anchorIdx++;
                        unitTokens.push(closingAnchor);

                        const singleUnit = unitTokens.join(' ');
                        const fullPhrase = new Array(rep).fill(singleUnit).join(' ');
                        generatedPhrases.push(fullPhrase);
                    }

                } else if (this.drillMode === 'ladder') {
                    // LADDER DRILL: Progressive lexical ladder (Target -> Short -> Medium -> Long)
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
                    // CLASSIC DRILL: Direct repetition of target n-grams
                    for (let i = 0; i < selected.length; i += comb) {
                        const chunk = selected.slice(i, i + comb);
                        const singleUnit = chunk.join(' ');
                        const fullPhrase = new Array(rep).fill(singleUnit).join(' ');
                        generatedPhrases.push(fullPhrase);
                    }
                }

                // Lock watcher to prevent race condition when transitioning to custom_words
                this._suppressSourceWatcher = true;
                this.data.source = 'custom_words';

                this.data.custom_words.phrases = generatedPhrases;
                this.data.custom_words.phrasesCurrentIndex = 0;
                this.expectedPhrase = generatedPhrases[0] || '';
                if (this.expectedPhrase) {
                    this.buildPhraseWordRanges(this.expectedPhrase);
                }
                this.resetCurrentPhraseMetrics();
                this.pauseTimer();
                this.save();

                $('#weakness-modal').modal('hide');

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

        buildLadderWords(selected, wordPool) {
            // Clean dictionary pool: top 4,000 words only, zero digits allowed
            const cleanPool = [];
            const maxCandidates = Math.min(4000, wordPool.length);
            for (let i = 0; i < maxCandidates; i++) {
                const w = wordPool[i];
                if (!w || /\d/.test(w) || w.length < 2) continue;
                cleanPool.push(w);
            }

            const ladders = [];

            for (const ng of selected) {
                const ladder = [ng]; // Step 0: The n-gram itself

                // Only treat as attached punctuation if it's true clause-ending punctuation (e.g. "e," or "t.")
                // Apostrophes (') and hyphens (-) are contractions / elisions and belong inside real words (e.g., d'un, l'Union).
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
                    // Strip terminal clause punctuation from candidate word if already present in corpus
                    const cleanCandidate = candidate.replace(TERMINAL_CLAUSE_REGEX, '');
                    const cLower = cleanCandidate.toLowerCase();

                    // Candidate must not be identical to the target n-gram
                    if (cLower === rootLower || cLower === ngLower) continue;

                    let matches = false;
                    let wordToAdd = '';

                    if (hasTerminalPunct) {
                        // For n-grams ending with clause punctuation (e.g., "e," or "t."):
                        // The candidate word MUST end with rootNg so that candidate + attachedPunct actually contains ng!
                        if (cLower.endsWith(rootLower)) {
                            matches = true;
                            wordToAdd = cleanCandidate + attachedPunct;
                        }
                    } else {
                        // For standard n-grams (e.g., "d'", "th", "'u", "tion"):
                        // The candidate word must contain the exact n-gram!
                        if (cLower.includes(ngLower)) {
                            matches = true;
                            wordToAdd = cleanCandidate;
                        }
                    }

                    if (!matches) continue;

                    const len = cleanCandidate.length;

                    // Step 1: Short word (3-4 characters)
                    if (!shortWord && len >= 3 && len <= 4) {
                        shortWord = wordToAdd;
                    }
                    // Step 2: Medium word (5-6 characters)
                    else if (!medWord && len >= 5 && len <= 6) {
                        medWord = wordToAdd;
                    }
                    // Step 3: Long word (7-9 characters)
                    else if (!longWord && len >= 7 && len <= 9) {
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