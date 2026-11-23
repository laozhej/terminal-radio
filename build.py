"""Merge the split sources into the single playable HTML.

Usage: python3 -I build.py <src dir> <output html>
"""
import sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(sys.argv[2])
page = (source / 'radio-shell.html').read_text(encoding='utf-8')
parts = {
    'STYLES': 'radio-style.css',
    'MAP': 'radio-map.js',
    'STAGE': 'radio-stage.js',
    'GAME': 'radio-game.js',
}
for marker, name in parts.items():
    placeholder = f'/* INLINE_{marker} */'
    assert page.count(placeholder) == 1, placeholder
    part = (source / name).read_text(encoding='utf-8').strip()
    assert '</script' not in part.lower() and '</style' not in part.lower(), name
    page = page.replace(placeholder, part, 1)
target.write_text(page, encoding='utf-8')
print(f'{target} · {len(page.encode("utf-8"))} bytes')
