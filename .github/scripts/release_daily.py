"""Release at most five region URLs per Korean calendar day; resume pending batches."""
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.parse as U
import urllib.request as R
from urllib.error import HTTPError
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.daily-release.json'
SITE = 'https://1mintelecom.com'
TAG = '<meta name="robots" content="noindex,follow">'

def save(state):
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')

def prepare():
    state = json.loads(STATE.read_text())
    today = dt.datetime.now(ZoneInfo('Asia/Seoul')).date().isoformat()
    if not state.get('pending') and state['last_release_date'] != today:
        candidates = [p for p in state['order'] if TAG in (ROOT / p).read_text()][:5]
        if candidates:
            sitemap = (ROOT / 'sitemap.xml').read_text()
            additions = []
            for p in candidates:
                source = (ROOT / p).read_text()
                url = SITE + U.quote('/' + p)
                canonical = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"', source)
                assert canonical and U.unquote(canonical[1]) == U.unquote(url), p
                assert source.count(TAG) == 1, p
                (ROOT / p).write_text(source.replace(TAG, ''))
                assert url not in sitemap, url
                additions.append(f'  <url><loc>{url}</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>')
            sitemap = sitemap.replace('</urlset>', '\n'.join(additions) + '\n</urlset>')
            ET.fromstring(sitemap)
            (ROOT / 'sitemap.xml').write_text(sitemap)
            state['pending'] = candidates
            state['last_release_date'] = today
            state['history'].append({'date': today, 'paths': candidates, 'status': 'pending'})
            plan = json.loads((ROOT / '.release-plan.json').read_text())
            released = [p for p in state['order'] if TAG not in (ROOT / p).read_text()]
            plan['released_paths'] = released
            # Retain the legacy wave field, counting only fully completed waves.
            plan['released'] = 1 + max(0, (len(released) - 18) // 12)
            (ROOT / '.release-plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=1) + '\n')
    state['remaining'] = sum(TAG in (ROOT / p).read_text() for p in state['order'])
    state['complete'] = state['remaining'] == 0 and not state.get('pending')
    save(state)
    active = bool(state.get('pending'))
    if os.getenv('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            f.write(f'pending={str(active).lower()}\n')
    print(json.dumps({'pending': state.get('pending', []), 'remaining': state['remaining'], 'complete': state['complete']}, ensure_ascii=False))

def notify_naver(body):
    """Send the same IndexNow body to Naver directly; never fail the job, return the status or error."""
    req = R.Request('https://searchadvisor.naver.com/indexnow', data=body, headers={'Content-Type': 'application/json; charset=utf-8'}, method='POST')
    try:
        with R.urlopen(req, timeout=30) as response:
            return response.status
    except HTTPError as e:
        return e.code
    except Exception as e:
        return f'error: {type(e).__name__}: {e}'[:200]

def notify():
    state = json.loads(STATE.read_text())
    paths = state.get('pending', [])
    if not paths:
        return
    urls = [SITE + U.quote('/' + p) for p in paths]
    for attempt in range(30):
        try:
            stamp = '?release_check=' + str(int(time.time()))
            sitemap = R.urlopen(SITE + '/sitemap.xml' + stamp, timeout=20).read().decode()
            locs = {x.text for x in ET.fromstring(sitemap).iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')}
            assert set(urls) <= locs
            for url in urls:
                with R.urlopen(url + stamp, timeout=20) as response:
                    assert response.status == 200
                    assert 'noindex' not in response.read().decode().lower()
                    assert 'noindex' not in response.headers.get('X-Robots-Tag', '').lower()
            break
        except Exception:
            if attempt == 29:
                raise
            time.sleep(15)
    key = '8a9a3f47c059d4cc1e1c80d5ab1fa48e'
    assert R.urlopen(SITE + '/' + key + '.txt', timeout=20).read().decode().strip() == key
    body = json.dumps({'host': '1mintelecom.com', 'key': key, 'keyLocation': SITE + '/' + key + '.txt', 'urlList': urls}).encode()
    req = R.Request('https://api.indexnow.org/indexnow', data=body, headers={'Content-Type': 'application/json'}, method='POST')
    with R.urlopen(req, timeout=30) as response:
        assert response.status in (200, 202)
        state['history'][-1].update(status='submitted', indexnow=response.status)
    state['history'][-1]['naver'] = notify_naver(body)
    state['pending'] = []
    state['complete'] = state['remaining'] == 0
    save(state)
    print('Deployment verified and IndexNow accepted:', len(urls), '| Naver:', state['history'][-1]['naver'])

if __name__ == '__main__':
    {'prepare': prepare, 'notify': notify}[sys.argv[1]]()
