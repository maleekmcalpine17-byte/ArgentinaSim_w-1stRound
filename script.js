// Argentina Runoff Game - browser port of the Election Game 2024 model, rebuilt for Argentina's second round (ballotage).
//
// Differences from the US game: there is no Electoral College. The president is elected by national popular vote,
// so each province contributes its actual votes and the winner is whoever gets more votes nationwide.
//   Candidate 1 = the non-Peronist side (Macri 2015, Milei 2023)   margin > 0 means NP
//   Candidate 2 = the Peronist side     (Scioli 2015, Massa 2023)   margin < 0 means PJ
// The 2003/2007/2011 presets are first-round head-to-heads of the top two candidates, using the same convention.

// ---------- Provinces ----------
// Issue stances (1-10) are rough estimates, like the original game's, and are editable in the Province Settings panel.
//   economy:        1 = minimal state / free market,   10 = strong state / interventionist
//   security:       1 = rights-first / lenient,        10 = mano dura / tough on crime
//   peronism:       1 = strongly anti-Peronist,        10 = strongly Peronist
//   abortion:       1 = pro-life,                      10 = pro-choice
//   foreign_policy: 1 = non-aligned / regional bloc,   10 = aligned with the US and the West
// `pvi` and `voters` are filled in below from the runoff results in elections.js.
const PROVINCES = {
  "Buenos Aires Province":    { economy: 6, security: 6, peronism: 6, abortion: 7, foreign_policy: 4 },
  "Buenos Aires City (CABA)": { economy: 4, security: 6, peronism: 3, abortion: 9, foreign_policy: 6 },
  "Córdoba":                  { economy: 3, security: 7, peronism: 3, abortion: 5, foreign_policy: 7 },
  "Santa Fe":                 { economy: 4, security: 8, peronism: 4, abortion: 6, foreign_policy: 6 },
  "Mendoza":                  { economy: 3, security: 7, peronism: 3, abortion: 5, foreign_policy: 7 },
  "Tucumán":                  { economy: 7, security: 6, peronism: 7, abortion: 3, foreign_policy: 4 },
  "Entre Ríos":               { economy: 4, security: 7, peronism: 4, abortion: 5, foreign_policy: 6 },
  "Salta":                    { economy: 5, security: 6, peronism: 5, abortion: 2, foreign_policy: 5 },
  "Misiones":                 { economy: 5, security: 5, peronism: 6, abortion: 3, foreign_policy: 3 },
  "Chaco":                    { economy: 6, security: 6, peronism: 6, abortion: 3, foreign_policy: 5 },
  "Corrientes":               { economy: 5, security: 6, peronism: 5, abortion: 2, foreign_policy: 5 },
  "Santiago del Estero":      { economy: 9, security: 4, peronism: 9, abortion: 3, foreign_policy: 3 },
  "Jujuy":                    { economy: 5, security: 7, peronism: 4, abortion: 3, foreign_policy: 5 },
  "Río Negro":                { economy: 5, security: 6, peronism: 5, abortion: 6, foreign_policy: 5 },
  "San Juan":                 { economy: 5, security: 6, peronism: 5, abortion: 3, foreign_policy: 5 },
  "Neuquén":                  { economy: 4, security: 6, peronism: 4, abortion: 6, foreign_policy: 5 },
  "Formosa":                  { economy: 9, security: 4, peronism: 9, abortion: 3, foreign_policy: 2 },
  "Chubut":                   { economy: 4, security: 7, peronism: 4, abortion: 6, foreign_policy: 5 },
  "San Luis":                 { economy: 3, security: 7, peronism: 3, abortion: 4, foreign_policy: 6 },
  "Catamarca":                { economy: 7, security: 5, peronism: 6, abortion: 3, foreign_policy: 4 },
  "La Rioja":                 { economy: 8, security: 4, peronism: 8, abortion: 4, foreign_policy: 3 },
  "La Pampa":                 { economy: 6, security: 5, peronism: 6, abortion: 7, foreign_policy: 4 },
  "Santa Cruz":               { economy: 6, security: 6, peronism: 6, abortion: 6, foreign_policy: 4 },
  "Tierra del Fuego":         { economy: 6, security: 5, peronism: 6, abortion: 7, foreign_policy: 4 },
};

const deepCopy = (o) => JSON.parse(JSON.stringify(o));

// ---------- Election presets ----------
// ELECTIONS comes from elections.js: real province margins and votes for the 2015 and 2023 runoffs, plus the head-to-head
// of the two first-round leaders in 2011, 2007 and 2003 (there was no runoff in those years).
const ELECTION_DATA = typeof ELECTIONS !== "undefined" ? ELECTIONS : (typeof require !== "undefined" ? require("./elections.js") : {});
const ELECTION_KEYS = Object.keys(ELECTION_DATA).sort((a, b) => b - a);   // newest first
// Only real runoffs feed the "Current day" lean; the earlier first-round head-to-heads are presets of their own.
const isRunoff = (k) => (ELECTION_DATA[k].kind || "runoff") === "runoff";
const RUNOFF_KEYS = ELECTION_KEYS.filter(isRunoff);   // newest first
let currentPreset = "current";

// "Current day" lean: like a Cook PVI. For each runoff take (province margin - national margin) / 2, then average the
// runoffs. Voter weights are the 2023 runoff votes (the newest data). Positive = non-Peronist, negative = Peronist.
function buildCurrentStates() {
  const out = deepCopy(PROVINCES);
  const newest = ELECTION_DATA[RUNOFF_KEYS[0]];
  for (const name of Object.keys(out)) {
    const devs = RUNOFF_KEYS.map((k) => (ELECTION_DATA[k].states[name][1] - ELECTION_DATA[k].nationalMargin) / 2);
    out[name].pvi = Math.round((devs.reduce((a, b) => a + b, 0) / devs.length) * 10) / 10;
    out[name].voters = newest.states[name][0];
  }
  return out;
}
const CURRENT_STATES = buildCurrentStates();
// Baseline for the selected preset: the margin model measures province-setting edits against this.
let DEFAULT_STATES = deepCopy(CURRENT_STATES);
// Working copy that the Province Settings panel edits.
let currentStates = deepCopy(CURRENT_STATES);

// ---------- Scenario presets (not real elections) ----------
// "2001 Shift": a hypothetical, province-by-province political map. pvi: positive = non-Peronist, negative = Peronist.
// Format per province: [pvi, economy, security, peronism, abortion, foreign_policy]. Voters use the newest runoff turnout.
const SCENARIOS = {
  "2001shift": {
    label: "2001 Shift (hypothetical scenario)",
    note: "2001 Shift: a hypothetical scenario where dollarization holds and the anti-Peronist Alianza coalition keeps the " +
          "upper hand. Buenos Aires Province, CABA and Córdoba swing hard toward the non-Peronists, while the Peronist machines of " +
          "Formosa, Santiago del Estero and La Rioja stay firmly in place, and the energy provinces resent the new federal taxes. " +
          `Every province has its own PVI and stances, with ${ELECTION_KEYS[0]} runoff turnout. Pick any two candidates by moving the sliders.`,
    states: {
      "Buenos Aires Province":    [ 13.2, 6, 6, 6, 7, 4],
      "Buenos Aires City (CABA)": [ 18.5, 3, 5, 2, 8, 8],
      "Catamarca":                [ -3.0, 7, 6, 6, 3, 3],
      "Chaco":                    [ -6.5, 8, 6, 7, 3, 3],
      "Chubut":                   [  2.0, 5, 6, 5, 6, 5],
      "Córdoba":                  [ 15.5, 3, 7, 2, 4, 7],
      "Corrientes":               [  5.0, 5, 7, 4, 2, 4],
      "Entre Ríos":               [  4.5, 4, 6, 4, 5, 5],
      "Formosa":                  [-14.0, 9, 8, 9, 2, 2],
      "Jujuy":                    [ -4.0, 7, 7, 6, 3, 3],
      "La Pampa":                 [ -2.5, 6, 5, 6, 5, 4],
      "La Rioja":                 [ -9.5, 8, 6, 8, 2, 4],
      "Mendoza":                  [  9.0, 4, 6, 3, 5, 6],
      "Misiones":                 [ -1.5, 5, 6, 5, 3, 4],
      "Neuquén":                  [  1.0, 5, 6, 4, 6, 5],
      "Río Negro":                [  3.5, 5, 5, 4, 6, 5],
      "Salta":                    [ -5.5, 7, 7, 7, 2, 3],
      "San Juan":                 [ -3.5, 6, 6, 6, 2, 4],
      "San Luis":                 [ -8.0, 6, 7, 8, 3, 4],
      "Santa Cruz":               [ -7.5, 8, 5, 8, 5, 2],
      "Santa Fe":                 [  4.0, 4, 7, 4, 6, 5],
      "Santiago del Estero":      [-15.0, 9, 8, 9, 2, 2],
      "Tierra del Fuego":         [ -2.0, 7, 5, 6, 6, 4],
      "Tucumán":                  [ -5.0, 7, 7, 7, 2, 3],
    },
  },
};
const SCENARIO_KEYS = Object.keys(SCENARIOS);

