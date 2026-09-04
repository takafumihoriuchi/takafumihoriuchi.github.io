"""Shared constants for ASCII page wiring and validation."""

ASSET_VERSION = "20260904-2"
MODULE = (
    '<script type="module" src="/ascii/ascii-hero.js'
    f'?v={ASSET_VERSION}"></script>'
)
PREPAINT = (
    '<script>document.documentElement.classList.add("ascii-load-pending");'
    'setTimeout(()=>document.documentElement.classList.remove('
    '"ascii-load-pending"),2500);</script>'
)
