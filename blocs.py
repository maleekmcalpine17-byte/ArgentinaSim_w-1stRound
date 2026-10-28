"""
Classifies list names of the national legislative elections into political blocs, for tools/build_legislative.py.

Blocs (id: label, Peronism score 1-10 used by the "national environment" slider):
  fpv     Kirchnerism (Frente para la Victoria, Unidad Ciudadana, Frente de Todos, Unión por la Patria)     9
  fedper  Other Peronism (PJ lists outside the above, Frente Renovador, UNA, Consenso Federal, Hacemos ...)  7
  ucr     UCR on its own lists (before the Cambiemos coalition)                                              3
  pro     PRO and the Cambiemos / Juntos por el Cambio coalitions                                            2
  civic   Civic and progressive centre-left (ARI, Coalición Cívica, Socialists, FAP, Proyecto Sur, UNEN)     3
  libert  Libertarian and conservative right (Recrear, Avanza Libertad, La Libertad Avanza, UCeDé)           2
  left    Left (FIT, Partido Obrero, PTS, MST, Izquierda Socialista, Nuevo MAS)                              4
  prov    Provincial and local parties, and everything else                                                  5

This is a judgment call, not data: it is a set of keyword rules plus a few province-specific overrides, tuned by looking at the lists
that carry the most votes. Lists that match nothing go to "prov". Edit RULES / OVERRIDES to change it.
"""
import re
import unicodedata

BLOCS = [
    ("fpv", "Kirchnerism (FPV / FdT / UxP)", 9, "#2f9bd6"),
    ("fedper", "Other Peronism", 7, "#1fb5a6"),
    ("ucr", "UCR (own lists)", 3, "#e0553f"),
    ("pro", "PRO / Cambiemos / JxC", 2, "#d9a400"),
    ("civic", "Civic and progressive centre-left", 3, "#2fa35a"),
    ("libert", "Libertarian / conservative right", 2, "#8e5bd6"),
    ("left", "Left (FIT and others)", 4, "#d64545"),
    ("prov", "Provincial parties and others", 5, "#8a93a6"),
]


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", s).split())


# (regex, bloc): first match wins, so the order matters
RULES = [
    (r"frente para la victoria|fte para la victoria|fte p la victoria|p la vict|frente de todos|frente todos|union por la patria|"
     r"unidad ciudadana|fpv|justicialista para la victoria|frente victoria|de la victoria|frente civico para la victoria|"
     r"union por chaco|unidad portena|fte civico por santiago|frente civico por santiago|frente de la esperanza|para la victoria|"
     r"fte de todos|frente jujeno", "fpv"),
    (r"izquierda|obrero|trabajadores|socialismo|mst|pts|nuevo mas|partido obrero|frente de izquierda|"
     r"movimiento al socialismo|workers", "left"),
    (r"cambiemos|juntos por el cambio|union pro|propuesta republicana|\bpro\b|compromiso para el cambio|cambia mendoza|"
     r"cambia jujuy|unidos por la libertad y el trabajo|vamos juntos|ucr pro|somos mendoza|alianza cambiemos", "pro"),
    (r"libertad avanza|avanza libertad|recrear|union del centro democratico|ucede|union de centro democratico|"
     r"fuerza republicana|republicanos unidos|frente republicano|partido federal|unite por la libertad|partido democrata", "libert"),
    (r"union para el desarrollo social|udeso|union civica radical|\bucr\b|radical|frente civico y social|concertacion forja|"
     r"encuentro por corrientes|chaco merece mas|encuentro para el cambio|frente cambia|alianza frente civico federal", "ucr"),
    (r"coalicion civica|afirmacion para una republica|\bari\b|socialista|proyecto sur|autodeterminacion y libertad|frente amplio progresista|"
     r"\bfap\b|\bunen\b|progresista|acuerdo civico y social|\bgen\b|generacion para un encuentro|libres del sur|nuevo encuentro|"
     r"frente progresista|vecinal|solidaridad e igualdad|concertacion plural|fte civico federal|frente civico|frente nuevo|"
     r"encuentro amplio|humanista|\bfte civico\b", "civic"),
    (r"frente renovador|unidos por una nueva alternativa|\buna\b|consenso federal|hacemos por nuestro pais|hacemos por cordoba|"
     r"compromiso federal|frente popular|union por cordoba|frente justicialista|justicialista|\bpj\b|peronis|movimiento popular|"
     r"frente grande|alternativa federal|1pais|frente para la concordia|renovador|unidad federalista|frente cordoba ciudadana|"
     r"frente de unidad peronista|primero la gente|vamos con vos|justicia union y libertad|santa fe federal|"
     r"salta somos todos|union por salta|unidad y renovacion|por la integracion|union por entre rios|union chubut", "fedper"),
]

# (province, regex on the normalised name) -> bloc, checked before RULES. For lists whose national meaning depends on the province.
OVERRIDES = [
    ("Santiago del Estero", r"frente civico por santiago", "fpv"),
    ("Formosa", r"frente de la esperanza|frente para la victoria|justicialista", "fpv"),
    ("Catamarca", r"frente civico y social", "fpv"),
    ("La Rioja", r"frente justicialista|justicialista", "fpv"),
    ("Santa Cruz", r"frente para la victoria|frente victoria|union para vivir mejor", "fpv"),
    ("Tierra del Fuego", r"movimiento popular fueguino", "prov"),
    ("Neuquén", r"movimiento popular neuquino", "prov"),
    ("Río Negro", r"juntos somos rio negro|frente grande|alianza juntos", "prov"),
    ("Córdoba", r"union por cordoba|hacemos por nuestro pais|primero la gente", "fedper"),
    ("Misiones", r"frente renovador de la concordia|frente para la concordia", "fpv"),
    ("San Luis", r"frente justicialista|compromiso federal|alianza frente|union por san luis|frente popular", "fedper"),
    ("Chubut", r"chubut al frente|frente chubut", "prov"),
]


def classify(province, name):
    n = norm(name)
    for prov, pat, bloc in OVERRIDES:
        if prov == province and re.search(pat, n):
            return bloc
    for pat, bloc in RULES:
        if re.search(pat, n):
            return bloc
    return "prov"