const fmtVotes = (n) => Math.round(n).toLocaleString("en-US");

// Returns the provinces, environment and candidate names for a preset.
// For a real runoff each province's PVI is (province margin - national environment) / 2, so with typical candidates
// and equal approval every province lands exactly on its real margin (see the margin model below).
function presetData(key) {
  if (SCENARIOS[key]) {
    const sc = SCENARIOS[key];
    const states = deepCopy(CURRENT_STATES);   // keeps the 2023 runoff turnout as voters
    for (const name of Object.keys(states)) {
      const [pvi, economy, security, peronism, abortion, foreign_policy] = sc.states[name];
      Object.assign(states[name], { pvi, economy, security, peronism, abortion, foreign_policy });
    }
    return { states, env: 0, c1: "", c2: "", real: null, note: sc.note };
  }
  if (key === "current" || !ELECTION_DATA[key]) {
    return {
      states: deepCopy(CURRENT_STATES), env: 0, c1: "", c2: "", real: null,
      note: `Current day: every province starts at its average lean over the ${RUNOFF_KEYS.slice().reverse().join(" and ")} runoffs ` +
            `(province margin minus national margin, halved, like a Cook PVI) with the ${RUNOFF_KEYS[0]} runoff turnout. ` +
            `Pick any two candidates by moving the sliders.`,
    };
  }
  const e = ELECTION_DATA[key];
  const states = {};
  for (const name of Object.keys(PROVINCES)) {
    const [votes, margin] = e.states[name];
    const s = deepCopy(PROVINCES[name]);
    s.voters = votes;
    s.pvi = (margin - e.environment) / 2;
    states[name] = s;
  }
  const note = isRunoff(key)
    ? `${e.year} runoff (${e.date}): ${e.c1} (${e.c1Party}) vs. ${e.c2} (${e.c2Party}). First round: ${e.firstRound}. ` +
      `Every province starts at its real result and number of votes. Candidates start at a typical profile with equal ` +
      `approval, so running it as-is reproduces the real result. Move the sliders to ask "what if". Turnout stays fixed.`
    : `${e.year} first round (${e.date}), no runoff: the head-to-head of the two leaders, ${e.c1} (${e.c1Party}) vs. ${e.c2} ` +
      `(${e.c2Party}). First round: ${e.firstRound}. ` +
      (e.year === 2003 ? `Both were Peronists (Menem withdrew before the scheduled runoff), so here "Candidate 1" is simply the more market-oriented ` +
        `side and the NP/PJ labels just mean Candidate 1 / Candidate 2. ` : "") +
      `Only these two candidates' votes count (everyone else is left out), so each province starts at its real split between them. ` +
      `Candidates start at a typical profile with equal approval, so running it as-is reproduces that split. Turnout stays fixed.`;
  return { states, env: e.environment, c1: e.c1, c2: e.c2, real: e, note };
}

// ---------- Margin model ----------
// margin (NP minus PJ, in percentage points of the positive votes)
//   = national environment + national swing from approval
//   + 2 x province PVI
//   + POINTS_TO_MARGIN x (how much better Candidate 1 fits the province than Candidate 2,
//                         compared with a typical non-Peronist vs. a typical Peronist,
//                         including a HOME_STATE_BONUS in each candidate's home province)
// With both candidates at the "typical" profile and equal approval, every province lands on 2 x its PVI.
const TYPICAL_NP = { economy: 3, security: 8, peronism: 2, abortion: 3, foreign_policy: 7 };
const TYPICAL_PJ = { economy: 8, security: 4, peronism: 8, abortion: 8, foreign_policy: 3 };
const HOME_STATE_BONUS = 4;       // issue-score points a candidate gains in their home province
const POINTS_TO_MARGIN = 0.5;     // margin points per issue-score point
const PVI_TO_MARGIN = 2;          // margin points per PVI point (PVI is a vote-share lean, margin lean is double)
const APPROVAL_TO_MARGIN = 0.25;  // national margin points per point of approval gap (Candidate 1 minus Candidate 2)

const STATE_FIELDS = [
  { key: "economy", label: "Economy (1: free market, 10: strong state)" },
  { key: "security", label: "Security (1: rights-first, 10: mano dura)" },
  { key: "peronism", label: "Peronism (1: anti-Peronist, 10: Peronist)" },
  { key: "abortion", label: "Abortion (1: pro-life, 10: pro-choice)" },
  { key: "foreign_policy", label: "Foreign policy (1: non-aligned, 10: pro-US/West)" },
];
const PVI_MIN = -60, PVI_MAX = 60;

// Round half up to 3 decimals, so razor-thin margins keep their winner.
const roundM = (x) => Math.floor(x * 1000 + 0.5) / 1000;
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const fmtPvi = (n) => (n === 0 ? "EVEN" : (n > 0 ? "NP+" : "PJ+") + fmtNum(Math.abs(n)));
const fmtMargin = (m) => {
  if (m === 0) return "EVEN";
  const digits = Math.abs(m) < 0.1 ? 2 : 1;
  const shown = Math.floor(Math.abs(m) * 10 ** digits + 0.5) / 10 ** digits;   // round half up
  return (m > 0 ? "NP+" : "PJ+") + shown.toFixed(digits);
};

function issueScore(attrs, c) {
  let s = 0;
  s += 10 - Math.abs(attrs.economy - c.economy);
  s += 10 - Math.abs(attrs.security - c.security);
  s += 5 - Math.abs(attrs.peronism - c.peronism);
  s += 10 - Math.abs(attrs.abortion - c.abortion);
  s += 10 - Math.abs(attrs.foreign_policy - c.foreign_policy);
  return s;
}

const approvalSwing = (a1, a2) => APPROVAL_TO_MARGIN * (a1 - a2);

// Signed margin in points: positive = Candidate 1 (non-Peronist), negative = Candidate 2 (Peronist).
function stateMargin(attrs, name, c1, c2, nationalSwing) {
  const base = DEFAULT_STATES[name];
  const reference = issueScore(base, TYPICAL_NP) - issueScore(base, TYPICAL_PJ);
  let fit = issueScore(attrs, c1) - issueScore(attrs, c2);
  if (c1.home && c1.home === name) fit += HOME_STATE_BONUS;
  if (c2.home && c2.home === name) fit -= HOME_STATE_BONUS;
  const m = nationalSwing + PVI_TO_MARGIN * attrs.pvi + POINTS_TO_MARGIN * (fit - reference);
  return roundM(Math.max(-100, Math.min(100, m)));
}

// rng, stateData and environment are injectable for testing; they default to Math.random,
// the edited provinces and an EVEN national environment.
// Each province's votes are split by its margin, and the national winner is whoever gets more votes in total.
function simulate(c1, c2, rng = Math.random, stateData = currentStates, environment = 0) {
  const approval = approvalSwing(c1.approval, c2.approval);
  const swing = environment + approval;
  let votes1 = 0, votes2 = 0, won1 = 0, won2 = 0;
  const results = [];
  for (const [state, attrs] of Object.entries(stateData)) {
    const n = attrs.voters;
    const signed = stateMargin(attrs, state, c1, c2, swing);
    let winner, tie = false;
    if (signed > 0) winner = 1;
    else if (signed < 0) winner = 2;
    else { tie = true; winner = rng() < 0.5 ? 1 : 2; }
    const v1 = n * (100 + signed) / 200, v2 = n - v1;
    votes1 += v1; votes2 += v2;
    if (winner === 1) won1++; else won2++;
    results.push({ state, n, v1, v2, signed, margin: Math.abs(signed), winner, tie });
  }
  const closest = results.slice().sort((a, b) => a.margin - b.margin).slice(0, 3);
  const total = votes1 + votes2;
  const nationalMargin = total ? roundM(100 * (votes1 - votes2) / total) : 0;
  return { results, closest, votes1, votes2, won1, won2, total, nationalMargin, swing, environment, approval };
}

