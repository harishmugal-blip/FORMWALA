#!/usr/bin/env python3
"""Extract video titles from SarkariDNA channel via ytInitialData walk."""
import json, re

d = json.load(open('/home/z/my-project/scripts/research/sarkaridna-page.json'))
data = d.get('data', d)
raw = data.get('html', '') or ''

# Extract ytInitialData object
m = re.search(r'var ytInitialData = (\{.*?\});</script>', raw, re.S)
if not m:
    m = re.search(r'ytInitialData"?\s*[=:]\s*(\{.*?\});', raw, re.S)

videos = []
if m:
    try:
        ytd = json.loads(m.group(1))
        def walk(o):
            if isinstance(o, dict):
                if 'lockupViewModel' in o:
                    lv = o['lockupViewModel']
                    vid = lv.get('contentId', '')
                    title = ''
                    try:
                        title = lv['metadata']['lockupMetadataViewModel']['title']['content']
                    except Exception:
                        pass
                    if vid and title:
                        videos.append({'video_id': vid, 'title': title})
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(ytd)
    except json.JSONDecodeError as e:
        print('JSON parse failed:', e)
else:
    print('ytInitialData not found, trying regex fallback')
    # fallback: contentId + title.content pairs
    for mm in re.finditer(r'"contentId":"([^"]+)"(?:.{0,8000}?)' + r'"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"', raw, re.S):
        t = mm.group(2).encode().decode('unicode_escape', errors='ignore')
        videos.append({'video_id': mm.group(1), 'title': t[:200]})

# dedupe
seen, out = set(), []
for v in videos:
    if v['video_id'] not in seen:
        seen.add(v['video_id'])
        out.append(v)

print(f'TOTAL VIDEOS: {len(out)}')
for v in out:
    print(f"- [{v['video_id']}] {v['title']}")

json.dump(out, open('/home/z/my-project/scripts/research/channel-videos.json', 'w'), ensure_ascii=False, indent=1)
