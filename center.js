/* 센터 찾기 — 현재 위치 또는 입력한 지역에서 가까운 센터를 거리순 최대 3곳 보여준다.
   개인정보: 위치·이름·연락처·생년월일은 서버로 보내지 않는다. 브라우저 안에서만 쓰고,
   예약 시 사용자가 직접 카카오톡에 붙여넣는다. 저장도 하지 않는다. */
(() => {
  const KAKAO_CHAT = 'https://pf.kakao.com/_TWxfaX/chat';
  const MAX_RESULTS = 3;
  const data = Array.isArray(window.CENTER_DATA) ? window.CENTER_DATA : [];

  const $ = (s) => document.querySelector(s);
  const form = $('#search-form'), input = $('#location-input');
  const btnGeo = $('#use-my-location'), list = $('#result-list');
  const state = $('#result-state'), summary = $('#result-summary');
  const dialog = $('#reserve-dialog'), rForm = $('#reserve-form');
  const fCenter = $('#r-center'), fWhere = $('#r-where'), copyNote = $('#copy-note');

  // 지역명 자동완성 (시·구·동 단위 그대로)
  [...new Set(data.map((c) => c.location))].sort().forEach((loc) => {
    const o = document.createElement('option'); o.value = loc; $('#location-list').append(o);
  });

  const rad = (n) => n * Math.PI / 180;
  function distanceKm(a, b) {
    const R = 6371, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  const distanceText = (km) =>
    km < 1 ? `약 ${Math.max(100, Math.round(km * 1000 / 100) * 100)}m` : `약 ${km.toFixed(1)}km`;

  // 입력한 글자에서 기준점을 찾는다 (외부 주소 API 없이 센터 지역명으로 매칭)
  // 시/도 표기를 데이터와 같은 짧은 이름으로 먼저 통일한다.
  // ('서울시' 의 '시' 가 잘려 '서울' 이 구 이름으로 잡히는 문제를 막는다)
  const SIDO_ALIAS = [
    [/^서울(특별시|시)?/, '서울'], [/^부산(광역시|시)?/, '부산'], [/^대구(광역시|시)?/, '대구'],
    [/^인천(광역시|시)?/, '인천'], [/^광주(광역시|시)?/, '광주'], [/^대전(광역시|시)?/, '대전'],
    [/^울산(광역시|시)?/, '울산'], [/^세종(특별자치시|시)?/, '세종'],
    [/^경기(도)?/, '경기'], [/^강원(특별자치도|도)?/, '강원'], [/^충청북도|^충북/, '충북'],
    [/^충청남도|^충남/, '충남'], [/^전라북도|^전북(특별자치도)?/, '전북'],
    [/^전라남도|^전남/, '전남'], [/^경상북도|^경북/, '경북'], [/^경상남도|^경남/, '경남'],
    [/^제주(특별자치도|도)?/, '제주'],
  ];
  const clean = (v) => {
    let t = (v || '').replace(/\s+/g, ' ').trim();
    for (const [re, name] of SIDO_ALIAS) {
      if (re.test(t)) { t = t.replace(re, name); break; }
    }
    return t.replace(/특별자치도|특별자치시|특별시|광역시/g, '').replace(/\s+/g, ' ').trim();
  };
  const SIDO = ['서울','경기','인천','강원','대전','충남','충북','대구','경북',
                '울산','부산','경남','광주','전남','전북','제주','세종'];

  /* 기준점 찾기.
     - 구·시·동 이름이 실제 센터와 맞으면 그 지점을 기준으로 거리 계산 (exact)
     - 시/도 이름만 맞으면 거리 계산이 의미 없다. 해당 시/도 목록만 보여준다 (sido)
     센터가 없는 구(예: 서울 강남구)의 좌표를 지어내지 않기 위한 구분이다. */
  function findAnchor(query) {
    const q = clean(query);
    if (!q) return { kind: 'empty' };
    const words = q.split(' ').filter(Boolean);
    const sido = SIDO.find((s) => q.startsWith(s)) || null;
    const rest = words.filter((w) => !SIDO.includes(w) && !SIDO.some((s) => w === s));

    let best = null, bestScore = 0;
    data.forEach((c) => {
      const loc = clean(c.location);
      let score = 0;
      rest.forEach((w) => {
        if (loc.includes(w)) score += w.length * 2;
        else {
          const stem = w.replace(/(시|군|구|읍|면|동|리|가|로|길)$/, '');
          if (stem.length > 1 && loc.includes(stem)) score += stem.length;
        }
      });
      if (score > bestScore) { bestScore = score; best = c; }
    });

    if (best && bestScore >= 2) return { kind: 'exact', center: best };
    if (sido) return { kind: 'sido', sido };
    return { kind: 'none' };
  }

  function showSido(sido, label) {
    const inSido = data.filter((c) => c.location.startsWith(sido));
    const seen = new Map();
    inSido.forEach((c) => {
      const cur = seen.get(c.location);
      if (!cur) seen.set(c.location, { ...c, count: 1 }); else cur.count += 1;
    });
    const top = [...seen.values()].sort((a, b) => a.location.localeCompare(b.location, 'ko'));
    summary.textContent = `${sido} 지역 센터`;
    state.textContent = `"${label}" 에는 등록된 센터가 없어 ${sido} 안의 센터를 보여드립니다. ` +
      '가장 가까운 곳을 정확히 찾으시려면 「현재 위치로 찾기」를 눌러주세요.';
    list.innerHTML = '';
    top.slice(0, MAX_RESULTS).forEach((c) => {
      const li = document.createElement('li');
      li.className = 'center-card';
      li.innerHTML = `<div class="center-rank">${sido}</div><h3>${c.location}</h3>` +
        `<p class="center-dist">${c.count > 1 ? `이 지역에 ${c.count}곳` : '방문 개통 가능'}</p>` +
        '<button type="button" class="button wide">예약하기</button>';
      li.querySelector('button').addEventListener('click', () => openReserve(c.location));
      list.append(li);
    });
    list.hidden = !top.length;
    if (!top.length) state.textContent = `${sido} 에 등록된 센터가 없습니다. 카카오톡으로 문의해 주세요.`;
  }

  function render(origin, title, note) {
    const ranked = data
      .map((c) => ({ ...c, km: distanceKm(origin, c) }))
      .sort((a, b) => a.km - b.km);

    // 같은 동에 여러 곳이 있으면 한 줄로 합친다
    const seen = new Map();
    ranked.forEach((c) => {
      const cur = seen.get(c.location);
      if (!cur) seen.set(c.location, { ...c, count: 1 });
      else cur.count += 1;
    });
    const top = [...seen.values()].slice(0, MAX_RESULTS);

    summary.textContent = title;
    state.textContent = note || '';
    list.innerHTML = '';
    if (!top.length) {
      state.textContent = '표시할 센터를 찾지 못했습니다. 카카오톡으로 문의해 주세요.';
      return;
    }
    top.forEach((c, i) => {
      const li = document.createElement('li');
      li.className = 'center-card' + (i === 0 ? ' nearest' : '');
      li.innerHTML =
        `<div class="center-rank">${i === 0 ? '가장 가까움' : `${i + 1}번째`}</div>` +
        `<h3>${c.location}</h3>` +
        `<p class="center-dist">${distanceText(c.km)}` +
        (c.count > 1 ? ` · 이 지역에 ${c.count}곳` : '') + `</p>` +
        `<button type="button" class="button wide" data-loc="${c.location}">예약하기</button>`;
      li.querySelector('button').addEventListener('click', () => openReserve(c.location));
      list.append(li);
    });
    list.hidden = false;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = input.value.trim();
    const a = findAnchor(label);
    if (a.kind === 'exact') {
      render(a.center, `"${label}" 기준으로 가까운 센터`,
        '입력하신 지역을 기준으로 계산한 대략적인 거리입니다.');
      return;
    }
    if (a.kind === 'sido') { showSido(a.sido, label); return; }
    list.hidden = true;
    summary.textContent = '';
    state.textContent = a.kind === 'empty'
      ? '지역을 입력하시거나 「현재 위치로 찾기」를 눌러주세요.'
      : '입력하신 지역을 찾지 못했습니다. 「서울 마포구」처럼 시·구 단위로 적어보시거나, ' +
        '「현재 위치로 찾기」를 눌러주세요.';
  });

  btnGeo.addEventListener('click', () => {
    if (!navigator.geolocation) {
      state.textContent = '이 브라우저에서는 현재 위치를 쓸 수 없습니다. 지역을 직접 입력해 주세요.';
      return;
    }
    state.textContent = '현재 위치를 확인하는 중입니다…';
    btnGeo.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btnGeo.disabled = false;
        render({ lat: pos.coords.latitude, lng: pos.coords.longitude },
          '현재 위치에서 가까운 센터',
          '위치 정보는 이 브라우저 안에서만 쓰이고 저장되거나 전송되지 않습니다.');
      },
      () => {
        btnGeo.disabled = false;
        state.textContent =
          '위치 권한이 허용되지 않았습니다. 지역을 직접 입력해 주세요.';
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });

  // ---- 예약 ----
  function openReserve(location) {
    fCenter.value = location;
    if (!fWhere.value) fWhere.value = location;
    copyNote.textContent = '';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  $('#reserve-close').addEventListener('click', () => dialog.close());

  rForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id) => $(id).value.trim();
    const text =
      '[센터 방문 예약 신청]\n' +
      `희망 센터: ${fCenter.value}\n` +
      `이름: ${v('#r-name')}\n` +
      `연락처: ${v('#r-phone')}\n` +
      `생년월일: ${v('#r-birth')}\n` +
      `요금제: ${v('#r-plan')}\n` +
      `현재 위치: ${v('#r-where')}\n` +
      '\n확인 후 방문 가능한 시간 안내 부탁드립니다.';

    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (_) {
      const ta = $('#r-fallback');
      ta.value = text; ta.hidden = false; ta.select();
      try { copied = document.execCommand('copy'); } catch (__) { copied = false; }
    }
    copyNote.textContent = copied
      ? '신청 내용을 복사했습니다. 카카오톡 채팅창이 열리면 붙여넣기(길게 눌러 붙여넣기) 후 보내주세요.'
      : '아래 내용을 직접 복사해서 카카오톡에 붙여넣어 주세요.';
    window.open(KAKAO_CHAT, '_blank', 'noopener');
  });
})();
