"""
Builds data/first_round.csv: province-by-province first-round votes of every named candidate (plus an "Others" row) for the
2003, 2007, 2011, 2015 and 2023 presidential elections.

NOTE: this script was re-written after the original was accidentally overwritten. It is a reconstruction, not the
original code. Checked against the existing data/first_round.csv: identical national totals, and 533 of 552 province cells
identical; the other 19 differ by at most 2 votes (the original used a slightly different rounding rule). The existing
data/first_round.csv was NOT regenerated and is still the original.

Usage:   python tools/extract_first_round.py /path/to/PolAr_Data/data [output.csv]    (run from the project folder)
         then python tools/build_elections.py
The output defaults to data/first_round.csv. Pass another path to compare without touching the existing file.

Sources
  2003-2015  mesa-level (polling table) counts of the Atlas Electoral (Andy Tow), redistributed by the polAr project
             (https://github.com/electorArg/PolAr_Data, data/arg_presi_gral<year>.csv). These are provisional counts, so each
             candidate's provincial votes are scaled by (official national total / counted national total) and rounded with
             the largest-remainder method so the national totals are exactly the official ones (Wikipedia, "<year>
             Argentine general election"). Positive votes only (blank and null ballots are excluded). Province codes are the
             electoral-district order, verified by rebuilding the 2015 runoff from the same source.
  2023       data/first_round_2023.csv, Wikipedia's "2023 Argentine general election" province table; its column sums equal
             the official totals exactly, so nothing is scaled.

"""
import csv
import math
import sys
from collections import OrderedDict

PROVINCE_BY_CODE = {
    "01": "Buenos Aires City (CABA)", "02": "Buenos Aires Province", "03": "Catamarca", "04": "Córdoba",
    "05": "Corrientes", "06": "Chaco", "07": "Chubut", "08": "Entre Ríos", "09": "Formosa", "10": "Jujuy",
    "11": "La Pampa", "12": "La Rioja", "13": "Mendoza", "14": "Misiones", "15": "Neuquén", "16": "Río Negro",
    "17": "Salta", "18": "San Juan", "19": "San Luis", "20": "Santa Cruz", "21": "Santa Fe",
    "22": "Santiago del Estero", "23": "Tucumán", "24": "Tierra del Fuego",
}
NON_VOTE = {"codprov", "depto", "coddepto", "circuito", "mesa", "electores", "blancos", "nulos"}

# year -> (file, [(candidate, party, alliance column code, official national total)]) in the order they appear in the CSV
# (the first two are the "Candidate 1 / Candidate 2" of the head-to-head preset). Every column not listed goes to Others.
ELECTIONS = OrderedDict([
    (2003, ("arg_presi_gral2003.csv", [
        ("Carlos Menem", "Frente por la Lealtad (PJ)", "0133", 4741200),
        ("Néstor Kirchner", "Frente para la Victoria (PJ)", "0135", 4313133),
        ("Ricardo López Murphy", "Recrear para el Crecimiento", "0131", 3173583),
        ("Adolfo Rodríguez Saá", "Frente Movimiento Popular", "0132", 2736091),
        ("Elisa Carrió", "ARI", "0134", 2723205)], 1701478)),
    (2007, ("arg_presi_gral2007.csv", [
        ("Elisa Carrió", "Coalición Cívica", "0059", 4403644),
        ("Cristina Fernández de Kirchner", "Frente para la Victoria", "0134", 8652292),
        ("Roberto Lavagna", "Concertación UNA", "0131", 3230234),
        ("Alberto Rodríguez Saá", "Frente Justicia, Unión y Libertad", "0133", 1459177)], 1361796)),
    (2011, ("arg_presi_gral2011.csv", [
        ("Hermes Binner", "Frente Amplio Progresista", "0134", 3684969),
        ("Cristina Fernández de Kirchner", "Frente para la Victoria", "0131", 11865054),
        ("Ricardo Alfonsín", "Unión para el Desarrollo Social", "0137", 2443017),
        ("Alberto Rodríguez Saá", "Compromiso Federal", "0133", 1745354),
        ("Eduardo Duhalde", "Frente Popular", "0132", 1285830)], 903057)),
    (2015, ("arg_presi_gral2015.csv", [
        ("Mauricio Macri", "Cambiemos", "0135", 8601131),
        ("Daniel Scioli", "Frente para la Victoria", "0131", 9338490),
        ("Sergio Massa", "Unidos por una Nueva Alternativa", "0138", 5386978),
        ("Nicolás del Caño", "Frente de Izquierda y de los Trabajadores", "0137", 812531),
        ("Margarita Stolbizer", "Progresistas", "0132", 632553)], 412580)),
])
# 2023 candidate key in data/first_round_2023.csv -> (name, party), in CSV order (Candidate 1 = Milei, Candidate 2 = Massa)
ELECTION_2023 = [
    ("milei", "Javier Milei", "La Libertad Avanza"), ("massa", "Sergio Massa", "Unión por la Patria"),
    ("bullrich", "Patricia Bullrich", "Juntos por el Cambio"), ("schiaretti", "Juan Schiaretti", "Hacemos por Nuestro País"),
    ("bregman", "Myriam Bregman", "Frente de Izquierda y de los Trabajadores"),
]


