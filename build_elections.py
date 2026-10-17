"""
Builds elections.js (the election presets) from data/runoffs.csv and data/first_round.csv.

Usage:   python tools/build_elections.py            (run from the project folder)

data/runoffs.csv has one row per province with the final positive (valid candidate) votes of the two runoff candidates.
Only two presidential runoffs (ballotages) have ever been held in Argentina, in 2015 and 2023.

data/first_round.csv (see tools/extract_first_round.py) has the first-round votes of every named candidate in every province
for 2003, 2007, 2011, 2015 and 2023, plus an "Others" row. It feeds two things:
  - round1: the multi-candidate first round of every election
  - for 2003, 2007 and 2011 (no runoff took place), the "runoff" preset is the head-to-head of the two first-round
    leaders (the first two candidates in the file), using only their votes

Sources of the votes:
  2015 runoff   Argentine electoral authority definitive count (Dirección Nacional Electoral), as tabulated on Wikipedia,
                "2015 Argentine general election". National totals: Macri 12,988,349, Scioli 12,309,575.
  2023 runoff   Provincial results as published by La Gaceta (Tucumán) at 99.3% of polling stations counted; the national
                totals it reports (Milei 14,476,462 / Massa 11,516,142) are the official ones.
  first rounds  see tools/extract_first_round.py (2023 from Wikipedia's province table, the others from polling-table
                counts scaled to the official national totals).

For every election the script checks (and refuses to write the file if anything fails):
  - all 24 districts (23 provinces + the City of Buenos Aires) are present exactly once
  - the national vote totals equal the official totals below (runoffs exactly; first-round head-to-heads within 0.02%)
  - the margin stored for each province reproduces its real vote split
Margin = Candidate 1 % minus Candidate 2 % of the positive votes (Candidate 1 = non-Peronist, Candidate 2 = Peronist).
"""
import csv
import json
import sys
from collections import OrderedDict

RUNOFF_CSV = "data/runoffs.csv"
FIRST_ROUND_CSV = "data/first_round.csv"
OUT = "elections.js"
HEAD_TO_HEAD_TOLERANCE = 0.0002

PROVINCES = [
    "Buenos Aires Province", "Buenos Aires City (CABA)", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes",
    "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro",
    "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
]

# year -> metadata and the official national totals (Candidate 1, Candidate 2).
# kind "runoff": a real ballotage. kind "firstRound": no runoff happened; head-to-head of the two first-round leaders.
ELECTIONS = {
    2015: dict(kind="runoff", c1="Mauricio Macri", c1_party="Cambiemos", c2="Daniel Scioli", c2_party="Frente para la Victoria",
               date="22 November 2015", official=(12988349, 12309575),
               first_round="Scioli 37.1%, Macri 34.2%, Massa 21.4%"),
    2023: dict(kind="runoff", c1="Javier Milei", c1_party="La Libertad Avanza", c2="Sergio Massa", c2_party="Unión por la Patria",
               date="19 November 2023", official=(14476462, 11516142),
               first_round="Massa 36.7%, Milei 30.0%, Bullrich 23.8%"),
    2011: dict(kind="firstRound", c1="Hermes Binner", c1_party="Frente Amplio Progresista",
               c2="Cristina Fernández de Kirchner", c2_party="Frente para la Victoria",
               date="23 October 2011", official=(3684970, 11865055),
               first_round="Fernández de Kirchner 54.1%, Binner 16.8%, Alfonsín 11.1%"),
    2007: dict(kind="firstRound", c1="Elisa Carrió", c1_party="Coalición Cívica",
               c2="Cristina Fernández de Kirchner", c2_party="Frente para la Victoria",
               date="28 October 2007", official=(4403642, 8652293),
               first_round="Fernández de Kirchner 45.3%, Carrió 23.0%, Lavagna 16.9%"),
    2003: dict(kind="firstRound", c1="Carlos Menem", c1_party="Frente por la Lealtad (PJ)",
               c2="Néstor Kirchner", c2_party="Frente para la Victoria (PJ)",
               date="27 April 2003", official=(4741200, 4313131),
               first_round="Menem 24.5%, Kirchner 22.2%, López Murphy 16.4%"),
}


def fail(msg):
    sys.exit("CHECK FAILED: " + msg)


