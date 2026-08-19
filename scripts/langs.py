"""The one place the language set is written down.

Both scripts/ tools read this. Adding a language means adding a row here, a
directory of pages, and nothing else — the alternates and the switcher on every
existing page are rewritten from this table by wire-i18n.py, and check-i18n.py
verifies the result.

Display order is global reach, which is the order the switcher shows. Esperanto
sits last: it is not on that list, and it is not there for reach.
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
]

# Occupies the site root and the x-default slot. That is a statement about
# which version answers when none of the languages match the reader, not about
# rank: every version is an alternate of every other.
DEFAULT_LANG = "en"


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