// ---------- First round (multi-candidate) ----------
// The runoff model above is strictly head-to-head. The first round has any number of candidates, so it uses a
// multinomial-logit model: every candidate gets a strength ("utility") in every province and the vote shares are the
// softmax of those strengths. For the real elections each candidate starts at ln(real provincial share), so with their
// real profile, equal approval and a neutral environment the model reproduces the real first round exactly. Changes
// move that strength:
//   utility = baseline
//           + R1_FIT      x (issue fit now - issue fit at the starting profile)        [issue sliders, province stances]
//           + R1_LEAN     x (province PVI x how non-Peronist the candidate is, now - at the start)
//           + R1_APPROVAL x (approval - 50)
//           + R1_HOME     if it is the candidate's home province
//           + R1_ENV/... x national environment x how non-Peronist the candidate is
// An added candidate has no real baseline: in a real election it starts at the average strength of the field in each
// province (the geometric mean of the others' shares), so an "average" newcomer takes an average slice; in the scenario
// presets it starts from the province's lean at its profile, less a newcomer penalty. "Others" is a fixed bucket.
// The per-point sizes are the runoff model's, in log-odds (1 margin point is about 0.02 log-odds), about doubled.
const R1_FIT = 0.02;          // log-odds per issue-score point
const R1_LEAN = 0.03;         // log-odds per PVI point for a fully (non-)Peronist candidate
const R1_APPROVAL = 0.01;     // log-odds per approval point above/below 50
const R1_HOME = 0.08;         // log-odds in the candidate's home province (4 issue-score points)
const R1_ENV = 0.01;          // log-odds per environment margin point for a fully (non-)Peronist candidate
const R1_NEW_ENTRANT = 1.5;   // scenario presets: log-odds a newcomer starts behind a main candidate (one newcomer then draws about 10%)
const R1_MAX_CANDIDATES = 8;
const R1_MIN_CANDIDATES = 2;
const MID_PROFILE = { economy: 5, security: 5, peronism: 5, abortion: 5, foreign_policy: 5 };
const AXES = ["economy", "security", "peronism", "abortion", "foreign_policy"];
const toProfile = (a) => ({ economy: a[0], security: a[1], peronism: a[2], abortion: a[3], foreign_policy: a[4] });
// 1 = hardline anti-Peronist ... 10 = hardline Peronist  ->  +1 ... -1
const nonPeronism = (peronism) => (5.5 - peronism) / 4.5;

// Starting profiles of the real candidates: [economy, security, peronism, abortion, foreign policy], same 1-10 scales as
// the sliders. Rough estimates by the author, like the province stances; edit them freely.
const R1_PROFILES = {
  2023: { "Javier Milei": [1, 9, 2, 1, 9], "Sergio Massa": [7, 5, 8, 8, 4], "Patricia Bullrich": [3, 9, 2, 4, 8],
          "Juan Schiaretti": [5, 7, 5, 5, 5], "Myriam Bregman": [10, 3, 3, 10, 1] },
  2015: { "Mauricio Macri": [3, 7, 2, 5, 8], "Daniel Scioli": [7, 6, 8, 5, 4], "Sergio Massa": [5, 7, 5, 5, 6],
          "Nicolás del Caño": [10, 3, 3, 10, 1], "Margarita Stolbizer": [5, 4, 2, 8, 5] },
  2011: { "Hermes Binner": [6, 4, 2, 8, 4], "Cristina Fernández de Kirchner": [8, 4, 9, 6, 3],
          "Ricardo Alfonsín": [4, 5, 2, 6, 6], "Alberto Rodríguez Saá": [6, 7, 7, 3, 4], "Eduardo Duhalde": [5, 7, 7, 4, 5] },
  2007: { "Elisa Carrió": [4, 6, 1, 2, 7], "Cristina Fernández de Kirchner": [7, 5, 9, 6, 4],
          "Roberto Lavagna": [5, 5, 5, 5, 5], "Alberto Rodríguez Saá": [6, 7, 7, 3, 4] },
  2003: { "Carlos Menem": [2, 8, 8, 3, 9], "Néstor Kirchner": [7, 5, 9, 6, 3], "Ricardo López Murphy": [1, 8, 1, 4, 9],
          "Adolfo Rodríguez Saá": [6, 7, 8, 3, 4], "Elisa Carrió": [4, 5, 1, 3, 5] },
};
const R1_COLORS = {
  2023: { "Javier Milei": "#8e5bd6", "Sergio Massa": "#2f9bd6", "Patricia Bullrich": "#d9a400", "Juan Schiaretti": "#2fa35a", "Myriam Bregman": "#d64545" },
  2015: { "Mauricio Macri": "#d9a400", "Daniel Scioli": "#2f9bd6", "Sergio Massa": "#1fb5a6", "Nicolás del Caño": "#d64545", "Margarita Stolbizer": "#e07aa0" },
  2011: { "Hermes Binner": "#e07aa0", "Cristina Fernández de Kirchner": "#2f9bd6", "Ricardo Alfonsín": "#e0553f", "Alberto Rodríguez Saá": "#8e5bd6", "Eduardo Duhalde": "#2fa35a" },
  2007: { "Elisa Carrió": "#d9a400", "Cristina Fernández de Kirchner": "#2f9bd6", "Roberto Lavagna": "#2fa35a", "Alberto Rodríguez Saá": "#8e5bd6" },
  2003: { "Carlos Menem": "#e07a2f", "Néstor Kirchner": "#2f9bd6", "Ricardo López Murphy": "#d9a400", "Adolfo Rodríguez Saá": "#8e5bd6", "Elisa Carrió": "#2fa35a" },
};
const EXTRA_COLORS = ["#8e5bd6", "#2fa35a", "#e07a2f", "#e07aa0", "#1fb5a6", "#5a6dd6", "#a0522d", "#d64545"];
const OTHERS_COLOR = "#8a93a6";
const SHORT_NAMES = { "Cristina Fernández de Kirchner": "Fernández de Kirchner", "Alberto Rodríguez Saá": "Rodríguez Saá",
  "Adolfo Rodríguez Saá": "Rodríguez Saá", "Ricardo López Murphy": "López Murphy", "Nicolás del Caño": "del Caño" };
const shortName = (n) => SHORT_NAMES[n] || n.split(" ").slice(-1)[0];

// A candidate "spec" is what stays fixed while the sliders move:
//   { id, name, party, color, ref: starting profile, baseKind: "preset" | "mean" | "lean", idx, newEntrant, home }
// `setup` holds the real baselines: { logBase: {province: [ln share per preset candidate]}, logOthers, meanBase, hasBase }.
// Returns the starting point of a first-round preset ("current", a scenario, or a real election year).
function r1Preset(key) {
  const e = ELECTION_DATA[key];
  const base = presetData(key);                          // provinces: stances, PVI (and the runoff turnout, replaced below)
  if (e && e.round1) {
    const r = e.round1, n = r.candidates.length;
    const states = deepCopy(base.states), logBase = {}, logOthers = {}, meanBase = {};
    for (const name of Object.keys(PROVINCES)) {
      const row = r.states[name], valid = row[0];
      states[name].voters = valid;
      logBase[name] = r.candidates.map((_, i) => Math.log(Math.max(row[i + 1], 0.5) / valid));
      if (r.others) logOthers[name] = Math.log(Math.max(row[n + 1], 0.5) / valid);
      meanBase[name] = logBase[name].reduce((a, b) => a + b, 0) / n;
    }
    const specs = r.candidates.map((c, i) => ({
      id: i, name: c.name, party: c.party, color: (R1_COLORS[e.year] || {})[c.name] || EXTRA_COLORS[i % EXTRA_COLORS.length],
      ref: toProfile((R1_PROFILES[e.year] || {})[c.name] || [5, 5, 5, 5, 5]), baseKind: "preset", idx: i, newEntrant: false, home: "",
    }));
    const mean = (k) => Math.round(specs.reduce((a, s) => a + s.ref[k], 0) / specs.length);
    const newProfile = Object.fromEntries(AXES.map((k) => [k, mean(k)]));
    const shares = r.candidates.map((c, i) => `${shortName(c.name)} ${(100 * Object.keys(PROVINCES).reduce((a, p) => a + r.states[p][i + 1], 0) /
      Object.keys(PROVINCES).reduce((a, p) => a + r.states[p][0], 0)).toFixed(2)}%`);
    const note = `${e.year} first round (${e.date}): ${r.candidates.map((c) => `${c.name} (${c.party})`).join(", ")}` +
      (r.others ? ", and all other candidates together as a fixed \"Others\" bucket" : "") + `. Real result: ${shares.join(", ")}. ` +
      `Every province starts at its real shares and number of votes, and each candidate starts at an estimated profile with equal ` +
      `approval, so running it as-is reproduces the real first round. Move the sliders to ask "what if", or add a candidate: a ` +
      `newcomer starts at the average strength of the field. To win outright a candidate needs 45%, or 40% and a lead of more than ` +
      `10 points; otherwise the top two go to a runoff, projected here with transferred votes. Turnout stays fixed.`;
    return { states, env: 0, specs, newProfile, setup: { logBase, logOthers: r.others ? logOthers : null, meanBase, hasBase: true },
             note, real: e };
  }
  // No real first round: scenarios and "Current day" start with two typical candidates; every candidate is a newcomer.
  const states = deepCopy(base.states);
  const specs = [
    { id: 0, name: "", party: "Non-Peronist", color: "#d9a400", ref: deepCopy(TYPICAL_NP), baseKind: "lean", idx: -1, newEntrant: false, home: "" },
    { id: 1, name: "", party: "Peronist", color: "#2f9bd6", ref: deepCopy(TYPICAL_PJ), baseKind: "lean", idx: -1, newEntrant: false, home: "" },
  ];
  const note = `${base.note.split(" Pick any two")[0]} Two typical candidates start here (a non-Peronist and a Peronist); use "+ Add candidate" ` +
    `to add more. Province lean (PVI) pushes each candidate according to how Peronist or non-Peronist they are, issue fit and approval do the rest. ` +
    `To win outright a candidate needs 45%, or 40% and a lead of more than 10 points; otherwise the top two go to a runoff, projected with transferred votes.`;
  return { states, env: 0, specs, newProfile: deepCopy(MID_PROFILE), setup: { logBase: null, logOthers: null, meanBase: null, hasBase: false },
           note, real: null };
}

