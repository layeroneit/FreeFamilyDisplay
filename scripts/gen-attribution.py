"""Generates ATTRIBUTION.md from the two shipped image manifests.

Every image committed to this repo is redistributed when the repo is public, and
the CC BY / CC BY-SA licences make attribution mandatory on redistribution. The
app already credits each photo on screen; this file is the same information in
the form a reader of the source tree can check.
"""
import io
import json
from collections import Counter

wall = json.load(io.open('apps/web/public/wallpapers/manifest.json', encoding='utf-8'))
login = json.load(io.open('apps/web/public/login-photos/credits.json', encoding='utf-8'))

lines = []
w = lines.append

w('# Attribution')
w('')
w('Free Family Display ships photographs that other people made and licensed for')
w('reuse. The software is Apache 2.0 (see `LICENSE`); **these images are not** —')
w('each one stays under its own licence, listed below.')
w('')
w('Generated from `apps/web/public/wallpapers/manifest.json` and')
w('`apps/web/public/login-photos/credits.json`, which are also what the app reads')
w('to print the credit on screen. Regenerate with `npm run attribution`.')
w('')

licences = Counter()
total = 0

w('## Wallpaper collections')
w('')
for c in wall['collections']:
    w(f"### {c['name']}")
    w('')
    if c.get('description'):
        w(c['description'])
        w('')
    w('| Image | Photographer | Source | Licence |')
    w('| --- | --- | --- | --- |')
    for img in c['wallpapers']:
        a = img['attribution']
        name = img['basePath'].rstrip('/').split('/')[-1]
        url = a.get('sourceUrl') or ''
        src = f"[{a['source']}]({url})" if url else a['source']
        w(f"| `{name}` | {a['photographer']} | {src} | {a['license']} |")
        licences[a['license']] += 1
        total += 1
    w('')

w('## Sign-in page photographs')
w('')
w('| Image | Photographer | Source | Licence |')
w('| --- | --- | --- | --- |')
for p in login:
    src = p.get('sourceUrl') or ''
    source = f"[{p['source']}]({src})" if src else p['source']
    w(f"| `{p['file']}` | {p['photographer']} | {source} | {p['license']} |")
    licences[p['license']] += 1
    total += 1
w('')

w('## Summary')
w('')
w(f'{total} images in total.')
w('')
w('| Licence | Images |')
w('| --- | --- |')
for lic, n in sorted(licences.items(), key=lambda kv: (-kv[1], kv[0])):
    w(f'| {lic} | {n} |')
w('')
w('Share-alike (CC BY-SA) applies to the images themselves and to adaptations of')
w('them. It does not reach the source code, which is separately licensed under')
w('Apache 2.0.')
w('')
w('Anything a household adds to its own instance — its own photos, a linked')
w('album, or art fetched by tag — is never committed here and is never')
w('redistributed by this project.')
w('')

io.open('ATTRIBUTION.md', 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
print(f'ATTRIBUTION.md: {total} images, {len(licences)} distinct licences')
for lic, n in sorted(licences.items(), key=lambda kv: -kv[1]):
    print(f'  {n:3d}  {lic}')