def scale_to_total(counts, target):
    """Scale a {province: count} dict so it sums to target, largest-remainder rounding."""
    raw = sum(counts.values())
    exact = {p: v * target / raw for p, v in counts.items()}
    out = {p: math.floor(x) for p, x in exact.items()}
    short = target - sum(out.values())
    for p in sorted(exact, key=lambda q: exact[q] - out[q], reverse=True)[:short]:
        out[p] += 1
    return out


def read_counts(path, cands):
    """-> {candidate name: {province: votes}} and the Others votes, from a polAr mesa-level file."""
    codes = {c[2]: c[0] for c in cands}
    tot = {name: OrderedDict((p, 0) for p in PROVINCE_BY_CODE.values()) for name in list(codes.values()) + ["Others"]}
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        cols = [c for c in reader.fieldnames if c not in NON_VOTE]
        for code in codes:
            assert code in cols, (path, code)
        for r in reader:
            prov = PROVINCE_BY_CODE[r["codprov"]]
            for col in cols:
                v = int(r[col]) if r[col] not in ("", "NA") else 0   # a few cells are NA (no votes recorded)
                tot[codes.get(col, "Others")][prov] += v
    return tot


def main(data_dir, out="data/first_round.csv"):
    rows = []
    for year, (fname, cands, others_target) in ELECTIONS.items():
        tot = read_counts(f"{data_dir}/{fname}", cands)
        parties = {c[0]: c[1] for c in cands}
        targets = {c[0]: c[3] for c in cands}
        targets["Others"] = others_target
        parties["Others"] = "Other candidates"
        scaled = {name: scale_to_total(tot[name], targets[name]) for name in tot}
        for prov in PROVINCE_BY_CODE.values():
            for name in [c[0] for c in cands] + ["Others"]:
                rows.append((year, prov, name, parties[name], scaled[name][prov]))
        print(year, f"{sum(targets.values()):,} positive votes")
    # 2023: Wikipedia's province table, used as is
    votes23 = {}
    with open("data/first_round_2023.csv", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            votes23[(r["province"], r["candidate"])] = int(r["votes"])
    for prov in PROVINCE_BY_CODE.values():
        for key, name, party in ELECTION_2023:
            rows.append((2023, prov, name, party, votes23[(prov, key)]))
    print(2023, f"{sum(votes23.values()):,} positive votes")
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["year", "province", "candidate", "party", "votes"])
        w.writerows(rows)
    print("wrote", out)


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    main(*sys.argv[1:])