function r1Baseline(spec, name, setup, defaults) {
  if (spec.baseKind === "preset") return setup.logBase[name][spec.idx];
  if (spec.baseKind === "mean") return setup.meanBase[name];
  return R1_LEAN * defaults[name].pvi * nonPeronism(spec.ref.peronism) - (spec.newEntrant ? R1_NEW_ENTRANT : 0);
}

// cands: [{ ...spec, economy, security, peronism, abortion, foreign_policy, approval, home }] in the order shown on screen.
// Returns per-province shares, the national totals and each candidate's districts won.
function simulateRound1(cands, stateData = currentStates, environment = 0, setup = null, defaults = DEFAULT_STATES) {
  const n = cands.length;
  let others = 0;
  const totals = new Array(n).fill(0), won = new Array(n).fill(0);
  const results = [];
  for (const [name, attrs] of Object.entries(stateData)) {
    const base = defaults[name];
    const u = cands.map((c) => r1Baseline(c, name, setup, defaults)
      + R1_FIT * (issueScore(attrs, c) - issueScore(base, c.ref))
      + R1_LEAN * (attrs.pvi * nonPeronism(c.peronism) - base.pvi * nonPeronism(c.ref.peronism))
      + R1_APPROVAL * (c.approval - 50)
      + (c.home && c.home === name ? R1_HOME : 0)
      + R1_ENV * environment * nonPeronism(c.peronism));
    const uo = setup && setup.logOthers ? setup.logOthers[name] : null;
    const m = Math.max(...u, uo === null ? -Infinity : uo);
    const e = u.map((x) => Math.exp(x - m)), eo = uo === null ? 0 : Math.exp(uo - m);
    const z = e.reduce((a, b) => a + b, 0) + eo;
    const shares = e.map((x) => x / z), otherShare = eo / z;
    const votes = shares.map((s) => attrs.voters * s), otherVotes = attrs.voters * otherShare;
    const order = shares.map((s, i) => i).sort((a, b) => shares[b] - shares[a]);
    const lead = n > 1 ? roundM(100 * (shares[order[0]] - shares[order[1]])) : 100 * shares[order[0]];
    votes.forEach((v, i) => { totals[i] += v; });
    others += otherVotes;
    won[order[0]]++;
    results.push({ state: name, n: attrs.voters, shares, otherShare, votes, otherVotes, order, leader: order[0], lead });
  }
  const total = totals.reduce((a, b) => a + b, 0) + others;
  return { results, totals, others, total, shares: totals.map((v) => v / total), otherShare: others / total, won,
           closest: results.slice().sort((a, b) => a.lead - b.lead).slice(0, 3) };
}

// Argentine rule: 45% of the positive votes, or more than 40% and a lead of more than 10 points, wins in the first round.
function r1Outcome(sim) {
  const order = sim.shares.map((s, i) => i).sort((a, b) => sim.shares[b] - sim.shares[a]);
  const first = order[0], second = order[1];
  const s1 = 100 * sim.shares[first], s2 = 100 * sim.shares[second], lead = s1 - s2;
  const outright = s1 >= 45 ? "45" : (s1 > 40 && lead > 10 ? "40+10" : null);
  return { first, second, s1, s2, lead, outright, order };
}

// ----- Runoff projection: where the eliminated candidates' voters go -----
// In every province each eliminated candidate's votes are split between the two finalists by how close the finalist is to
// that candidate's profile (the distance between profiles, Peronism counted double). The "Others" bucket splits by the
// province's own stances. The runoff is counted on positive votes only, like the real ones.
// TAU and PROVINCE were tuned on the only two real runoffs (2015, 2023): with these values the projection from the real
// first rounds lands within 0.8 points of both national results and about 2-3 points per province, with the right winner.
// A province-stance pull on top of the profile distance (R2_PROVINCE > 0) made both real runoffs worse, so it is off.
const R2_WEIGHTS = { economy: 1, security: 0.5, peronism: 2, abortion: 0.5, foreign_policy: 0.5 };
const R2_TAU = 4;       // smaller = voters follow proximity more strictly
const R2_PROVINCE = 0;  // weight of the province's own stances next to the eliminated candidate's profile (0 = ignore)
const profileDistance = (a, b) => AXES.reduce((s, k) => s + R2_WEIGHTS[k] * Math.abs(a[k] - b[k]), 0);

// ----- Runoff v2: endorsements, drop-out and turnout -----
// Besides the split above, each eliminated candidate can:
//   - "model":   voters decide on their own (default)
//   - "A"/"B":   endorse finalist A or B; a share `pull` of their voters follow, the rest decide on their own
//   - "neutral": refuse to endorse; more of their voters stay home (R2_NEUTRAL_DROP extra)
//   - "custom":  a fixed split, pct % to finalist A and the rest to B
// Voters who are far from BOTH finalists may not vote for either: drop-out = R2_DROP x (distance to the nearest finalist,
// as a share of the largest possible distance). Dropped voters leave the count, since the runoff counts positive votes.
// `turnout` (percent) then scales every vote up or down, which changes the totals but not the shares.
// Calibration: with the defaults (everyone "model", no turnout change) the national shares of the two real runoffs are
// reproduced to within 0.7 points. Drop-out moves the positive-vote total by -2.8% (2015) and -2.1% (2023); the real totals
// moved by +0.5% and -3.0%. 2023 is close, 2015 is not (its blank first-round votes became positive ones), and one rule cannot
// fit both, so treat the total as rough and use the turnout slider to set your own.
const R2_DROP = 0.4;          // drop-out of voters at the maximum distance from both finalists = 40%
const R2_NEUTRAL_DROP = 0.1;  // extra drop-out when the eliminated candidate stays neutral
const R2_PULL = 0.5;          // share of an endorsing candidate's voters who follow the endorsement
const R2_DMAX = 9 * Object.values(R2_WEIGHTS).reduce((a, b) => a + b, 0);   // largest possible profile distance
const R2_OTHERS_DISTANCE = 0.3;                                              // "Others" count as moderately far from both

