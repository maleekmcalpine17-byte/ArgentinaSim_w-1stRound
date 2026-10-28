/* Legislative mode: Chamber of Deputies and Senate, 2005-2023.
   Data: legislative.js (tools/build_legislative.py). Votes of every list are moved by a national swing and a per-province offset
   (Peronist blocs up, anti-Peronist blocs down), then seats are re-allocated: D'Hondt with a 3%-of-registered threshold for Deputies,
   2 seats to the first list and 1 to the second for the Senate. For 2021 and 2023 only bloc totals are available, so the change in
   seats is computed on the blocs and added to the real seats ("delta method"). */
(function () {
  const LEG = typeof LEGISLATIVE !== "undefined" ? LEGISLATIVE : require("./legislative.js");
  const BLOC = {};
  for (const b of LEG.blocs) BLOC[b.id] = b;
  BLOC.other = { id: "other", label: "Other lists", score: 5, color: "#b8bfcc" };
  const SIZE = { dip: 257, sen: 72 };
  const PERONIST = ["fpv", "fedper"], ANTI = ["ucr", "pro", "civic", "libert"];
  const SWING_UNIT = 50;   // slider points per unit of log-odds: +-20 points is +-0.4

  const kOf = (bloc) => (BLOC[bloc].score - 5) / 4;   // fpv +1, fedper +.5, ucr -.5, pro/libert -.75, civic -.5, left -.25

  function dhondt(votes, n, thr) {
    const seats = {}, keys = Object.keys(votes);
    for (const k of keys) seats[k] = 0;
    const elig = keys.filter((k) => votes[k] > 0 && votes[k] >= thr);
    for (let i = 0; i < n; i++) {
      let best = null, bv = -1;
      for (const k of elig) { const q = votes[k] / (seats[k] + 1); if (q > bv) { bv = q; best = k; } }
      if (best === null) break;
      seats[best]++;
    }
    return seats;
  }
  function senateRule(votes) {
    const seats = {}, order = Object.keys(votes).filter((k) => votes[k] > 0).sort((a, b) => votes[b] - votes[a]);
    for (const k of Object.keys(votes)) seats[k] = 0;
    if (order[0] !== undefined) seats[order[0]] = 2;
    if (order[1] !== undefined) seats[order[1]] = 1;
    return seats;
  }
  const allocate = (office, votes, n, thr) => (office === "dip" ? dhondt(votes, n, thr) : senateRule(votes));

  // Seats for one province under a vote shift d (log-odds; positive favours Peronism). opts.threshold === false turns the 3% rule off.
  function provinceSeats(office, year, province, shift, opts = {}) {
    const e = LEG.elections[office][year][province];
    const useThr = office === "dip" && opts.threshold !== false;
    const thr = useThr ? 0.03 * e.reg : 0;
    const d = shift / SWING_UNIT;
    const base = {}, mod = {}, bloc = {};
    let tb = 0, tm = 0;
    for (const [name, b, v] of e.lists) {
      if (b === "other") continue;
      const key = name + "|" + b;
      bloc[key] = b; base[key] = (base[key] || 0) + v;
    }
    for (const k of Object.keys(base)) { mod[k] = base[k] * Math.exp(kOf(bloc[k]) * d); tb += base[k]; tm += mod[k]; }
    for (const k of Object.keys(mod)) mod[k] *= tb / tm;   // keep the total number of votes
    const toBlocs = (s) => { const r = {}; for (const k of Object.keys(s)) r[bloc[k]] = (r[bloc[k]] || 0) + s[k]; return r; };
    const sm = toBlocs(allocate(office, mod, e.n, thr));
    let out;
    if (e.lumped) {
      const sb = toBlocs(allocate(office, base, e.n, thr));
      out = {};
      for (const b of new Set([...Object.keys(e.real), ...Object.keys(sm), ...Object.keys(sb)]))
        out[b] = Math.max(0, (e.real[b] || 0) + (sm[b] || 0) - (sb[b] || 0));
      let sum = Object.values(out).reduce((a, b) => a + b, 0);
      while (sum > e.n) { const b = Object.keys(out).filter((x) => out[x] > 0).sort((x, y) => ((sm[y] || 0) - (sb[y] || 0)) - ((sm[x] || 0) - (sb[x] || 0)))[0]; out[b]--; sum--; }
      while (sum < e.n) { const b = Object.keys(sm).sort((x, y) => (sm[y] || 0) - (sb[y] || 0) - ((sm[x] || 0) - (sb[x] || 0)))[0]; out[b] = (out[b] || 0) + 1; sum++; }
    } else out = sm;
    for (const b of Object.keys(out)) if (!out[b]) delete out[b];
    return out;
  }

  const sumInto = (acc, s) => { for (const b of Object.keys(s)) acc[b] = (acc[b] || 0) + s[b]; return acc; };

  // opts: { national, provinces: {name: offset}, threshold }
  function simulateLegislature(office, year, opts = {}) {
    const byProv = {}, total = {};
    for (const p of Object.keys(LEG.elections[office][year])) {
      const shift = (opts.national || 0) + ((opts.provinces || {})[p] || 0);
      byProv[p] = { seats: provinceSeats(office, year, p, shift, opts), n: LEG.elections[office][year][p].n, real: LEG.elections[office][year][p].real };
      sumInto(total, byProv[p].seats);
    }
    const real = {};
    for (const p of Object.keys(byProv)) sumInto(real, byProv[p].real);
    // seats that stay from earlier elections (real results)
    const earlier = office === "dip" ? [year - 2] : [year - 2, year - 4];
    const holdover = {}; let complete = true;
    for (const y of earlier) {
      const data = LEG.elections[office][y];
      if (!data) { complete = false; continue; }
      for (const p of Object.keys(data)) sumInto(holdover, data[p].real);
    }
    const chamber = sumInto(sumInto({}, total), holdover);
    return { office, year, byProv, total, real, holdover, chamber, complete, size: SIZE[office], majority: Math.floor(SIZE[office] / 2) + 1 };
  }

  function controlSummary(sim) {
    const c = sim.chamber, sum = (ids) => ids.reduce((a, b) => a + (c[b] || 0), 0);
    const peron = sum(PERONIST), anti = sum(ANTI);
    const largest = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
    return { peron, anti, other: sum(["left", "prov", "other"]), largest, largestSeats: c[largest] || 0 };
  }

  const api = { provinceSeats, simulateLegislature, controlSummary, dhondt, senateRule, BLOC, SIZE, PERONIST, ANTI, LEG, SWING_UNIT };
  if (typeof module !== "undefined") module.exports = api;
  if (typeof window !== "undefined") window.Legislature = api;

  // ---------------------------------------------------------------- UI
  if (typeof document === "undefined") return;
  const $ = (id) => document.getElementById(id);
  const OFFICE_NAME = { dip: "Chamber of Deputies", sen: "Senate" };
  const state = { office: "dip", year: null, national: 0, provinces: {}, threshold: true, province: null };

  function seatBar(parts, total, marker) {   // parts: [{bloc, seats}]
    const bar = document.createElement("div");
    bar.className = "seatbar";
    for (const p of parts) {
      if (!p.seats) continue;
      const seg = document.createElement("div");
      seg.className = "seg";
      seg.style.flex = p.seats + " 0 0";
      seg.style.background = BLOC[p.bloc].color;
      seg.title = BLOC[p.bloc].label + ": " + p.seats;
      seg.textContent = p.seats >= total * 0.04 ? p.seats : "";
      bar.appendChild(seg);
    }
    if (marker) {
      const m = document.createElement("div");
      m.className = "majority";
      m.style.left = ((marker - 0.5) / total * 100) + "%";
      m.title = "Majority: " + marker;
      bar.appendChild(m);
    }
    return bar;
  }
  function legend(blocs) {
    const d = document.createElement("div");
    d.className = "legend";
    d.innerHTML = blocs.map((b) => `<span><i class="swatch" style="background:${BLOC[b].color}"></i>${BLOC[b].label}</span>`).join("");
    return d;
  }
  const ordered = (seats) => Object.keys(seats).filter((b) => seats[b]).sort((a, b) => seats[b] - seats[a]).map((b) => ({ bloc: b, seats: seats[b] }));
  const chips = (seats) => ordered(seats).map((p) => `<span class="chip" style="--c:${BLOC[p.bloc].color}">${p.seats} ${BLOC[p.bloc].label.split(" (")[0].split(" / ")[0]}</span>`).join(" ");
  const signed = (n) => (n > 0 ? "+" : "") + n;

  function years(office) { return Object.keys(LEG.elections[office]).map(Number).sort((a, b) => b - a); }

  function build() {
    const box = $("leg-section");
    box.innerHTML = `
      <div class="panel">
        <h3 id="leg-title"></h3>
        <p class="note" id="leg-note"></p>
        <div class="field"><label for="leg-year">Election</label><select id="leg-year"></select></div>
        <div class="field"><label for="leg-swing"><span>National swing (negative = anti-Peronist parties gain, positive = Peronist parties gain)</span><span class="val wide" id="leg-swing-val">0</span></label>
          <input type="range" id="leg-swing" min="-20" max="20" step="1" value="0" /></div>
        <details id="leg-prov-box"><summary>Province-by-province swing</summary>
          <div class="state-controls"><select id="leg-prov" aria-label="Province"></select>
            <button id="leg-prov-reset" class="btn ghost" type="button">Reset provinces</button></div>
          <div class="field"><label for="leg-prov-swing"><span>Swing in this province</span><span class="val wide" id="leg-prov-val">0</span></label>
            <input type="range" id="leg-prov-swing" min="-20" max="20" step="1" value="0" /></div>
          <p class="note" id="leg-prov-edited"></p>
        </details>
        <div class="field" id="leg-thr-wrap"><label><span><input type="checkbox" id="leg-thr" checked /> Apply the 3%-of-registered-voters threshold (Deputies)</span></label></div>
        <button id="leg-reset" class="btn ghost" type="button">Reset swing</button>
      </div>
      <h2 id="leg-up-title"></h2>
      <div id="leg-up-bar"></div><div id="leg-up-real" class="note"></div>
      <h2 id="leg-ch-title"></h2>
      <div id="leg-ch-bar"></div><div id="leg-ch-legend"></div>
      <div id="leg-verdict" class="verdict"></div>
      <p class="note" id="leg-ch-note"></p>
      <h2>Seats by province</h2>
      <ul id="leg-list" class="state-list"></ul>`;
    $("leg-year").addEventListener("change", (e) => { state.year = +e.target.value; state.provinces = {}; refreshProvSelect(); update(); });
    $("leg-swing").addEventListener("input", (e) => { state.national = +e.target.value; update(); });
    $("leg-prov").addEventListener("change", () => { state.province = $("leg-prov").value; syncProvSlider(); });
    $("leg-prov-swing").addEventListener("input", (e) => {
      const v = +e.target.value; if (v) state.provinces[state.province] = v; else delete state.provinces[state.province]; update();
    });
    $("leg-prov-reset").addEventListener("click", () => { state.provinces = {}; syncProvSlider(); update(); });
    $("leg-thr").addEventListener("change", (e) => { state.threshold = e.target.checked; update(); });
    $("leg-reset").addEventListener("click", () => { state.national = 0; state.provinces = {}; $("leg-swing").value = 0; syncProvSlider(); update(); });
  }
  function refreshProvSelect() {
    const provs = Object.keys(LEG.elections[state.office][state.year]).sort();
    $("leg-prov").innerHTML = provs.map((p) => `<option>${p}</option>`).join("");
    state.province = provs[0];
    syncProvSlider();
  }
  function syncProvSlider() {
    $("leg-prov").value = state.province;
    $("leg-prov-swing").value = state.provinces[state.province] || 0;
    $("leg-prov-val").textContent = state.provinces[state.province] || 0;
  }
  function setOffice(office) {
    const leg = office !== "pres";
    $("pres-mode").hidden = leg;
    $("leg-section").hidden = !leg;
    if (!leg) return;
    state.office = office;
    const ys = years(office);
    if (!ys.includes(state.year)) state.year = ys[0];
    $("leg-title").textContent = OFFICE_NAME[office];
    $("leg-note").textContent = office === "dip"
      ? "Half of the 257 seats are renewed every two years (127 or 130), allocated by province with the D'Hondt method and a threshold of 3% of registered voters. The rest of the chamber is the result of the previous election."
      : "One third of the 72 seats is renewed every two years: 8 provinces vote, the winning list takes 2 of the 3 seats and the runner-up takes 1. Two thirds of the chamber carry over from the previous two elections.";
    $("leg-thr-wrap").hidden = office !== "dip";
    $("leg-year").innerHTML = ys.map((y) => `<option value="${y}">${y}</option>`).join("");
    $("leg-year").value = state.year;
    state.provinces = {};
    refreshProvSelect();
    update();
  }

  function update() {
    const o = state.office, y = state.year;
    $("leg-swing-val").textContent = (state.national > 0 ? "+" : "") + state.national;
    const sim = simulateLegislature(o, y, { national: state.national, provinces: state.provinces, threshold: state.threshold });
    const edited = Object.keys(state.provinces).length;
    $("leg-prov-edited").textContent = edited ? `${edited} province(s) with their own swing.` : "";
    const up = Object.values(sim.total).reduce((a, b) => a + b, 0);
    $("leg-up-title").textContent = `${y} ${OFFICE_NAME[o]}: seats up (${up})`;
    const upBox = $("leg-up-bar"); upBox.innerHTML = "";
    upBox.appendChild(seatBar(ordered(sim.total), up));
    upBox.appendChild(legend(ordered(sim.total).map((p) => p.bloc)));
    const deltas = Object.keys({ ...sim.total, ...sim.real }).map((b) => ({ b, d: (sim.total[b] || 0) - (sim.real[b] || 0) })).filter((x) => x.d);
    $("leg-up-real").textContent = deltas.length
      ? "Change from the real result: " + deltas.sort((a, b) => b.d - a.d).map((x) => `${BLOC[x.b].label.split(" (")[0]} ${signed(x.d)}`).join(", ") + "."
      : "This is the real result (seat allocation reproduced from the votes).";

    $("leg-ch-title").textContent = `Chamber after the ${y} election (${sim.size} seats, majority ${sim.majority})`;
    const chBox = $("leg-ch-bar"); chBox.innerHTML = "";
    const have = Object.values(sim.chamber).reduce((a, b) => a + b, 0);
    chBox.appendChild(seatBar(ordered(sim.chamber), sim.size, sim.majority));
    $("leg-ch-legend").innerHTML = ""; $("leg-ch-legend").appendChild(legend(ordered(sim.chamber).map((p) => p.bloc)));
    const c = controlSummary(sim), V = $("leg-verdict");
    if (!sim.complete) {
      V.className = "verdict tie";
      V.textContent = `Not enough earlier results to show the whole chamber: ${have} of ${sim.size} seats are known (this data starts in 2005).`;
    } else if (c.peron >= sim.majority || c.anti >= sim.majority) {
      const peronWins = c.peron >= sim.majority;
      V.className = "verdict win";
      V.textContent = (peronWins ? "Peronist parties" : "Anti-Peronist parties") + ` hold a majority on this grouping: ${peronWins ? c.peron : c.anti} of ${sim.size} seats.` +
        ` Largest bloc: ${BLOC[c.largest].label} (${c.largestSeats}).`;
    } else {
      V.className = "verdict tie";
      V.textContent = `No majority: Peronist parties ${c.peron}, anti-Peronist parties ${c.anti}, others ${c.other}; ${sim.majority} needed. Largest bloc: ${BLOC[c.largest].label} (${c.largestSeats}).`;
    }
    $("leg-ch-note").textContent = "Peronist = Kirchnerism + other Peronism; anti-Peronist = PRO/Cambiemos/JxC, UCR, civic centre-left and libertarian right. Parties are grouped by a keyword classification (tools/blocs.py), so blocs are approximate, and the seats carried over are the real earlier results, not affected by the swing.";

    const ul = $("leg-list"); ul.innerHTML = "";
    for (const p of Object.keys(sim.byProv).sort()) {
      const r = sim.byProv[p], li = document.createElement("li");
      const top = ordered(r.seats)[0];
      const changed = JSON.stringify(ordered(r.seats)) !== JSON.stringify(ordered(r.real));
      li.style.borderLeftColor = top ? BLOC[top.bloc].color : "";
      li.innerHTML = `<span class="txt"><strong>${p}</strong> <span class="note">(${r.n} seats)</span><br>${chips(r.seats)}</span>${changed ? '<span class="margin tie">changed</span>' : ""}`;
      ul.appendChild(li);
    }
  }

  function init() {
    build();
    $("office-select").addEventListener("change", (e) => { setOffice(e.target.value); window.scrollTo({ top: 0 }); });
    const q = new URLSearchParams(location.search).get("office");
    if (q && OFFICE_NAME[q]) { $("office-select").value = q; setOffice(q); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
