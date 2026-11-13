#!/usr/bin/env python3
"""Rewrite the two blocks that state who the author is.

Like wire-i18n.py this is not a build step: it edits finished HTML in place, the
way a find-and-replace would, and touches nothing else on the page. The two
blocks are

  * the schema.org Person node in the page's JSON-LD — every page carries one,
    and a work page carries a full copy because it is usually read on its own;
  * the profile links under the name on the home page.

Both come from PROFILES / PERSON / PERSON_LANGS in langs.py, so the links a
reader can click and the `sameAs` a crawler reads are one list rather than two
that have to be kept equal by hand. Only languages listed in PERSON_LANGS are
touched; the others are reported as not yet wired and left as written.

One structural edit besides rewriting the node: a work page that nests the
author inside the work, instead of declaring the shared Person node and
pointing at it, is brought into the shared shape (see lift_inline_author).
Everything else on the page, the work's own properties included, is kept.

    python3 scripts/wire-person.py            # rewrite every wired page
    python3 scripts/wire-person.py --check    # report what would change, write nothing
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from langs import LANGS, PAGES, PROFILES, PERSON, PERSON_ID, PERSON_LANGS, person_node  # noqa: E402

# The work template is not a page of the site (it is noindex and not in PAGES),
# but every new work page starts as a copy of it, so it must not start stale.
EXTRA = [("en", "works/_template/index.html")]

# The author's own Person object, found by its shape: an opening brace at some
# indent, an optional @context line (the home page's node is the whole
# document), the @type, the author's @id, and everything down to the brace that
# closes it at the same indent. The @id is what separates the author from the
# co-authors some academic works list as plain Person nodes of their own.
PERSON_RE = re.compile(
    r'^(?P<indent> *)\{\n(?P<ctx> *"@context": "[^"]*",\n)? *"@type": "Person",\n'
    r' *"@id": "' + re.escape(PERSON_ID) + r'",\n.*?^(?P=indent)\}',
    re.S | re.M,
)

# The home page's profile row: the first <nav> after the identity lockup.
IDENTITY_RE = re.compile(r'class="identity home-identity"')
NAV_RE = re.compile(r'(<nav aria-label="[^"]*">\n *<ul>\n)(.*?)(\n *</ul>\n *</nav>)', re.S)


def render_person(node: dict, indent: str, ctx: str) -> str:
    inner = indent + "  "
    members = []
    for key, value in node.items():
        if isinstance(value, list):
            items = ",\n".join(f"{inner}  {json.dumps(v, ensure_ascii=False)}" for v in value)
            members.append(f"{inner}{json.dumps(key)}: [\n{items}\n{inner}]")
        else:
            members.append(f"{inner}{json.dumps(key)}: {json.dumps(value, ensure_ascii=False)}")
    body = ",\n".join(members)
    return f"{indent}{{\n{ctx}{body}\n{indent}}}"


BLOCK_RE = re.compile(r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>', re.S)


def lift_inline_author(src: str, code: str, where: str) -> str:
    """Give a page the shared shape: a Person node, and a work that points at it.

    A page may be written with the author nested inside the work, as a copy of
    its own. That copy has no `sameAs` to keep in step and nothing to bind it to
    the other pages' author, so it is lifted into the graph and the work
    refers to it by @id, as every other work page does.
    """
    for m in BLOCK_RE.finditer(src):
        doc = json.loads(m.group(1))
        author = doc.get("author")
        if "@graph" in doc or not isinstance(author, dict) or author.get("name") != PERSON["name"]:
            continue
        work = {}
        for key, value in doc.items():
            if key == "@context":
                continue
            work[key] = value
            if key == "@type":
                work.setdefault("@id", doc.get("@id", doc["url"] + "#work"))
        members = ",\n".join(
            f'      "author": {{ "@id": {json.dumps(PERSON_ID)} }}' if k == "author"
            else f"      {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}"
            for k, v in work.items()
        )
        graph = (
            '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@graph": [\n'
            + render_person(person_node(code), "    ", "")
            + f",\n    {{\n{members}\n    }}\n  ]\n}}\n</script>"
        )
        return src[: m.start()] + graph + src[m.end():]
    raise SystemExit(f"{where}: no Person node, and no work with the author written inline")


def wire_person(src: str, code: str, where: str) -> str:
    if not PERSON_RE.search(src):
        src = lift_inline_author(src, code, where)
    if len(PERSON_RE.findall(src)) != 1:
        raise SystemExit(f"{where}: expected one author Person node")
    node = person_node(code)
    return PERSON_RE.sub(
        lambda m: render_person(node, m.group("indent"), m.group("ctx") or ""), src, count=1
    )


def wire_profiles(src: str, code: str, where: str) -> str:
    anchor = IDENTITY_RE.search(src)
    nav = NAV_RE.search(src, anchor.end()) if anchor else None
    if not nav:
        raise SystemExit(f"{where}: no profile row under the home identity")
    first = re.search(r"^( *)<li>", nav.group(2), re.M)
    indent = first.group(1) if first else "          "
    # A right-to-left page keeps a service's name in its own direction, so the
    # label is isolated: "LinkedIn" must not take part in the Arabic line's order.
    rtl = next(direction for c, _, _, direction in LANGS if c == code) == "rtl"
    items = "\n".join(
        f'{indent}<li><a class="ext" rel="me" href="{url}">'
        + (f'<bdi dir="ltr">{label}</bdi>' if rtl else label)
        + "</a></li>"
        for label, url in PROFILES
    )
    return src[: nav.start(2)] + items + src[nav.end(2):]


def targets(root: Path):
    for page in PAGES:
        for code, d, _, _ in LANGS:
            if code in PERSON_LANGS:
                yield code, page, root / d / page / "index.html"
    for code, rel in EXTRA:
        yield code, None, root / rel


def main() -> int:
    check_only = "--check" in sys.argv
    root = Path(__file__).resolve().parent.parent
    changed, missing = [], []

    for code, page, path in targets(root):
        if not path.exists():
            missing.append(str(path.relative_to(root)))
            continue
        before = path.read_text(encoding="utf-8")
        after = wire_person(before, code, str(path.relative_to(root)))
        if page == "":
            after = wire_profiles(after, code, str(path.relative_to(root)))
        if after != before:
            changed.append(str(path.relative_to(root)))
            if not check_only:
                path.write_text(after, encoding="utf-8")

    for m in missing:
        print(f"  skipped (does not exist yet): {m}")
    unwired = [code for code, _, _, _ in LANGS if code not in PERSON_LANGS]
    if unwired:
        print(f"not yet wired (left as written): {', '.join(unwired)}")
    verb = "would rewrite" if check_only else "rewrote"
    print(f"{verb} {len(changed)} file(s)" + ("" if not changed else ":"))
    for c in changed:
        print("  " + c)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