// cands: current candidates (each with a stable `id`); opts: { tau, provinceWeight, drop, pull, turnout, rules: {id: {mode, pct}} }
function projectRunoff(sim, cands, stateData = currentStates, opts = {}) {
  const o = Object.assign({ tau: R2_TAU, provinceWeight: R2_PROVINCE, drop: R2_DROP, pull: R2_PULL, turnout: 0, rules: {} }, opts);
  const outcome = r1Outcome(sim);
  const f = [outcome.first, outcome.second];
  const clamp01 = (x) => Math.max(0, Math.min(0.8, x));
  const scale = 1 + o.turnout / 100;
  // per eliminated candidate: drop-out and rule (the same in every province)
  const elim = [];
  cands.forEach((c, i) => {
    if (i === f[0] || i === f[1]) return;
    const rule = o.rules[c.id] || { mode: "model" };
    const near = Math.min(profileDistance(c, cands[f[0]]), profileDistance(c, cands[f[1]])) / R2_DMAX;
    elim.push({ i, rule, drop: clamp01(o.drop * near + (rule.mode === "neutral" ? R2_NEUTRAL_DROP : 0)) });
  });
  const othersDrop = clamp01(o.drop * R2_OTHERS_DISTANCE);
  const results = [];
  let votes = [0, 0], won = [0, 0], dropped = 0;
  for (const r of sim.results) {
    const attrs = stateData[r.state];
    const v = [r.votes[f[0]], r.votes[f[1]]];
    const move = (own, eliminated, drop, rule) => {   // own: profile of the eliminated candidate or null (Others follow the province)
      // Others follow the province only (even at weight 0, otherwise they would split exactly 50/50)
      const w = f.map((fi) => Math.exp(-((own ? profileDistance(own, cands[fi]) + o.provinceWeight * profileDistance(attrs, cands[fi])
                                              : Math.max(o.provinceWeight, 1) * profileDistance(attrs, cands[fi]))) / o.tau));
      const z = w[0] + w[1];
      let split = [w[0] / z, w[1] / z];
      if (rule && (rule.mode === "A" || rule.mode === "B")) {
        const k = rule.mode === "A" ? 0 : 1;
        split = split.map((x, j) => (1 - o.pull) * x + (j === k ? o.pull : 0));
      } else if (rule && rule.mode === "custom") {
        const a = Math.max(0, Math.min(100, rule.pct === undefined ? 50 : rule.pct)) / 100;
        split = [a, 1 - a];
      }
      const kept = eliminated * (1 - drop);
      v[0] += kept * split[0]; v[1] += kept * split[1];
      dropped += eliminated * drop;
    };
    elim.forEach((e) => move(cands[e.i], r.votes[e.i], e.drop, e.rule));
    if (r.otherVotes > 0) move(null, r.otherVotes, othersDrop, null);
    v[0] *= scale; v[1] *= scale;
    const total = v[0] + v[1], signed = roundM(100 * (v[0] - v[1]) / total);
    const winner = signed >= 0 ? 0 : 1;
    won[winner]++; votes[0] += v[0]; votes[1] += v[1];
    results.push({ state: r.state, n: total, v, signed, winner });
  }
  const total = votes[0] + votes[1];
  return { finalists: f, results, votes, won, total, nationalMargin: roundM(100 * (votes[0] - votes[1]) / total),
           dropped: dropped * scale, firstRoundTotal: sim.total, turnoutChange: 100 * (total / sim.total - 1),
           eliminated: elim.map((e) => ({ id: cands[e.i].id, index: e.i, drop: e.drop })) };
}

// ---------- UI ----------
// Candidate sliders. Defaults are the "typical" profiles.
function sliderDefs(partMin, partMax, partPrompt, typical) {
  return [
    { key: "economy", prompt: "Economy? (1: free market, 10: strong state)", min: 1, max: 10, def: typical.economy },
    { key: "security", prompt: "Security? (1: rights-first, 10: mano dura)", min: 1, max: 10, def: typical.security },
    { key: "peronism", prompt: partPrompt, min: partMin, max: partMax, def: typical.peronism },
    { key: "abortion", prompt: "Abortion? (1: pro-life, 10: pro-choice)", min: 1, max: 10, def: typical.abortion },
    { key: "foreign_policy", prompt: "Foreign policy? (1: non-aligned, 10: pro-US/West)", min: 1, max: 10, def: typical.foreign_policy },
    { key: "approval", prompt: "Approval rating? (0-100%, 50 is neutral)", min: 0, max: 100, def: 50 },
  ];
}
const CAND1_SLIDERS = sliderDefs(1, 5, "Peronism? (1: hardline anti-Peronist, 5: moderate)", TYPICAL_NP);
const CAND2_SLIDERS = sliderDefs(6, 10, "Peronism? (10: hardline Kirchnerist, 6: moderate)", TYPICAL_PJ);

const CHART_COLORS = ["#FF6384", "#36A2EB", "#FFCE56"];
const $ = (id) => document.getElementById(id);

function appendSliders(card, defs, prefix) {
  for (const d of defs) {
    const id = `${prefix}-${d.key}`;
    const f = document.createElement("div");
    f.className = "field";
    f.innerHTML = `<label for="${id}"><span>${d.prompt}</span><span class="val" id="${id}-val">${d.def}</span></label>
      <input type="range" id="${id}" min="${d.min}" max="${d.max}" step="1" value="${d.def}" />`;
    card.appendChild(f);
    f.querySelector("input").addEventListener("input", (e) => { $(id + "-val").textContent = e.target.value; });
  }
}

// Home province (None = no home province): gives the candidate a bonus there
function appendHome(card, prefix, selected = "") {
  const hf = document.createElement("div");
  hf.className = "field";
  hf.innerHTML = `<label for="${prefix}-home">Home province</label>
    <select id="${prefix}-home"><option value="">None</option>${Object.keys(DEFAULT_STATES).map((s) => `<option>${s}</option>`).join("")}</select>`;
  card.appendChild(hf);
  hf.querySelector("select").value = selected;
}

function buildCard(el, title, nameLabel, defs, prefix, defaultName = "") {
  el.innerHTML = `<h3>${title}</h3>
    <div class="field"><label for="${prefix}-name">${nameLabel}</label>
      <input type="text" id="${prefix}-name" autocomplete="off" /></div>`;
  el.querySelector(`#${prefix}-name`).value = defaultName;
  appendSliders(el, defs, prefix);
  appendHome(el, prefix);
}

function readCandidate(prefix, defs, fallbackName) {
  const c = { name: $(`${prefix}-name`).value.trim() || fallbackName };
  for (const d of defs) c[d.key] = parseInt($(`${prefix}-${d.key}`).value, 10);
  c.home = $(`${prefix}-home`).value;   // "" = none
  return c;
}

// ----- National environment (slider value is in half points: -120..120 -> PJ+60..NP+60; 2011 was about PJ+52.5) -----
const envValue = () => parseInt($("env").value, 10) / 2;
const updateEnvLabel = () => { $("env-val").textContent = fmtMargin(envValue()); };

// ----- Province settings panel -----
const editableNames = () => Object.keys(DEFAULT_STATES);
const isEdited = (name) => ["pvi", ...STATE_FIELDS.map((f) => f.key)].some((k) => currentStates[name][k] !== DEFAULT_STATES[name][k]);

function refreshStateSelect() {
  const sel = $("state-select");
  const keep = sel.value;
  sel.innerHTML = "";
  for (const name of editableNames()) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = isEdited(name) ? `${name} (edited)` : name;
    sel.appendChild(o);
  }
  if (keep && DEFAULT_STATES[keep]) sel.value = keep;
  const edited = editableNames().filter(isEdited);
  $("edited-note").textContent = edited.length ? "Edited provinces: " + edited.join(", ") : "";
}

function renderStateSliders() {
  const name = $("state-select").value;
  const cur = currentStates[name], base = DEFAULT_STATES[name];
  const box = $("state-sliders");
  box.innerHTML = "";

  const rows = [{ key: "pvi", label: "PVI (partisan lean vs. the nation)", min: PVI_MIN, max: PVI_MAX, step: 0.1, fmt: fmtPvi }]
    .concat(STATE_FIELDS.map((f) => ({ key: f.key, label: f.label, min: 1, max: 10, step: 1, fmt: String })));

  for (const r of rows) {
    const id = `state-${r.key}`;
    const f = document.createElement("div");
    f.className = "field";
    f.innerHTML = `<label for="${id}"><span>${r.label} <small>(default ${r.fmt(base[r.key])})</small></span>
        <span class="val wide" id="${id}-val">${r.fmt(cur[r.key])}</span></label>
      <input type="range" id="${id}" min="${r.min}" max="${r.max}" step="${r.step}" value="${cur[r.key]}" />`;
    box.appendChild(f);
    f.querySelector("input").addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      currentStates[name][r.key] = v;
      $(id + "-val").textContent = r.fmt(v);
      refreshStateSelect();
    });
  }
}