def read_runoffs():
    rows = {}
    with open(RUNOFF_CSV, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            key = (int(r["year"]), r["province"])
            if key in rows:
                fail(f"duplicate row {key}")
            rows[key] = (int(r["nonperonist_votes"]), int(r["peronist_votes"]))
    return rows


def read_first_rounds():
    """year -> {"candidates": {name: party}, "votes": {province: {name: votes}}}"""
    out = {}
    with open(FIRST_ROUND_CSV, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            y = int(r["year"])
            e = out.setdefault(y, {"candidates": OrderedDict(), "votes": OrderedDict()})
            if r["candidate"] != "Others":
                e["candidates"].setdefault(r["candidate"], r["party"])
            pv = e["votes"].setdefault(r["province"], OrderedDict())
            if r["candidate"] in pv:
                fail(f"{y} {r['province']}: duplicate candidate {r['candidate']}")
            pv[r["candidate"]] = int(r["votes"])
    return out


def two_way(year, meta, pairs):
    """pairs: {province: (c1 votes, c2 votes)} -> checked head-to-head record."""
    if sorted(pairs) != sorted(PROVINCES):
        fail(f"{year}: districts do not match the 24 expected (missing {set(PROVINCES) - set(pairs)}, "
             f"extra {set(pairs) - set(PROVINCES)})")
    t1 = sum(pairs[p][0] for p in PROVINCES)
    t2 = sum(pairs[p][1] for p in PROVINCES)
    if meta["kind"] == "runoff":
        if (t1, t2) != meta["official"]:
            fail(f"{year}: national totals {t1:,} / {t2:,} differ from official {meta['official'][0]:,} / {meta['official'][1]:,}")
    else:
        for got, want in zip((t1, t2), meta["official"]):
            if abs(got - want) > HEAD_TO_HEAD_TOLERANCE * want:
                fail(f"{year}: national total {got:,} is more than {HEAD_TO_HEAD_TOLERANCE:.2%} away from official {want:,}")
    national = 100.0 * (t1 - t2) / (t1 + t2)
    states = OrderedDict()
    for p in PROVINCES:
        a, b = pairs[p]
        margin = round(100.0 * (a - b) / (a + b), 3)
        back = (a + b) * (100 + margin) / 200      # the split rebuilt from the margin must match the real votes
        if abs(back - a) > 0.001 * (a + b):
            fail(f"{year} {p}: margin does not reproduce votes")
        states[p] = [a + b, margin]
    return t1, t2, national, states


def main():
    runoffs = read_runoffs()
    first = read_first_rounds()
    out = OrderedDict()
    for year in sorted(ELECTIONS, reverse=True):
        meta = ELECTIONS[year]

        # ----- first round (multi-candidate) -----
        fr = first.get(year)
        if fr is None:
            fail(f"{year}: no first-round rows in {FIRST_ROUND_CSV}")
        names = list(fr["candidates"])
        if names[0] != meta["c1"] or names[1] != meta["c2"]:
            fail(f"{year}: the first two first-round candidates must be {meta['c1']} and {meta['c2']}, got {names[:2]}")
        if sorted(fr["votes"]) != sorted(PROVINCES):
            fail(f"{year}: first round does not have exactly the 24 districts")
        has_others = any("Others" in pv for pv in fr["votes"].values())
        r1_states = OrderedDict()
        for p in PROVINCES:
            pv = fr["votes"][p]
            row = [pv[n] for n in names] + ([pv["Others"]] if has_others else [])
            if min(row) < 0 or sum(row) <= 0:
                fail(f"{year} {p}: bad first-round votes {row}")
            r1_states[p] = [sum(row)] + row            # [valid votes, candidate 1, candidate 2, ..., others]

        # ----- runoff (real) or head-to-head of the top two (first-round years) -----
        if meta["kind"] == "runoff":
            pairs = {p: runoffs[(year, p)] for p in PROVINCES if (year, p) in runoffs}
        else:
            pairs = {p: (fr["votes"][p][names[0]], fr["votes"][p][names[1]]) for p in PROVINCES}
        t1, t2, national, states = two_way(year, meta, pairs)

        out[str(year)] = OrderedDict(
            year=year, kind=meta["kind"], c1=meta["c1"], c2=meta["c2"], c1Party=meta["c1_party"], c2Party=meta["c2_party"],
            date=meta["date"], firstRound=meta["first_round"],
            c1Votes=t1, c2Votes=t2,
            nationalMargin=round(national, 3),
            environment=round(national * 2) / 2,       # slider is in half points
            states=states,
            round1=OrderedDict(
                candidates=[OrderedDict(name=n, party=fr["candidates"][n]) for n in names],
                others=has_others,
                states=r1_states,
            ),
        )
        total = sum(v[0] for v in r1_states.values())
        shares = ", ".join(f"{n.split()[-1]} {100 * sum(r1_states[p][i + 1] for p in PROVINCES) / total:.2f}%"
                           for i, n in enumerate(names))
        print(f"{year} ({meta['kind']}): {meta['c1']} {t1:,} vs {meta['c2']} {t2:,}  national margin {national:+.2f}")
        print(f"     first round: {shares}")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_elections.py from data/runoffs.csv and data/first_round.csv.\n")
        f.write('// kind "runoff": real ballotage. kind "firstRound": no runoff happened, head-to-head of the two first-round leaders.\n')
        f.write("// states: { province: [positive votes cast, margin] }, margin = Candidate 1 % minus Candidate 2 % of those votes.\n")
        f.write("// round1.states: { province: [valid votes, Candidate 1, Candidate 2, ..., others] } in the order of round1.candidates.\n")
        f.write("const ELECTIONS = " + json.dumps(out, ensure_ascii=False) + ";\n")
        f.write('if (typeof module !== "undefined") module.exports = ELECTIONS;\n')
    print("wrote", OUT)


if __name__ == "__main__":
    main()
