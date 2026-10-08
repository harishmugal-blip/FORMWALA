#!/usr/bin/env python3
"""Extract video descriptions from fetched YouTube watch pages."""
import json, re, glob, os

VIDS = {
    '5ipwvIxAJp0': 'Birth Certificate New Rules 2026',
    'KulAoD1YWos': 'New Voter Card 2026 Full Process',
    'PL06cBAEADA': 'Ayushman Card Mobile Se',
    'SonXJdr2tEw': 'Ayushman Vay Vandana 70+',
    'olUNiM1YmDA': 'E-Shram Card Registration',
    'IDzS2L0K6go': 'Minor PAN Card',
    'HF-lkmy_oCA': 'Voter ID Mobile Se',
    'Q4q9CqgEGz4': 'DigiLocker Account',
}

out = {}
for vid, label in VIDS.items():
    path = f'/home/z/my-project/scripts/research/video-{vid}.json'
    if not os.path.exists(path):
        print(f'!! missing {vid}')
        continue
    d = json.load(open(path))
    data = d.get('data', d)
    raw = data.get('html', '') or ''
    desc = ''
    # ytInitialPlayerResponse -> videoDetails.shortDescription
    m = re.search(r'"shortDescription":"((?:[^"\\]|\\.)*)"', raw)
    if m:
        desc = m.group(1).encode().decode('unicode_escape', errors='ignore')
    title = ''
    mt = re.search(r'"title":"((?:[^"\\]|\\.)*)"', raw)
    if mt:
        title = mt.group(1).encode().decode('unicode_escape', errors='ignore')
    out[vid] = {'label': label, 'title': title[:150], 'desc': desc[:4000]}
    print(f'=== [{vid}] {label} | title: {title[:80]} | desc len: {len(desc)}')
    print(desc[:1200].replace('\\n', '\n'))
    print()

json.dump(out, open('/home/z/my-project/scripts/research/video-descriptions.json', 'w'), ensure_ascii=False, indent=1)
print('SAVED video-descriptions.json')