function resetStates(all) {
  if (all) currentStates = deepCopy(DEFAULT_STATES);
  else { const n = $("state-select").value; currentStates[n] = deepCopy(DEFAULT_STATES[n]); }
  refreshStateSelect();
  renderStateSliders();
}

// ----- Results -----
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
const esc = (s) => s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const pct = (x, total) => (total ? (100 * x / total).toFixed(1) : "0.0") + "%";

function drawBars(chart, title, items) {
  chart.innerHTML = "";
  if (!items.length) { chart.textContent = "No close provinces to display."; return; }
  const max = Math.max(1, ...items.map((it) => it.size));
  chart.appendChild(el("h3", "", title));
  const bars = el("div", "bars"), labels = el("div", "bar-labels"), legend = el("div", "legend");
  items.forEach((it) => {
    const col = el("div", "bar-col", `<div class="bar-val">${it.text}</div>`);
    const bar = el("div", "bar"); bar.style.background = it.color;
    bar.style.height = `${(it.size / max) * 85}%`;
    col.appendChild(bar); bars.appendChild(col);
    labels.appendChild(el("span", "", it.label));
    legend.appendChild(el("span", "", `<i style="background:${it.color}"></i>${it.label}`));
  });
  chart.append(bars, labels, legend);
}

function render(c1, c2, sim) {
  const n1 = esc(c1.name), n2 = esc(c2.name);
  const nameOf = (w) => (w === 1 ? n1 : n2);

  $("approval-note").textContent =
    `National environment: ${fmtMargin(sim.environment)} | Swing from approval: ${fmtMargin(roundM(sim.approval))} | Total national swing: ${fmtMargin(roundM(sim.swing))}`;

  // Per-province results with margins
  const list = $("state-list"); list.innerHTML = "";
  for (const r of sim.results) {
    const cls = r.tie ? "" : r.winner === 1 ? "np" : "pj";
    const icon = r.tie ? "🤝" : r.winner === 1 ? "🟡" : "🔵";
    const split = `${n1} ${pct(r.v1, r.n)} - ${n2} ${pct(r.v2, r.n)}`;
    const text = r.tie
      ? `${icon} <b>${r.state}</b>: Tie, random winner is ${nameOf(r.winner)} (${split})`
      : `${icon} <b>${r.state}</b>: ${nameOf(r.winner)} wins (${split})`;
    list.appendChild(el("li", cls, `<span class="txt">${text}</span><span class="margin">Margin: ${fmtMargin(r.signed)}</span>`));
  }

  // 3 closest
  const cl = $("closest-list"); cl.innerHTML = "";
  for (const r of sim.closest) {
    cl.appendChild(el("li", r.winner === 1 ? "np" : "pj",
      `<span class="txt">Province: <b>${r.state}</b> | Margin: ${fmtMargin(r.signed)} | Winner: ${nameOf(r.winner)}</span>`));
  }

  // Bar chart
  drawBars($("chart"), "Top 3 Closest Provinces by Margin (points)",
    sim.closest.map((r, i) => ({ label: r.state, text: fmtMargin(r.signed), size: r.margin, color: CHART_COLORS[i] })));

  // Final results: national popular vote
  const s1 = 100 * sim.votes1 / sim.total, s2 = 100 * sim.votes2 / sim.total;
  $("final-1").innerHTML = `🟡 ${n1}: ${fmtVotes(sim.votes1)} votes (${s1.toFixed(2)}%), won ${sim.won1} of 24 districts`;
  $("final-2").innerHTML = `🔵 ${n2}: ${fmtVotes(sim.votes2)} votes (${s2.toFixed(2)}%), won ${sim.won2} of 24 districts`;
  $("national-bar").innerHTML =
    `<div class="seg np" style="width:${s1}%">${s1.toFixed(1)}%</div><div class="seg pj" style="width:${s2}%">${s2.toFixed(1)}%</div>`;
  const real = ELECTION_DATA[currentPreset];
  $("real-note").textContent = real
    ? `Real ${real.year} ${isRunoff(currentPreset) ? "result" : "first-round votes of these two candidates (provisional count)"}: ` +
      `${real.c1} ${fmtVotes(real.c1Votes)} (${(100 * real.c1Votes / (real.c1Votes + real.c2Votes)).toFixed(2)}%) - ` +
      `${real.c2} ${fmtVotes(real.c2Votes)} (${(100 * real.c2Votes / (real.c1Votes + real.c2Votes)).toFixed(2)}%).`
    : "";
  const v = $("verdict");
  const race = real && !isRunoff(currentPreset) ? "head-to-head" : "runoff";
  if (sim.votes1 > sim.votes2) { v.className = "verdict win"; v.innerHTML = `🎉 ${n1} wins the ${race} by ${fmtMargin(sim.nationalMargin).replace("NP+", "").replace("PJ+", "")} points!`; }
  else if (sim.votes2 > sim.votes1) { v.className = "verdict win"; v.innerHTML = `🎉 ${n2} wins the ${race} by ${fmtMargin(sim.nationalMargin).replace("NP+", "").replace("PJ+", "")} points!`; }
  else { v.className = "verdict tie"; v.textContent = "It's a tie! No clear winner."; }

  $("results").hidden = false;
}

// ----- First round: candidate cards (add / remove) -----
let currentRound = "runoff";            // "runoff" (two candidates) or "first" (first round, any number of candidates)
let r1Specs = [], r1Setup = null, r1NewProfile = deepCopy(MID_PROFILE), r1NextId = 0;
let lastR1 = null;                       // { cands, sim } of the last first-round run, so the runoff can be recalculated
let r2Rules = {}, r2Finalists = null;    // runoff settings by candidate id, and the finalists they were set for
const R1_SLIDERS = (profile) => sliderDefs(1, 10, "Peronism? (1: hardline anti-Peronist, 10: hardline Kirchnerist)", profile);

function updateR1Controls() {
  const n = r1Specs.length;
  document.querySelectorAll("#r1-cards .remove").forEach((b) => { b.disabled = n <= R1_MIN_CANDIDATES; });
  $("add-cand").disabled = n >= R1_MAX_CANDIDATES;
  $("r1-count").textContent = `${n} candidates (${R1_MIN_CANDIDATES} to ${R1_MAX_CANDIDATES})`;
}

function addR1Card(spec) {
  const prefix = `r1-${spec.id}`;
  const card = el("article", "card");
  card.id = `${prefix}-card`;
  card.style.setProperty("--c", spec.color);
  card.innerHTML = `<div class="card-head"><h3>${esc(spec.party)}</h3>
      <button type="button" class="remove" title="Remove this candidate" aria-label="Remove this candidate">&times;</button></div>
    <div class="field"><label for="${prefix}-name">Candidate name</label>
      <input type="text" id="${prefix}-name" autocomplete="off" placeholder="Candidate name" /></div>`;
  card.querySelector(`#${prefix}-name`).value = spec.name;
  appendSliders(card, R1_SLIDERS(spec.ref), prefix);
  appendHome(card, prefix, spec.home);
  card.querySelector(".remove").addEventListener("click", () => removeR1Candidate(spec.id));
  $("r1-cards").appendChild(card);
  updateR1Controls();
}

function removeR1Candidate(id) {
  if (r1Specs.length <= R1_MIN_CANDIDATES) return;
  r1Specs = r1Specs.filter((s) => s.id !== id);
  $(`r1-${id}-card`).remove();
  updateR1Controls();
}

