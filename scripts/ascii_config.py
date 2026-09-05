"""Shared constants for ASCII page wiring and validation."""

ASSET_VERSION = "20260906-1"
MODULE = (
    '<script type="module" src="/ascii/ascii-hero.js'
    f'?v={ASSET_VERSION}"></script>'
)
# The guard covers the page until the renderer has its ASCII covers in place.
# Its timeout is for the case where the module never arrives: once the module
# is evaluated it sets data-ascii-load on the same element and takes the
# decision over, because on a slow load the renderer legitimately needs longer
# than this to be ready, and dropping the cover underneath it is the flash of
# bare page the guard exists to prevent.
PREPAINT = (
    '<script>document.documentElement.classList.add("ascii-load-pending");'
    'setTimeout(()=>{if(!document.documentElement.dataset.asciiLoad)'
    'document.documentElement.classList.remove("ascii-load-pending")},'
    '2500);</script>'
)
