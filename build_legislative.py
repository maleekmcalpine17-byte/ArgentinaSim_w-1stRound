"""
Builds legislative.js (Deputies and Senate data for the simulator) from:
  data/legislative_raw.csv        list-level results 2005-2019 (tools/extract_legislative.py, polAr provisional counts)
  data/padron.csv                 registered voters per province and year
  data/legislative_2021_2023.csv  bloc-level results and real seats 2021 and 2023 (transcribed from Wikipedia tables)
Lists are classified into blocs with tools/blocs.py. Seats at the real vote are computed here (D'Hondt with a 3% of registered
voters threshold for Deputies; 2 seats for the first list and 1 for the second in the Senate) and checked against known totals.

Run from the project folder:  python3 -I tools/build_legislative.py
"""
import csv, json, os, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blocs as B

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
D = lambda f: os.path.join(ROOT, "data", f)

def dhondt(votes, n, thr=0):
    elig = {k: v for k, v in votes.items() if v >= thr and v > 0}
    seats = {k: 0 for k in votes}
    for _ in range(n):
        k = max(elig, key=lambda k: elig[k] / (seats[k] + 1), default=None)
        if k is None: break
        seats[k] += 1
    return seats

def senate(votes):
    order = sorted((k for k in votes if votes[k] > 0), key=lambda k: -votes[k])
    seats = {k: 0 for k in votes}
    if order: seats[order[0]] = 2
    if len(order) > 1: seats[order[1]] = 1
    return seats

padron = {(int(r["year"]), r["province"]): int(r["registered"]) for r in csv.DictReader(open(D("padron.csv")))}
elections = {"dip": defaultdict(dict), "sen": defaultdict(dict)}
for r in csv.DictReader(open(D("legislative_raw.csv"))):
    o, y, p = r["office"], int(r["year"]), r["province"]
    name = r["list"]
    bloc = "other" if name == "Other lists" else B.classify(p, name)
    elections[o][y].setdefault(p, {"lists": []})["lists"].append([name, bloc, int(float(r["votes"]))])

lumped = defaultdict(lambda: defaultdict(list))
real_tab = defaultdict(dict)
for r in csv.DictReader(open(D("legislative_2021_2023.csv"))):
    o, y, p = r["office"], int(r["year"]), r["province"]
    lumped[(o, y)][p].append([r["bloc"], int(r["votes"]), int(r["seats"])])
labels = {b[0]: b[1] for b in B.BLOCS}
for (o, y), provs in lumped.items():
    for p, items in provs.items():
        elections[o][y][p] = {"lists": [[labels[b], b, v] for b, v, s in items], "tableSeats": {b: s for b, v, s in items}, "lumped": True}

# seats up per province
dip_total, dip_up = defaultdict(int), {"A": {}, "B": {}}
for (o, y), provs in lumped.items():
    if o != "dip": continue
    for p, items in provs.items():
        n = sum(s for _, _, s in items)
        dip_up["A" if y == 2021 else "B"][p] = n
for ph in dip_up.values():
    for p, n in ph.items(): dip_total[p] += n
assert sum(dip_total.values()) == 257, sum(dip_total.values())
dip_phase = {y: ("A" if y % 4 == 1 else "B") for y in range(2005, 2024, 2)}
sen_groups = {}
for y in range(2005, 2024, 2):
    sen_groups[y] = sorted(elections["sen"][y]) if y in elections["sen"] and y < 2021 else None
for y in (2021, 2023):
    sen_groups[y] = sorted(elections["sen"][y])

out = {"blocs": [{"id": i, "label": l, "score": s, "color": c} for i, l, s, c in B.BLOCS],
       "dipTotal": dict(dip_total), "dipUp": dip_up, "dipPhase": dip_phase, "senGroups": sen_groups, "elections": {}}
problems = []
for o in ("dip", "sen"):
    out["elections"][o] = {}
    for y in sorted(elections[o]):
        out["elections"][o][y] = {}
        for p, e in sorted(elections[o][y].items()):
            reg = padron.get((y, p), 0)
            e["reg"] = reg
            if o == "dip":
                n = (dip_up["A" if dip_phase[y] == "A" else "B"])[p]
            else:
                n = 3
            e["n"] = n
            votes = defaultdict(int)
            for name, b, v in e["lists"]:
                votes[(name, b)] += v
            if e.get("lumped"):
                real = e["tableSeats"]
            else:
                cand = {k: v for k, v in votes.items() if k[1] != "other"}
                s = dhondt(cand, n, 0.03 * reg if reg else 0) if o == "dip" else senate(cand)
                real = defaultdict(int)
                for (name, b), k in s.items(): real[b] += k
                real = dict(real)
            if sum(real.values()) != n: problems.append((o, y, p, n, sum(real.values())))
            e["real"] = {b: k for b, k in real.items() if k}
            e.pop("tableSeats", None)
            out["elections"][o][y][p] = e

# national sanity table
for o in ("dip", "sen"):
    print(o)
    for y in sorted(out["elections"][o]):
        tot = defaultdict(int)
        for p, e in out["elections"][o][y].items():
            for b, k in e["real"].items(): tot[b] += k
        print(" ", y, sum(tot.values()), dict(sorted(tot.items(), key=lambda kv: -kv[1])))
print("seat-sum problems:", problems)
with open(os.path.join(ROOT, "legislative.js"), "w") as fh:
    fh.write("// Generated by tools/build_legislative.py - do not edit by hand.\nconst LEGISLATIVE = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\nif (typeof module !== 'undefined') module.exports = LEGISLATIVE;\n")
