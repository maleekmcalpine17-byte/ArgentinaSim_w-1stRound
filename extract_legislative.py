"""
Step 1 of the legislative data: list-level votes of the national Chamber of Deputies and Senate elections 2005-2019, per province.

Output: data/legislative_raw.csv with columns office, year, province, list, votes, and data/padron.csv (registered voters per
province and year, used for the 3% threshold of the Chamber of Deputies).

Source: mesa-level (polling table) counts of the Atlas Electoral (Andy Tow), redistributed by the polAr project
(https://github.com/electorArg/PolAr_Data, data/<province>_dip_gral<year>.csv and <province>_sen_gral<year>.csv, with the list names in
listas/listas_dip_gral<year>.csv and listas_sen_gral<year>.csv). Positive votes only (blank and null excluded). These are provisional
counts. Lists below 0.5% of a province's positive votes are folded into "Other lists".

Usage:   python tools/extract_legislative.py /path/to/PolAr_Data       (run from the project folder)
Then:    python tools/build_legislative.py
"""
import csv
import os
import sys
from collections import OrderedDict, defaultdict

# polAr file prefix -> project province name, and the electoral-district code used in the list lookups
PROVINCES = OrderedDict([
    ("caba", ("Buenos Aires City (CABA)", "01")), ("pba", ("Buenos Aires Province", "02")), ("catamarca", ("Catamarca", "03")),
    ("cordoba", ("Córdoba", "04")), ("corrientes", ("Corrientes", "05")), ("chaco", ("Chaco", "06")), ("chubut", ("Chubut", "07")),
    ("erios", ("Entre Ríos", "08")), ("formosa", ("Formosa", "09")), ("jujuy", ("Jujuy", "10")), ("pampa", ("La Pampa", "11")),
    ("rioja", ("La Rioja", "12")), ("mendoza", ("Mendoza", "13")), ("misiones", ("Misiones", "14")), ("neuquen", ("Neuquén", "15")),
    ("rnegro", ("Río Negro", "16")), ("salta", ("Salta", "17")), ("sjuan", ("San Juan", "18")), ("sluis", ("San Luis", "19")),
    ("scruz", ("Santa Cruz", "20")), ("sfe", ("Santa Fe", "21")), ("santiago", ("Santiago del Estero", "22")),
    ("tucuman", ("Tucumán", "23")), ("tdf", ("Tierra del Fuego", "24")),
])
YEARS = [2005, 2007, 2009, 2011, 2013, 2015, 2017, 2019]
NON_VOTE = {"codprov", "depto", "coddepto", "circuito", "mesa", "electores", "blancos", "nulos"}
MIN_SHARE = 0.005


def names_for(repo, office, year):
    out = {}
    with open(f"{repo}/listas/listas_{office}_gral{year}.csv", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            out[(r["vot_proCodigoProvincia"], r["vot_parCodigo"])] = " ".join(r["parDenominacion"].split())
    return out


def main(repo):
    rows, padron = [], []
    for office in ("dip", "sen"):
        for year in YEARS:
            lookup = names_for(repo, office, year)
            for prefix, (province, code) in PROVINCES.items():
                path = f"{repo}/data/{prefix}_{office}_gral{year}.csv"
                if not os.path.exists(path):
                    continue                       # the Senate is only elected in 8 provinces per cycle
                votes, electors = defaultdict(int), 0
                with open(path, encoding="utf-8", newline="") as f:
                    reader = csv.DictReader(f)
                    cols = [c for c in reader.fieldnames if c not in NON_VOTE]
                    for r in reader:
                        electors += int(r["electores"]) if r["electores"] not in ("", "NA") else 0
                        for c in cols:
                            v = r[c]
                            if v not in ("", "NA"):
                                votes[c] += int(v)
                # Columns with no name in the lookup are a data artifact (the cell holds the column's own code, e.g. 540, instead
                # of votes: Tucumán Senate 2009, Salta Senate 2013), so they are dropped. Dropping them makes Tucumán 2009 match its
                # Deputies total to 0.1%; Salta 2013 still has polling tables missing, so its Senate shares are right but its total is low.
                votes = {c: v for c, v in votes.items() if lookup.get((code, c)) is not None}
                total = sum(votes.values())
                other = 0
                for c, v in sorted(votes.items(), key=lambda kv: -kv[1]):
                    name = lookup[(code, c)]
                    if v / total < MIN_SHARE:
                        other += v
                    else:
                        rows.append((office, year, province, name, v))
                if other:
                    rows.append((office, year, province, "Other lists", other))
                if office == "dip":
                    padron.append((year, province, electors))
    with open("data/legislative_raw.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["office", "year", "province", "list", "votes"])
        w.writerows(rows)
    with open("data/padron.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["year", "province", "registered"])
        w.writerows(padron)
    print("wrote data/legislative_raw.csv", len(rows), "rows; data/padron.csv", len(padron), "rows")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
