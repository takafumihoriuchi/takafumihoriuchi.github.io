"""The one place the language set is written down.

Both scripts/ tools read this. Adding a language means adding a row here, a
directory of pages, and nothing else — the alternates and the switcher on every
existing page are rewritten from this table by wire-i18n.py, and check-i18n.py
verifies the result.

Display order is global reach, which is the order the switcher shows. Esperanto
sits last: it is not on that list, and it is not there for reach. Korean is the
one row placed by hand rather than by reach — it follows Japanese on the owner's
instruction (2026-08-24).
"""

SITE = "https://takafumihoriuchi.github.io"

# (code, directory, name written in that language, dir attribute or None)
LANGS = [
    ("en",      "",        "English",          None),
    ("zh-Hans", "zh-Hans", "中文（简体）",       None),
    ("zh-Hant", "zh-Hant", "中文（繁體）",       None),
    ("es",      "es",      "Español",          None),
    ("ar",      "ar",      "العربية",           "rtl"),
    ("pt",      "pt",      "Português",        None),
    ("fr",      "fr",      "Français",         None),
    ("ja",      "ja",      "日本語",             None),
    ("ko",      "ko",      "한국어",             None),
    ("ru",      "ru",      "Русский",          None),
    ("de",      "de",      "Deutsch",          None),
    ("it",      "it",      "Italiano",         None),
    ("id",      "id",      "Bahasa Indonesia", None),
    ("eo",      "eo",      "Esperanto",        None),
]

# One entry per translatable page, as a path under a language root.
# Add a line when a work page is added.
PAGES = [
    "",
    "works/my-own-pokemon-generation/",
    "works/personal-fit-ui/",
    "works/masters-thesis-hmi-design/",
    "works/bachelors-thesis-constraint-programming/",
    "works/masters-project-smart-codesign-vr/",
    "works/masters-project-design-studio/",
    "works/masters-project-piano-action/",
    "works/practice-log-n-share/",
    "works/no-ads-simplest-metronome/",
    "works/foot-furniture-interaction/",
    "works/arpeggicho/",
]

# Occupies the site root and the x-default slot. That is a statement about
# which version answers when none of the languages match the reader, not about
# rank: every version is an alternate of every other.
DEFAULT_LANG = "en"

# Pages intentionally published in a subset of languages. Keep these out of
# PAGES until translated; they do not inherit the full site's ASCII scaffolds.
PARTIAL_PAGES = {}


def page_languages(page, langs=None):
    """Only link to translations that are intended to exist for this page."""
    return [lang for lang in (LANGS if langs is None else langs)
            if page not in PARTIAL_PAGES or lang[0] in PARTIAL_PAGES[page]]


def page_url(lang_dir: str, page: str) -> str:
    """Absolute URL of `page` in the language living in `lang_dir`."""
    return f"{SITE}/" + "".join(p for p in (lang_dir and lang_dir + "/", page) if p)


def rel_path(from_dir: str, from_page: str, to_dir: str) -> str:
    """Relative href from one language's copy of a page to another's.

    Internal links stay relative so the pages resolve the same over file:// as
    they do over a server — see OPERATIONS.md §4.
    """
    depth = len([p for p in from_dir.split("/") if p]) + len([p for p in from_page.split("/") if p])
    up = "../" * depth if depth else ""
    tail = "".join(p for p in (to_dir and to_dir + "/", from_page) if p)
    return (up + tail) or "./"


# --- Who the author is -------------------------------------------------------
#
# The second thing this file is the one place for. Every page declares the same
# schema.org Person (a work page carries a full copy, because it is usually read
# on its own — OPERATIONS.md §8), and the home page links to the same profiles
# in the open. Written by hand that is one list in a hundred-odd places, and the
# copies drift: they did, before this table existed. wire-person.py writes both
# from here, and check-i18n.py verifies the result.

# (label, URL), in the order the links appear on the home page. `sameAs` follows
# the same order. The labels are the services' own names and are not translated.
PROFILES = [
    ("LinkedIn", "https://www.linkedin.com/in/takafumi-horiuchi-3b66a21a0/"),
    ("GitHub",   "https://github.com/takafumihoriuchi"),
    ("X",        "https://x.com/takafumihoriuch"),
    ("note",     "https://note.com/lovely_donkey395"),
]

# What every version says about the person. A language's entry in PERSON_LANGS
# overrides any of these with its own.
PERSON = {
    "name": "Takafumi Horiuchi",
    "alternateName": "堀内 貴文",
    "description": "Industrial Design x AI",
}

# Languages whose Person node and home-page profile links are generated from the
# tables above. A language absent here is left exactly as written: it is not yet
# wired, not exempt. Adding one is a row here and a run of wire-person.py.
#
# The role in `description` is the same English phrase in every language, as it
# is on the Japanese page: it is the name of a field, written the same way
# wherever it is read, and the machine-readable copy of what the page's own
# heading says in each language. A row overrides `alternateName` only where the
# language has its own way of writing the name — the same names the pages
# already carried, kept.
PERSON_LANGS = {
    "en": {},
    "ja": {},
    "zh-Hans": {"alternateName": "堀内贵文"},
    "zh-Hant": {},
    "es": {},
    "ar": {"alternateName": ["堀内 貴文", "تاكافومي هوريوتشي"]},
    "pt": {},
    "fr": {},
    "ko": {"alternateName": ["호리우치 다카후미", "堀内 貴文"]},
    "ru": {"alternateName": ["堀内 貴文", "Такафуми Хориучи"]},
    "de": {},
    "it": {},
    "id": {},
    "eo": {},
}


# A name, not an address: nothing is served at the fragment. Every page uses the
# same string, which is what binds the copies into one person. Do not change it.
PERSON_ID = f"{SITE}/#person"


def person_node(code: str) -> dict:
    """The Person node `code`'s pages must carry, in the order they print it."""
    own = {**PERSON, **PERSON_LANGS[code]}
    return {
        "@type": "Person",
        "@id": PERSON_ID,
        "name": own["name"],
        "alternateName": own["alternateName"],
        "url": f"{SITE}/",
        "description": own["description"],
        "sameAs": [url for _, url in PROFILES],
    }