function addR1Candidate() {
  if (r1Specs.length >= R1_MAX_CANDIDATES) return;
  const used = new Set(r1Specs.map((s) => s.color));
  const spec = {
    id: r1NextId++, name: "", party: "New candidate", color: EXTRA_COLORS.find((c) => !used.has(c)) || "#5a6dd6",
    ref: deepCopy(r1NewProfile), baseKind: r1Setup.hasBase ? "mean" : "lean", idx: -1, newEntrant: !r1Setup.hasBase, home: "",
  };
  r1Specs.push(spec);
  addR1Card(spec);
  $(`r1-${spec.id}-card`).scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function readR1Candidates() {
  return r1Specs.map((spec, k) => {
    const prefix = `r1-${spec.id}`;
    const c = Object.assign({}, spec, { name: $(`${prefix}-name`).value.trim() || `Candidate ${k + 1}` });
    for (const key of [...AXES, "approval"]) c[key] = parseInt($(`${prefix}-${key}`).value, 10);
    c.home = $(`${prefix}-home`).value;   // "" = none
    return c;
  });
}

// ----- First round: results -----
const textOn = (hex) => {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1c2230" : "#ffffff";
};
const dot = (color) => `<span class="swatch" style="background:${color}"></span>`;
const signedLead = (x) => "+" + x.toFixed(1);

function stackedBar(box, parts) {   // parts: [{ label, share (0-100), color }]
  box.innerHTML = parts.filter((p) => p.share > 0).map((p) =>
    `<div class="seg" title="${esc(p.label)} ${p.share.toFixed(1)}%" style="width:${p.share}%;background:${p.color};color:${textOn(p.color)}">${p.share >= 6 ? p.share.toFixed(1) + "%" : ""}</div>`).join("");
}

function renderRound1(cands, sim) {
  const name = (i) => esc(cands[i].name);
  $("r1-approval-note").textContent = `National environment: ${fmtMargin(envValue())} | ${cands.length} candidates` +
    (sim.others > 0 ? ' | "Others" stays a fixed bucket' : "");

  // Per-province results
  const list = $("r1-state-list"); list.innerHTML = "";
  for (const r of sim.results) {
    const top = r.order.slice(0, 3).map((i) => `${name(i)} ${(100 * r.shares[i]).toFixed(1)}%`).join(" · ");
    const li = el("li", "", `<span class="txt">${dot(cands[r.leader].color)}<b>${r.state}</b>: ${name(r.leader)} wins (${top})</span>` +
      `<span class="margin">Lead: ${signedLead(r.lead)}</span>`);
    li.style.borderLeftColor = cands[r.leader].color;
    list.appendChild(li);
  }

  // 3 closest
  const cl = $("r1-closest-list"); cl.innerHTML = "";
  for (const r of sim.closest) {
    const li = el("li", "", `<span class="txt">Province: <b>${r.state}</b> | Lead: ${signedLead(r.lead)} | Winner: ${name(r.leader)} over ${name(r.order[1])}</span>`);
    li.style.borderLeftColor = cands[r.leader].color;
    cl.appendChild(li);
  }
  drawBars($("r1-chart"), "Top 3 Closest Provinces by Lead (points)",
    sim.closest.map((r, i) => ({ label: r.state, text: signedLead(r.lead), size: r.lead, color: CHART_COLORS[i] })));

  // National result
  const order = sim.totals.map((v, i) => i).sort((a, b) => sim.totals[b] - sim.totals[a]);
  const rows = order.map((i) => `<div>${dot(cands[i].color)}${name(i)}: ${fmtVotes(sim.totals[i])} votes (${(100 * sim.shares[i]).toFixed(2)}%), won ${sim.won[i]} of 24 districts</div>`);
  if (sim.others > 0) rows.push(`<div>${dot(OTHERS_COLOR)}Others: ${fmtVotes(sim.others)} votes (${(100 * sim.otherShare).toFixed(2)}%)</div>`);
  $("r1-final").innerHTML = rows.join("");
  stackedBar($("r1-national-bar"), order.map((i) => ({ label: cands[i].name, share: 100 * sim.shares[i], color: cands[i].color }))
    .concat(sim.others > 0 ? [{ label: "Others", share: 100 * sim.otherShare, color: OTHERS_COLOR }] : []));
  const real = ELECTION_DATA[currentPreset];
  if (real && real.round1) {
    const r = real.round1, P = Object.keys(PROVINCES);
    const valid = P.reduce((a, q) => a + r.states[q][0], 0);
    $("r1-real-note").textContent = `Real ${real.year} first round: ` + r.candidates.map((c, i) =>
      `${c.name} ${(100 * P.reduce((a, q) => a + r.states[q][i + 1], 0) / valid).toFixed(2)}%`).join(", ") + ".";
  } else $("r1-real-note").textContent = "";

  // Verdict: outright win, or a runoff between the top two
  const o = r1Outcome(sim);
  const v = $("r1-verdict"), box = $("r1-runoff");
  if (o.outright) {
    v.className = "verdict win";
    v.innerHTML = `🎉 ${name(o.first)} wins in the first round with ${o.s1.toFixed(2)}% ` +
      (o.outright === "45" ? "(45% or more of the positive votes)." : `(more than 40% and ${o.lead.toFixed(1)} points ahead of ${name(o.second)}).`) + " No runoff is needed.";
    box.hidden = true;
    lastR1 = null;
  } else {
    v.className = "verdict tie";
    v.innerHTML = `🗳️ No outright winner: ${name(o.first)} (${o.s1.toFixed(2)}%) and ${name(o.second)} (${o.s2.toFixed(2)}%) go to a runoff. ` +
      `${name(o.first)} needed 45%, or more than 40% with a lead of more than 10 points (the lead was ${o.lead.toFixed(1)}).`;
    lastR1 = { cands, sim };
    buildRunoffControls(cands, sim);
    renderRunoffProjection(cands, sim);
    box.hidden = false;
  }
  $("results1").hidden = false;
}

// ----- Runoff settings panel: endorsements, drop-out and turnout -----
function readRunoffOptions() {
  const rules = {};
  for (const [id, rule] of Object.entries(r2Rules)) {
    const sel = $(`r2-rule-${id}`);
    if (sel) rules[id] = { mode: sel.value, pct: parseInt($(`r2-custom-${id}`).value, 10) };
  }
  return { rules, pull: parseInt($("r2-pull").value, 10) / 100, turnout: parseInt($("r2-turnout").value, 10),
           drop: parseInt($("r2-drop").value, 10) / 100 };
}

function recalcRunoff() {
  if (!lastR1) return;
  $("r2-pull-val").textContent = $("r2-pull").value + "%";
  const t = parseInt($("r2-turnout").value, 10);
  $("r2-turnout-val").textContent = (t > 0 ? "+" : "") + t + "%";
  $("r2-drop-val").textContent = $("r2-drop").value + "%";
  renderRunoffProjection(lastR1.cands, lastR1.sim);
}

function buildRunoffControls(cands, sim) {
  const o = r1Outcome(sim), a = cands[o.first], b = cands[o.second];
  // endorsements only make sense for the same finalists as before
  const key = [a.id, b.id].join("-");
  if (r2Finalists !== key) { r2Rules = {}; r2Finalists = key; }
  const box = $("r1-runoff-rules"); box.innerHTML = "";
  cands.forEach((c, i) => {
    if (i === o.first || i === o.second) return;
    r2Rules[c.id] = r2Rules[c.id] || { mode: "model", pct: 50 };
    const rule = r2Rules[c.id];
    const row = el("div", "rule", `<span class="who">${dot(c.color)}${esc(c.name)} <small>(${(100 * sim.shares[i]).toFixed(1)}% in round 1)</small></span>
      <select id="r2-rule-${c.id}" aria-label="What ${esc(c.name)} does">
        <option value="model">Voters decide on their own</option>
        <option value="A">Endorses ${esc(a.name)}</option>
        <option value="B">Endorses ${esc(b.name)}</option>
        <option value="neutral">Stays neutral (more stay home)</option>
        <option value="custom">Custom split</option>
      </select>
      <span class="custom" id="r2-customwrap-${c.id}" hidden><input type="range" id="r2-custom-${c.id}" min="0" max="100" step="5" value="${rule.pct}" aria-label="Percent to ${esc(a.name)}" />
        <b id="r2-custom-${c.id}-val">${rule.pct}%</b> to ${esc(a.name)}</span>`);
    box.appendChild(row);
    const sel = row.querySelector("select"), cw = row.querySelector(".custom"), rg = row.querySelector("input");
    sel.value = rule.mode;
    cw.hidden = rule.mode !== "custom";
    sel.addEventListener("change", () => { rule.mode = sel.value; cw.hidden = sel.value !== "custom"; recalcRunoff(); });
    rg.addEventListener("input", () => { rule.pct = parseInt(rg.value, 10); $(`r2-custom-${c.id}-val`).textContent = rule.pct + "%"; recalcRunoff(); });
  });
  $("r2-pull-val").textContent = $("r2-pull").value + "%";
}

function renderRunoffProjection(cands, sim) {
  const pr = projectRunoff(sim, cands, currentStates, readRunoffOptions());
  const [a, b] = pr.finalists, na = esc(cands[a].name), nb = esc(cands[b].name);
  $("r1-runoff-note").textContent = "By default the votes of the eliminated candidates (and the Others) are split between the two finalists by how close " +
    "each finalist is to them on the five issues, with Peronism counting double, and voters far from both finalists may stay home. " +
    "Use the settings below to have a candidate endorse a finalist, stay neutral or set a custom split.";
  const list = $("r1-runoff-list"); list.innerHTML = "";
  for (const r of pr.results) {
    const w = r.winner === 0 ? a : b;
    const li = el("li", "", `<span class="txt">${dot(cands[w].color)}<b>${r.state}</b>: ${esc(cands[w].name)} wins ` +
      `(${na} ${pct(r.v[0], r.n)} - ${nb} ${pct(r.v[1], r.n)})</span><span class="margin">Lead: ${signedLead(Math.abs(r.signed))}</span>`);
    li.style.borderLeftColor = cands[w].color;
    list.appendChild(li);
  }
  const s = [100 * pr.votes[0] / pr.total, 100 * pr.votes[1] / pr.total];
  $("r1-runoff-final").innerHTML =
    `<div>${dot(cands[a].color)}${na}: ${fmtVotes(pr.votes[0])} votes (${s[0].toFixed(2)}%), won ${pr.won[0]} of 24 districts</div>` +
    `<div>${dot(cands[b].color)}${nb}: ${fmtVotes(pr.votes[1])} votes (${s[1].toFixed(2)}%), won ${pr.won[1]} of 24 districts</div>`;
  stackedBar($("r1-runoff-bar"), [{ label: cands[a].name, share: s[0], color: cands[a].color }, { label: cands[b].name, share: s[1], color: cands[b].color }]);
  const chg = pr.turnoutChange;
  $("r1-runoff-turnout").textContent = `Positive votes in the runoff: ${fmtVotes(pr.total)} (first round: ${fmtVotes(pr.firstRoundTotal)}, ` +
    `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%). Eliminated voters who dropped out: ${fmtVotes(pr.dropped)}.`;
  const real = ELECTION_DATA[currentPreset];
  const same = real && isRunoff(currentPreset) && [real.c1, real.c2].includes(cands[a].name) && [real.c1, real.c2].includes(cands[b].name);
  $("r1-runoff-real").textContent = same
    ? `Real ${real.year} runoff: ${real.c1} ${(100 * real.c1Votes / (real.c1Votes + real.c2Votes)).toFixed(2)}% - ${real.c2} ${(100 * real.c2Votes / (real.c1Votes + real.c2Votes)).toFixed(2)}%.` : "";
  const v = $("r1-runoff-verdict");
  const lead = Math.abs(pr.nationalMargin).toFixed(1);
  if (pr.votes[0] === pr.votes[1]) { v.className = "verdict tie"; v.textContent = "The runoff is an exact tie."; }
  else { v.className = "verdict win"; v.innerHTML = `🎉 ${pr.votes[0] > pr.votes[1] ? na : nb} wins the runoff by ${lead} points!`; }
}

// ----- Presets and rounds -----
const ROUND_ENV_NOTE = {
  runoff: "The baseline national margin before candidate and approval effects. It shifts every province by the same amount. PJ+ favors the Peronist, NP+ the non-Peronist. For reference: 2015 was about NP+2.5, 2023 about NP+11.5, and the 2011 first round about PJ+52.5.",
  first: "Shifts every province toward the non-Peronist (NP+) or Peronist (PJ+) candidates, in proportion to how non-Peronist or Peronist each candidate is. Leave it at EVEN to keep the preset as it is.",
};

// Load a preset: provinces, environment and candidates; candidates go back to their starting profile.
function applyPreset(key) {
  currentPreset = key;
  $("env-note").textContent = ROUND_ENV_NOTE[currentRound];
  $("results").hidden = true;
  $("results1").hidden = true;
  lastR1 = null; r2Rules = {}; r2Finalists = null;
  if (currentRound === "first") return applyFirstRound(key);
  const p = presetData(key);
  DEFAULT_STATES = deepCopy(p.states);
  currentStates = deepCopy(p.states);
  buildCard($("cand1-card"), "Candidate 1 (Non-Peronist)", "Enter the name of Candidate 1 (Non-Peronist):", CAND1_SLIDERS, "c1", p.c1);
  buildCard($("cand2-card"), "Candidate 2 (Peronist)", "Enter the name of Candidate 2 (Peronist):", CAND2_SLIDERS, "c2", p.c2);
  $("env").value = p.env * 2;      // slider is in half points
  updateEnvLabel();
  $("preset-note").textContent = p.note;
  refreshStateSelect();
  renderStateSliders();
}

function applyFirstRound(key) {
  const p = r1Preset(key);
  DEFAULT_STATES = deepCopy(p.states);
  currentStates = deepCopy(p.states);
  r1Setup = p.setup;
  r1NewProfile = p.newProfile;
  r1Specs = deepCopy(p.specs);
  r1NextId = r1Specs.length;
  $("r1-cards").innerHTML = "";
  r1Specs.forEach(addR1Card);
  $("env").value = 0;
  updateEnvLabel();
  $("preset-note").textContent = p.note;
  refreshStateSelect();
  renderStateSliders();
}

function fillPresetSelect() {
  const sel = $("preset-select"), keep = currentPreset;
  const first = currentRound === "first";
  const electionLabel = (y) => first
    ? `${y}: first round (${ELECTION_DATA[y].round1.candidates.map((c) => shortName(c.name)).join(", ")})`
    : isRunoff(y) ? `${y}: ${ELECTION_DATA[y].c1} (NP) vs. ${ELECTION_DATA[y].c2} (PJ)`
                  : `${y}: ${ELECTION_DATA[y].c1} vs. ${ELECTION_DATA[y].c2} (first round, top two)`;
  sel.innerHTML = `<option value="current">${first ? "Current day (two typical candidates, add more)"
      : `Current day (average of the ${RUNOFF_KEYS.slice().reverse().join(" and ")} runoffs)`}</option>` +
    SCENARIO_KEYS.map((k) => `<option value="${k}">${SCENARIOS[k].label}</option>`).join("") +
    ELECTION_KEYS.map((y) => `<option value="${y}">${electionLabel(y)}</option>`).join("");
  sel.value = keep;
}

function setRound(round) {
  currentRound = round;
  const first = round === "first";
  $("cards-runoff").hidden = first;
  $("r1-section").hidden = !first;
  fillPresetSelect();
  applyPreset(currentPreset);
}

function init() {
  const sel = $("preset-select");
  fillPresetSelect();
  sel.addEventListener("change", () => { applyPreset(sel.value); window.scrollTo({ top: 0 }); });
  $("round-select").addEventListener("change", (e) => { setRound(e.target.value); window.scrollTo({ top: 0 }); });
  const reset = () => { applyPreset(currentPreset); window.scrollTo({ top: 0 }); };
  applyPreset("current");
  $("env").addEventListener("input", updateEnvLabel);
  $("state-select").addEventListener("change", renderStateSliders);
  $("state-reset").addEventListener("click", () => resetStates(false));
  $("state-reset-all").addEventListener("click", () => resetStates(true));
  $("restart").addEventListener("click", reset);
  $("add-cand").addEventListener("click", addR1Candidate);
  for (const id of ["r2-pull", "r2-turnout", "r2-drop"]) $(id).addEventListener("input", recalcRunoff);
  $("run").addEventListener("click", () => {
    if (currentRound === "first") {
      renderRound1(readR1Candidates(), simulateRound1(readR1Candidates(), currentStates, envValue(), r1Setup, DEFAULT_STATES));
      $("results1").scrollIntoView({ behavior: "smooth" });
      return;
    }
    const c1 = readCandidate("c1", CAND1_SLIDERS, "Candidate 1");
    const c2 = readCandidate("c2", CAND2_SLIDERS, "Candidate 2");
    render(c1, c2, simulate(c1, c2, Math.random, currentStates, envValue()));
    $("results").scrollIntoView({ behavior: "smooth" });
  });
}

if (typeof document !== "undefined") init();
if (typeof module !== "undefined") module.exports = { PROVINCES, CURRENT_STATES, SCENARIOS, r1Preset, simulateRound1, r1Outcome, projectRunoff, R1_PROFILES, R2_WEIGHTS, AXES, R2_DROP, R2_PULL, simulate, stateMargin, approvalSwing, presetData, ELECTION_KEYS, RUNOFF_KEYS, TYPICAL_NP, TYPICAL_PJ,
  setDefaults: (s) => { DEFAULT_STATES = deepCopy(s); currentStates = deepCopy(s); } };
