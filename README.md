# Argentina Runoff Game

A what-if simulator for Argentina's presidential second round (ballotage), rebuilt from Election Game 2024.
Pick two candidates, set their stances and approval, and see how every province votes and who wins the national popular vote.

## Run it
1. Open this folder in VS Code and install the "Live Server" extension.
2. Right-click `index.html` -> "Open with Live Server" (or just double-click `index.html`; no server is needed).

There is no Streamlit version of this one yet.

## What changed from the US game
| US game | Argentina |
|---|---|
| Republican vs. Democrat | **Non-Peronist (NP, Candidate 1)** vs. **Peronist (PJ, Candidate 2)** |
| 50 states + DC, Electoral College | 23 provinces + the City of Buenos Aires (CABA), **national popular vote** |
| Winner = most electoral votes | Winner = most positive votes nationwide (simple majority of the two candidates' votes) |
| Margins `R+6.2` / `D+3.1` | `NP+6.2` / `PJ+3.1` |
| Issues: trade, immigration, partisanship, abortion, foreign policy | Economy (role of the state), security, Peronism, abortion, foreign policy (alignment) |

Because each province just contributes its own votes, there are no electoral-vote quirks (no split electors, no
winner-take-all). Provinces that are small in votes (Tierra del Fuego, Santa Cruz) matter much less than in the US game.

Only the **second round** is modelled: a first round has more than two relevant candidates, and the model is strictly
head-to-head. The first-round rules (45%, or 40% with a 10-point lead, to avoid a runoff) are not simulated.

## Election presets
- **2023:** Javier Milei (La Libertad Avanza) vs. Sergio Massa (Unión por la Patria)
- **2015:** Mauricio Macri (Cambiemos) vs. Daniel Scioli (Frente para la Victoria)
- **2011:** Hermes Binner (Frente Amplio Progresista) vs. Cristina Fernández de Kirchner (Frente para la Victoria), first round
- **2007:** Elisa Carrió (Coalición Cívica) vs. Cristina Fernández de Kirchner (Frente para la Victoria), first round
- **2003:** Carlos Menem (Frente por la Lealtad) vs. Néstor Kirchner (Frente para la Victoria), first round
- **2001 Shift:** a hypothetical scenario (not a real election) with its own PVI and five stances for every province, and 2023 turnout.
  The values are in the `SCENARIOS` table in `script.js` and are editable like everything else.
- **Current day:** every province at its average lean over the two real runoffs, with 2023 turnout. This is the Argentine version of
  the Cook PVI: for each runoff take (province margin - national margin) / 2, then average the two. The 2003-2011 presets are
  deliberately left out of this average.

The only two presidential runoffs ever held are 2015 and 2023 (the ballotage dates from the 1994 constitution; in 2003 Menem
withdrew before the runoff, so no vote took place). For the earlier years the preset is the **head-to-head of the two first-round
leaders**: only their votes count, so each province starts at its real split between those two (the other candidates' votes are
dropped, and each province's weight is the sum of the two candidates' votes). A few things to know:
- 2011 and 2007 were landslides, so their national environments are far outside the later ones (about PJ+52.5 and PJ+32.5).
  The National Environment slider now runs from PJ+60 to NP+60 to hold them.
- 2003 was Menem vs. Kirchner, both Peronists. Candidate 1 is Menem (the market-oriented side) and Candidate 2 is Kirchner, so there
  the "NP" and "PJ" labels only mean Candidate 1 and Candidate 2.
- Binner (2011) is not a market conservative, he is simply the non-Peronist leader. Move the sliders if you want a different profile.

A preset sets each province's real number of votes and real margin, the national environment, and the nominees' names.
Candidates start at a typical profile with equal approval, so running a preset as-is reproduces the real result:
2023 gives Milei 21 of 24 districts and 14,476,460 votes (real: 14,476,462); 2015 gives Macri 9 of 24 and
12,988,338 votes (real: 12,988,349). The first-round presets reproduce their data the same way (2011: Fernández de Kirchner
wins all 24 districts; 2007: Carrió wins only the City of Buenos Aires; 2003: Menem wins 15 of 24 districts, 52.7% to 47.3%). Then move any slider to ask "what if". Turnout is held fixed at the real runoff turnout.

## First round and adding candidates
Pick **Round: First round** to play the multi-candidate first round of any preset. The candidate area becomes a list of cards:
**+ Add candidate** adds a newcomer (up to 8), the **x** on a card removes one (down to 2), and each card has the same five
issue sliders (Peronism now runs 1-10), approval and home province. The real elections start with their real candidates, plus a
fixed "Others" bucket (2003, 2007, 2011 and 2015 have one; 2023 does not). "Current day" and "2001 Shift" start with two typical
candidates and no real shares.

**The 45% / 40+10 rule.** A candidate wins outright with at least 45% of the positive votes, or more than 40% and a lead of more
than 10 points. Otherwise the top two go to a runoff and the results show a **Runoff Projection**. Run as-is, the real first
rounds give the real outcomes: 2007 and 2011 (Fernández de Kirchner) are decided in round one; 2003, 2015 and 2023 go to a runoff.

**How the first-round model works.** Each candidate has a strength in every province and shares are the softmax of the strengths
(multinomial logit). For a real election a candidate starts at ln(real provincial share), so with the starting profile, equal
approval and an EVEN environment the model reproduces every province's real votes exactly (checked to under a vote). Moving a
slider changes strength by `0.02 x (change in issue fit)`, province PVI by `0.03 x PVI x (how non-Peronist the candidate is)`,
approval by `0.01 x (approval - 50)`, a home province by `+0.08`, and the National Environment by `0.01 x margin x (how
non-Peronist)`. A **newcomer** in a real election starts at the average strength of the field in each province (so it takes an
average slice and the others shrink in proportion); in the scenarios it starts from the province lean at its profile, 1.5 behind a
main candidate. The constants (`R1_*` in `script.js`) are rough calibrations, not a fitted forecast, and the starting profiles of the
real candidates (`R1_PROFILES`) are the author's estimates, like the province stances.

**How the runoff projection works.** In each province every eliminated candidate's votes are split between the two finalists by how
close each finalist is to them on the five issues (Peronism counts double); "Others" split by the province's stances. The runoff is
counted on positive votes only, like the real ones. `R2_TAU` was tuned on the only two real runoffs, so treat that check as
in-sample: from the real first rounds it gives Macri 50.6% (real 51.3%) and Milei 55.8% (real 55.7%), about 2-3 points off per
province. 2003, 2007 and 2011 have no real runoff to compare with.

**Runoff settings** (shown under the runoff projection, they recalculate it live without re-running round one):
- *Per eliminated candidate:* voters decide on their own (default); **endorses** finalist A or B (a share of their voters, set by
  "How many voters follow an endorsement", default 50%, follow it and the rest decide on their own); **stays neutral** (10 extra points of
  their voters stay home); or a **custom split** (a fixed percentage to A, the rest to B). Settings are kept when you re-run round one
  with the same finalists and reset when the finalists change.
- *Drop-out:* voters far from BOTH finalists may not vote for either: drop-out = the slider (default 40%) x their distance to the
  nearest finalist as a share of the largest possible distance. "Others" count as moderately far. Dropped voters leave the count.
- *Turnout:* scales every vote up or down by the slider (positive votes versus the first round), which changes the totals but not the
  shares. The result shows the runoff's positive votes, the change from round one and how many voters dropped out.
- *Calibration, honestly:* with the defaults the national shares of both real runoffs stay within 0.7 points. The positive-vote total moves
  by -2.8% (2015) and -2.1% (2023), against real changes of +0.5% and -3.0%. 2023 is close; 2015 is not, because its blank
  first-round votes became positive ones. One drop-out rule cannot fit both, so treat the total as rough and set your own with the slider.

## How margins work
Margins are in percentage points of the two candidates' combined votes (NP minus PJ):

    margin = national environment + national swing from approval
           + 2 x province PVI
           + 0.5 x (how much better Candidate 1 fits the province than Candidate 2,
                    compared with a typical non-Peronist vs. a typical Peronist)

Each province's votes are then split by its margin (`NP votes = votes x (100 + margin) / 200`), summed nationally, and
whoever has more votes wins. Everything else works as in the US game: every point of approval gap moves every province by
0.25 points, a home province is worth 4 issue-score points (2.0 points of margin), a margin of exactly 0.0 is decided at
random, and the national environment slider runs from PJ+60 to NP+60. For reference, 2015 was about NP+2.5, 2023 about NP+11.5 and the 2011 first round about PJ+52.5.

## Province Settings
Open "Province Settings (PVI & stances)", pick a province, and change its PVI or any of its five stances. Edits are kept
for all provinces until you press "Reset this province", "Reset all provinces", or "Restart Game". Edits are measured
against the preset's original province data.

**The issue stances are rough estimates by the author, not data.** As in the US game, the real candidates' stances are
already baked into each province's real result, so the stances only matter for what-ifs. Edit any province you disagree with
(the table at the top of `script.js`).

## Data and accuracy
- `data/runoffs.csv` holds the final positive votes of both candidates in every province for both runoffs.
- 2015: definitive count from the national electoral authority (Dirección Nacional Electoral), as tabulated on Wikipedia's
  "2015 Argentine general election". National totals: Macri 12,988,349, Scioli 12,309,575.
- 2023: provincial results published by La Gaceta (Tucumán) at 99.3% of polling stations counted; its national totals
  (Milei 14,476,462, Massa 11,516,142) are the official ones, and the provincial rows sum to them exactly. Percentages
  are of positive votes (blank and invalid votes excluded), the same basis Argentina uses for the runoff.
- `data/first_round.csv` holds the first-round votes of every named candidate (plus "Others") in every province for 2003, 2007,
  2011, 2015 and 2023. For 2003-2015 the base is the Atlas Electoral (Andy Tow) polling-table counts, as redistributed by the polAr
  project (https://github.com/electorArg/PolAr_Data). Those are provisional counts, so each candidate's provincial votes are scaled
  to the official national total (Wikipedia, "<year> Argentine general election"). 2023 is Wikipedia's province table as is (its
  columns sum to the official totals exactly; `data/first_round_2023.csv`). The 2003, 2007 and 2011 "head-to-head" presets are the
  first two candidates in that file. `tools/extract_first_round.py` rebuilds the CSV, but it is a reconstruction of an original that
  was overwritten: it matches 533 of 552 province cells and every national total, the rest differ by at most 2 votes.
- To rebuild `elections.js` after editing a CSV: `python tools/build_elections.py`. It refuses to write the file unless all
  24 districts are present, every province margin reproduces its real vote split, and the national totals match the official ones
  (exactly for the runoffs, within 0.02% for the first-round head-to-heads).

## Tuning
The constants are at the top of the model section of `script.js`: `TYPICAL_NP`, `TYPICAL_PJ`, `HOME_STATE_BONUS`,
`POINTS_TO_MARGIN`, `PVI_TO_MARGIN`, `APPROVAL_TO_MARGIN`. They are rough calibrations carried over from the US game, not a
fitted forecast model. Argentine runoffs have swung a lot between elections (NP+2.7 in 2015, NP+11.4 in 2023), so use the
national environment slider for big swings.
