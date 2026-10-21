/* 센터 방문 예약 신청 폼 — 공용 모듈 (외부 라이브러리 없음, ES2018)

   사용:  VisitForm.open({region: '서울 금천구 가산동'})  /  VisitForm.close()
   설정:  window.VISIT_FORM_CONFIG = {site, brand, api, kakao, phone, phoneHref, hours, privacyUrl(선택: 개인정보처리방침 주소)}
   이벤트: 접수 성공 시 document 에 'visit:submitted' (detail 에 개인정보 없음)

   개인정보: 성함·생년월일·연락번호·특이사항은 접수 API(POST)로만 보낸다.
   console·URL·gtag·localStorage 어디에도 남기지 않는다. 닫으면 화면의 입력값도 지운다. */
(function () {
  'use strict';

  var FONT_FAMILY = '"Noto Sans KR","Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  var DEFAULT_CFG = {
    site: '1min', brand: '1분선불폰', api: '', kakao: '', phone: '', phoneHref: '', hours: '08:00~22:00', privacyUrl: ''
  };
  var PLAN_ASK = '상담 후 결정';
  var PLAN_CUSTOM = '__custom__';
  var PLANS = {
    KT: ['LTE 선불 396 10.3GB', '선불 LTE기본1', 'LTE 선불 770', 'LTE 선불 비디오'],
    LG: ['L망 선불 396 10.3GB', 'L망 5G 선불 20GB+', 'L망 선불 기본1', 'L망 선불 300M 라이트',
         'L망 선불 300분', 'L망 선불 데이터 2.5GB']
  };
  var CARRIERS = ['SKT', 'KT', 'LG U+', '알뜰폰', '기타'];
  var WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
  var NETWORK_TEXT = { 'KT': 'KT', 'LG': 'LG U+', 'KT/LG': 'KT · LG U+ 둘 다 상담' };
  var SUBMIT_TIMEOUT_MS = 40000;

  var state = { busy: false, openedAt: 0, token: 0, receiptUrl: '', region: '' };

  // ───────────────────────── 작은 도구 ─────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function collapse(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function cpLen(s) { return Array.from(String(s)).length; }
  function cpSlice(s, n) { return Array.from(String(s)).slice(0, n).join(''); }
  function digits(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function httpsUrl(u) { return /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : ''; }
  function telUrl(u) { return /^tel:\+?\d{8,15}$/.test(String(u || '')) ? String(u) : ''; }
  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  function getCfg() {
    var c = Object.assign({}, DEFAULT_CFG, window.VISIT_FORM_CONFIG || {});
    c.site = c.site === 'modu' ? 'modu' : '1min';
    c.kakao = httpsUrl(c.kakao);
    c.phoneHref = telUrl(c.phoneHref);
    return c;
  }

  // 입력 서식 ---------------------------------------------------
  function fmtPhone(v) {
    var d = digits(v);
    if (/^8210/.test(d)) d = '0' + d.slice(2); // +82 10-1234-5678 붙여넣기
    d = d.slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 7) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length === 10 && d.slice(0, 3) !== '010') return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }
  function fmtBirth(v) {
    var d = digits(v).slice(0, 8);
    if (d.length === 8 && /^(19|20)/.test(d)) d = d.slice(2); // 19900101 -> 900101
    return d;
  }
  function validBirth(d) {
    if (!/^\d{6}$/.test(d)) return false;
    var m = +d.slice(2, 4), dd = +d.slice(4, 6);
    return m >= 1 && m <= 12 && dd >= 1 && dd <= 31;
  }
  function validPhone(v) { return /^01\d{8,9}$/.test(digits(v)); }
  function validDate(v, min, max) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var p = v.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    if (ymd(d) !== v) return false; // 2026-02-31 같은 날짜 거르기
    return v >= min && v <= max;
  }
  function visitLabel(date, time) {
    var p = date.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return p[0] + '년 ' + (+p[1]) + '월 ' + (+p[2]) + '일 (' + WEEKDAY[d.getDay()] + ') ' + time;
  }
  // 접수증의 생년월일·연락번호는 가리지 않고 그대로 보여 준다(대표 2026-10-15 지시 — 고객이 자기 접수증을 받아 확인하는 용도).
  function showBirth(b) {
    var d = digits(b);
    return d.length === 6 ? d.slice(0, 2) + '.' + d.slice(2, 4) + '.' + d.slice(4) : d;
  }
  function dateBounds() {
    var t = new Date(), mx = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 180);
    return { min: ymd(t), max: ymd(mx) };
  }

  // 입력칸에 서식을 입히되 커서는 숫자 위치를 지킨다
  function bindFormat(input, fmt) {
    input.addEventListener('input', function () {
      var before = input.value, pos = input.selectionStart;
      var out = fmt(before);
      if (out === before) return;
      var nDigits = typeof pos === 'number' ? digits(before.slice(0, pos)).length : -1;
      input.value = out;
      if (nDigits < 0) return;
      var n = 0, i = 0;
      for (; i < out.length && n < nDigits; i++) { if (/\d/.test(out.charAt(i))) n++; }
      try { input.setSelectionRange(i, i); } catch (e) { /* 일부 브라우저는 tel 에서 막힘 */ }
    });
  }

  // ───────────────────────── 요금제 / 시간 선택지 ─────────────────────────
  function opt(v, label, sel) {
    return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label == null ? v : label) + '</option>';
  }
  function planOptionsHtml(network, prepaid, selected) {
    if (!network) return '<option value="">먼저 망을 골라 주세요</option>';
    var h = opt(PLAN_ASK, '잘 모르겠어요 · 상담 후 결정', selected === PLAN_ASK || !selected);
    if (prepaid) {
      if (network === 'KT' || network === 'LG') {
        h += PLANS[network].map(function (p) { return opt(p, p, p === selected); }).join('');
      } else {
        h += '<optgroup label="KT ─">' + PLANS.KT.map(function (p) { return opt(p, p, p === selected); }).join('') + '</optgroup>';
        h += '<optgroup label="LG ─">' + PLANS.LG.map(function (p) { return opt(p, p, p === selected); }).join('') + '</optgroup>';
      }
    }
    h += opt(PLAN_CUSTOM, '직접 입력', selected === PLAN_CUSTOM);
    return h;
  }
  function timeOptionsHtml() {
    var h = '<option value="">시간 선택</option>';
    for (var hh = 9; hh <= 20; hh++) {
      for (var mm = 0; mm < 60; mm += 30) {
        if (hh === 20 && mm > 0) break;
        var t = pad2(hh) + ':' + pad2(mm);
        h += '<option value="' + t + '">' + t + '</option>';
      }
    }
    return h;
  }

  // ───────────────────────── 폼 마크업 ─────────────────────────
  function segHtml(name, items, checked, cls) {
    return '<div class="vf-seg ' + (cls || '') + '" role="radiogroup" aria-labelledby="vf-l-' + name + '" id="vf-g-' + name + '">' +
      items.map(function (it, i) {
        return '<label><input type="radio" name="' + name + '" value="' + esc(it[0]) + '"' +
          (it[0] === checked ? ' checked' : '') + '><span>' + esc(it[1]) + '</span></label>';
      }).join('') + '</div>';
  }
  function errP(field) { return '<p class="vf-err" id="vf-e-' + field + '" role="alert"></p>'; }

  function regionBlock(region, top) {
    return '<div class="vf-field' + (top ? ' vf-region-top' : '') + '" data-field="region">' +
      '<label for="vf-region">' + (top ? '희망 지역' : '희망 지역 <span class="vf-opt">(선택)</span>') + '</label>' +
      '<input id="vf-region" class="vf-control" name="region" type="text" maxlength="40" autocomplete="off" placeholder="예: 서울 마포구" value="' + esc(region) + '">' +
      errP('region') + '</div>';
  }

  function formHtml(cfg, region) {
    var top = !!region;
    return '' +
      '<div class="vf-head">' +
        '<button type="button" class="vf-x" data-vf-close aria-label="닫기">&times;</button>' +
        '<h2 id="vf-title" tabindex="-1">센터 방문 예약 신청</h2>' +
        '<p class="vf-lead">아래 내용을 적어 신청하시면 <strong>예약 접수증</strong>을 바로 받으실 수 있어요. ' +
          '방문 시간은 상담사가 확인한 뒤 확정해 안내드립니다.</p>' +
      '</div>' +
      '<form class="vf-form" id="vf-form" novalidate>' +
        (top ? regionBlock(region, true) : '') +
        // 1. 성함
        '<div class="vf-field" data-field="name"><label for="vf-name">성함</label>' +
          '<input id="vf-name" class="vf-control" name="name" type="text" autocomplete="name" maxlength="20" placeholder="홍길동" required>' + errP('name') + '</div>' +
        // 2. 생년월일
        '<div class="vf-field" data-field="birth"><label for="vf-birth">생년월일 <span class="vf-opt">(6자리)</span></label>' +
          '<input id="vf-birth" class="vf-control" name="birth" type="text" inputmode="numeric" autocomplete="off" placeholder="예: 900101" required>' + errP('birth') + '</div>' +
        // 3. 연락번호
        '<div class="vf-field" data-field="phone"><label for="vf-phone">연락번호</label>' +
          '<input id="vf-phone" class="vf-control" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="010-0000-0000" required>' + errP('phone') + '</div>' +
        // 4. 망
        '<fieldset class="vf-field" data-field="network"><legend id="vf-l-network">망</legend>' +
          segHtml('network', [['KT', 'KT'], ['LG', 'LG U+'], ['KT/LG', '둘 다 상담']], '', 'vf-seg3') + errP('network') + '</fieldset>' +
        // 5. 요금제
        '<div class="vf-field" data-field="plan"><label for="vf-plan">요금제</label>' +
          '<select id="vf-plan" class="vf-control" name="plan" disabled>' + planOptionsHtml('', true, '') + '</select>' +
          '<input id="vf-plan-custom" class="vf-control" name="plan_custom" type="text" maxlength="40" autocomplete="off" placeholder="요금제 이름을 적어 주세요" hidden aria-label="요금제 직접 입력">' +
          '<p class="vf-help" id="vf-plan-help" hidden>후불은 상담 후 요금제를 정해 드립니다.</p>' + errP('plan') + '</div>' +
        // 6. 선불 / 후불
        '<fieldset class="vf-field" data-field="prepaid"><legend id="vf-l-prepaid">선불 / 후불</legend>' +
          segHtml('prepaid', [['true', '선불'], ['false', '후불']], 'true') + errP('prepaid') + '</fieldset>' +
        // 7. 구분
        '<fieldset class="vf-field" data-field="kind"><legend id="vf-l-kind">구분</legend>' +
          segHtml('kind', [['신규', '신규 개통'], ['번호이동', '번호이동']], '신규') + errP('kind') + '</fieldset>' +
        '<div class="vf-move" id="vf-move" hidden>' +
          '<div class="vf-field" data-field="current_phone"><label for="vf-cur-phone">현재 사용 번호</label>' +
            '<input id="vf-cur-phone" class="vf-control" name="current_phone" type="tel" inputmode="numeric" autocomplete="off" placeholder="010-0000-0000">' + errP('current_phone') + '</div>' +
          '<div class="vf-field" data-field="current_carrier"><label for="vf-cur-carrier">현재 통신사</label>' +
            '<select id="vf-cur-carrier" class="vf-control" name="current_carrier"><option value="">선택해 주세요</option>' +
              CARRIERS.map(function (c) { return opt(c, c, false); }).join('') + '</select>' + errP('current_carrier') + '</div>' +
        '</div>' +
        // 8. 방문 일시
        '<fieldset class="vf-field vf-when"><legend>방문 일시</legend><div class="vf-row">' +
          '<div class="vf-sub" data-field="visit_date"><label for="vf-date" class="vf-sublabel">날짜</label>' +
            '<input id="vf-date" class="vf-control" name="visit_date" type="date" placeholder="YYYY-MM-DD" required>' + errP('visit_date') + '</div>' +
          '<div class="vf-sub" data-field="visit_time"><label for="vf-time" class="vf-sublabel">시간</label>' +
            '<select id="vf-time" class="vf-control" name="visit_time" required>' + timeOptionsHtml() + '</select>' + errP('visit_time') + '</div>' +
        '</div></fieldset>' +
        (top ? '' : regionBlock('', false)) +
        // 9. 특이사항
        '<div class="vf-field" data-field="note"><label for="vf-note">특이사항 <span class="vf-opt">(선택)</span></label>' +
          '<textarea id="vf-note" class="vf-control" name="note" rows="3" maxlength="60" placeholder="예: 미납 정지 단말기 사용 중 · eSIM 희망 · 외국인 센터 방문"></textarea>' +
          '<p class="vf-count" id="vf-count">남은 글자 60자</p>' + errP('note') + '</div>' +
        // 10. 개인정보 동의
        '<div class="vf-field vf-consent" data-field="consent">' +
          '<label class="vf-check"><input type="checkbox" id="vf-consent" name="consent"><span>개인정보 수집·이용에 동의합니다 <b>(필수)</b></span></label>' +
          '<details class="vf-details"><summary>수집·이용 안내 보기</summary>' +
            '<p><b>수집 항목</b> 성함, 생년월일, 연락번호, 통신망, 요금제, 선불/후불, 신규/번호이동 구분(번호이동 시 현재 번호·통신사), ' +
            '방문 일시, 희망 지역·특이사항(선택), 접속 IP(자동 기록)<br>' +
            '<b>이용 목적</b> 방문 개통 예약 접수와 상담 연락<br>' +
            '<b>보유 기간</b> 예약 처리(개통 또는 취소) 완료 후 지체 없이 파기<br>' +
            '<b>저장·전달</b> 접수 내용은 운영자의 접수 서버(WordPress.com 호스팅)에 저장되고, 운영자 전용 텔레그램(Telegram) 대화로 ' +
            '전달됩니다. 해외 서비스를 거치게 됩니다.<br>' +
            '<b>센터 전달</b> 예약이 확정되면 방문할 앤텔레콤 개통 센터에 성함·생년월일·연락번호·망·요금제·가입 유형·방문 일시를 전달합니다.<br>' +
            '동의하지 않으면 예약 신청을 할 수 없습니다.' +
            (cfg.privacyUrl ? '<br><a href="' + esc(cfg.privacyUrl) + '" target="_blank" rel="noopener noreferrer">개인정보처리방침 보기</a>' : '') +
            '</p></details>' +
          errP('consent') + '</div>' +
        // 11. 숨은 칸 (봇 함정)
        '<div class="vf-hp" aria-hidden="true"><label>웹사이트 <input type="text" id="vf-hp" name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<p class="vf-alert" id="vf-alert" role="alert"></p>' +
        // 12. 버튼
        '<div class="vf-actions">' +
          '<button type="submit" class="vf-btn vf-btn-primary" id="vf-submit">예약 신청하고 접수증 받기</button>' +
          '<button type="button" class="vf-btn" data-vf-close>닫기</button>' +
        '</div>' +
      '</form>';
  }

  // ───────────────────────── 오류 표시 ─────────────────────────
  function targetOf(root, field) {
    var q = function (s) { return root.querySelector(s); };
    switch (field) {
      case 'name': return q('#vf-name');
      case 'birth': return q('#vf-birth');
      case 'phone': return q('#vf-phone');
      case 'network': return q('#vf-g-network');
      case 'plan': { var c = q('#vf-plan-custom'); return c && !c.hidden ? c : q('#vf-plan'); }
      case 'prepaid': return q('#vf-g-prepaid');
      case 'kind': return q('#vf-g-kind');
      case 'current_phone': return q('#vf-cur-phone');
      case 'current_carrier': return q('#vf-cur-carrier');
      case 'visit_date': return q('#vf-date');
      case 'visit_time': return q('#vf-time');
      case 'note': return q('#vf-note');
      case 'region': return q('#vf-region');
      case 'consent': return q('#vf-consent');
      default: return null;
    }
  }
  function focusEl(root, field) {
    var t = targetOf(root, field);
    if (!t) return;
    if (t.getAttribute('role') === 'radiogroup') t = t.querySelector('input:checked') || t.querySelector('input');
    if (!t) return;
    try { t.focus(); } catch (e) { /* 무시 */ }
    try { t.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { /* 무시 */ }
  }
  function setError(root, field, msg) {
    var p = root.querySelector('#vf-e-' + field);
    if (p) p.textContent = msg || '';
    var ids = field === 'plan' ? ['#vf-plan', '#vf-plan-custom'] : [null];
    var targets = field === 'plan' ? ids.map(function (s) { return root.querySelector(s); }) : [targetOf(root, field)];
    targets.forEach(function (t) {
      if (!t) return;
      if (msg) { t.setAttribute('aria-invalid', 'true'); t.setAttribute('aria-describedby', 'vf-e-' + field); }
      else { t.removeAttribute('aria-invalid'); t.removeAttribute('aria-describedby'); }
    });
  }
  function clearAll(root) {
    root.querySelectorAll('.vf-err').forEach(function (p) {
      var f = p.id.replace(/^vf-e-/, '');
      setError(root, f, '');
    });
    var a = root.querySelector('#vf-alert');
    if (a) { a.textContent = ''; }
  }
  function showAlert(root, text, withKakao, cfg) {
    var a = root.querySelector('#vf-alert');
    if (!a) return;
    var html = esc(text);
    if (withKakao && cfg.kakao) {
      html += ' <a href="' + esc(cfg.kakao) + '" target="_blank" rel="noopener noreferrer">카카오톡 상담 열기</a>';
    }
    a.innerHTML = html;
    try { a.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { /* 무시 */ }
  }

  // ───────────────────────── 검증 (서버와 같은 규칙) ─────────────────────────
  function validate(root, cfg) {
    var $ = function (s) { return root.querySelector(s); };
    var checked = function (n) { var r = root.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : ''; };
    var errors = [];
    var bad = function (field, message) { errors.push({ field: field, message: message }); };
    var bounds = dateBounds();

    var region = cpSlice(collapse($('#vf-region') ? $('#vf-region').value : ''), 41);
    var regionTop = !!$('.vf-region-top');
    var regionCheck = function () { if (cpLen(region) > 40) bad('region', '희망 지역은 40자 이내로 적어 주세요'); };
    if (regionTop) regionCheck();

    var name = collapse($('#vf-name').value);
    if (!name) bad('name', '성함을 적어 주세요');
    else if (!/[A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ]/.test(name)) bad('name', '성함을 한글 또는 영문으로 적어 주세요');
    else if (cpLen(name) > 20) bad('name', '성함은 20자 이내로 적어 주세요');

    var birth = fmtBirth($('#vf-birth').value);
    if (!validBirth(birth)) bad('birth', '생년월일은 6자리(예: 800620)로 적어 주세요');

    var phone = $('#vf-phone').value;
    if (!validPhone(phone)) bad('phone', '연락번호를 010-1234-5678 형식으로 적어 주세요');

    var network = checked('network');
    if (!network) bad('network', '망을 골라 주세요');

    var prepaid = checked('prepaid') !== 'false';
    var plan = '';
    if (network) {
      plan = $('#vf-plan').value;
      if (plan === PLAN_CUSTOM) {
        plan = collapse($('#vf-plan-custom').value);
        if (!plan) bad('plan', '요금제 이름을 적어 주세요');
        else if (cpLen(plan) > 40) bad('plan', '요금제는 40자 이내로 적어 주세요');
      } else if (!plan) {
        bad('plan', '요금제를 골라 주세요');
      }
    }

    var kind = checked('kind');
    if (kind !== '신규' && kind !== '번호이동') bad('kind', '신규 개통인지 번호이동인지 골라 주세요');
    var curPhone = '', curCarrier = '';
    if (kind === '번호이동') {
      curPhone = $('#vf-cur-phone').value;
      curCarrier = $('#vf-cur-carrier').value;
      if (!validPhone(curPhone)) bad('current_phone', '지금 쓰시는 번호를 010-1234-5678 형식으로 적어 주세요');
      if (CARRIERS.indexOf(curCarrier) < 0) bad('current_carrier', '지금 쓰시는 통신사를 골라 주세요');
    }

    var date = $('#vf-date').value;
    if (!date) bad('visit_date', '방문 날짜를 골라 주세요');
    else if (!validDate(date, bounds.min, bounds.max)) bad('visit_date', '방문 날짜는 오늘부터 180일 안에서 골라 주세요');
    var time = $('#vf-time').value;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) bad('visit_time', '방문 시간을 골라 주세요');

    if (!regionTop) regionCheck();

    var note = collapse($('#vf-note').value);
    if (cpLen(note) > 60) bad('note', '특이사항은 60자 이내로 적어 주세요');

    if (!$('#vf-consent').checked) bad('consent', '개인정보 수집·이용에 동의해 주세요');

    return {
      errors: errors,
      payload: {
        site: cfg.site,
        name: name,
        birth: birth,
        phone: fmtPhone(phone),
        network: network,
        plan: plan,
        prepaid: prepaid,
        kind: kind,
        current_phone: kind === '번호이동' ? fmtPhone(curPhone) : '',
        current_carrier: kind === '번호이동' ? curCarrier : '',
        visit_date: date,
        visit_time: time,
        note: note,
        region: region,
        consent: true,
        hp: ($('#vf-hp') ? $('#vf-hp').value : ''),
        elapsed: 0
      }
    };
  }

  // ───────────────────────── 폼 동작 연결 ─────────────────────────
  function refreshPlan(root) {
    var network = (root.querySelector('input[name="network"]:checked') || {}).value || '';
    var prepaid = ((root.querySelector('input[name="prepaid"]:checked') || {}).value) !== 'false';
    var sel = root.querySelector('#vf-plan');
    var prev = sel.value;
    sel.innerHTML = planOptionsHtml(network, prepaid, prev);
    sel.disabled = !network;
    var ok = Array.prototype.some.call(sel.options, function (o) { return o.value === prev; });
    sel.value = network ? (ok ? prev : PLAN_ASK) : '';
    var custom = root.querySelector('#vf-plan-custom');
    custom.hidden = sel.value !== PLAN_CUSTOM;
    root.querySelector('#vf-plan-help').hidden = prepaid || !network;
  }
  function refreshTimes(root) {
    var date = root.querySelector('#vf-date').value, now = new Date();
    var nowStr = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    var sel = root.querySelector('#vf-time'), today = ymd(now);
    Array.prototype.forEach.call(sel.options, function (o) {
      o.disabled = !!o.value && date === today && o.value <= nowStr;
    });
    if (sel.selectedOptions && sel.selectedOptions[0] && sel.selectedOptions[0].disabled) sel.value = '';
  }
  function refreshCount(root) {
    var left = 60 - cpLen(root.querySelector('#vf-note').value);
    var c = root.querySelector('#vf-count');
    c.textContent = left >= 0 ? '남은 글자 ' + left + '자' : '글자 수를 ' + (-left) + '자 줄여 주세요';
    c.classList.toggle('vf-count-low', left <= 10);
  }
  function setBusy(root, on) {
    state.busy = on;
    var b = root.querySelector('#vf-submit'), f = root.querySelector('#vf-form');
    if (b) { b.disabled = on; b.textContent = on ? '접수 중…' : '예약 신청하고 접수증 받기'; }
    if (f) f.setAttribute('aria-busy', on ? 'true' : 'false');
    root.querySelectorAll('[data-vf-close]').forEach(function (x) { x.disabled = on; });
  }

  function wireForm(root, cfg) {
    var form = root.querySelector('#vf-form');
    var bounds = dateBounds();
    var date = root.querySelector('#vf-date');
    date.min = bounds.min; date.max = bounds.max;

    bindFormat(root.querySelector('#vf-phone'), fmtPhone);
    bindFormat(root.querySelector('#vf-cur-phone'), fmtPhone);
    bindFormat(root.querySelector('#vf-birth'), fmtBirth);

    form.addEventListener('input', function (e) {
      var f = e.target.closest ? e.target.closest('[data-field]') : null;
      if (f) setError(root, f.getAttribute('data-field'), '');
    });
    form.addEventListener('change', function (e) {
      var t = e.target, f = t.closest ? t.closest('[data-field]') : null;
      if (f) setError(root, f.getAttribute('data-field'), '');
      if (t.name === 'network' || t.name === 'prepaid') refreshPlan(root);
      if (t.id === 'vf-plan') {
        var custom = root.querySelector('#vf-plan-custom');
        custom.hidden = t.value !== PLAN_CUSTOM;
        if (!custom.hidden) custom.focus();
      }
      if (t.name === 'kind') {
        var move = root.querySelector('#vf-move');
        move.hidden = t.value !== '번호이동';
        if (!move.hidden) root.querySelector('#vf-cur-phone').focus();
      }
      if (t.id === 'vf-date') refreshTimes(root);
    });
    root.querySelector('#vf-note').addEventListener('input', function () { refreshCount(root); });
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(root, cfg); });
    root.querySelectorAll('[data-vf-close]').forEach(function (b) { b.addEventListener('click', close); });
    refreshTimes(root);
  }

  // ───────────────────────── 전송 ─────────────────────────
  var FIELD_NAMES = ['name', 'birth', 'phone', 'network', 'plan', 'prepaid', 'kind', 'current_phone',
    'current_carrier', 'visit_date', 'visit_time', 'note', 'region', 'consent'];

  async function submit(root, cfg) {
    if (state.busy) return;
    clearAll(root);
    var res = validate(root, cfg);
    if (res.errors.length) {
      res.errors.forEach(function (e) { setError(root, e.field, e.message); });
      focusEl(root, res.errors[0].field);
      return;
    }
    var payload = res.payload;
    payload.elapsed = Math.max(0, Date.now() - state.openedAt);
    var token = state.token;
    setBusy(root, true);

    var status = 0, data = null, failure = '';
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, SUBMIT_TIMEOUT_MS) : 0;
    try {
      if (!cfg.api) throw new Error('no api');
      var resp = await fetch(cfg.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors', credentials: 'omit', cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      });
      status = resp.status;
      try { data = await resp.json(); } catch (e) { data = null; }
    } catch (e) {
      failure = e && e.name === 'AbortError' ? 'timeout' : 'network';
    }
    if (timer) clearTimeout(timer);

    if (token !== state.token) return; // 그 사이 창이 닫혔다 다시 열림
    setBusy(root, false);
    var ours = data && typeof data === 'object' && data.ok === false && typeof data.message === 'string';

    if (!failure && status >= 200 && status < 300 && data && data.ok === true) {
      onSuccess(root, cfg, payload, data);
      return;
    }
    if (failure === 'timeout') {
      showAlert(root, '접수 응답이 늦어지고 있습니다. 이미 접수되었을 수 있으니 바로 다시 보내지 마시고, ' +
        '잠시 뒤 카카오톡으로 접수 여부를 확인해 주세요.', true, cfg);
      return;
    }
    if (failure) {
      showAlert(root, '네트워크 연결을 확인하고 다시 시도해 주세요. 계속 안 되면 카카오톡으로 문의해 주세요.', true, cfg);
      return;
    }
    if (status === 400 && ours) {
      if (data.field && FIELD_NAMES.indexOf(data.field) >= 0) {
        setError(root, data.field, data.message);
        focusEl(root, data.field);
      } else {
        showAlert(root, data.message, false, cfg);
      }
      return;
    }
    if (status === 429) {
      showAlert(root, (ours ? data.message : '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.') +
        ' 급하시면 카카오톡으로 문의해 주세요.', true, cfg);
      return;
    }
    if (status === 503) {
      var m503 = ours ? data.message : '지금은 접수할 수 없습니다. 카카오톡으로 문의해 주세요.';
      showAlert(root, m503, true, cfg);
      return;
    }
    if (status === 403) {
      showAlert(root, '이 화면에서는 접수할 수 없습니다. 카카오톡으로 문의해 주세요.', true, cfg);
      return;
    }
    showAlert(root, '접수 중 문제가 생겼습니다. 잠시 후 다시 시도하시거나 카카오톡으로 문의해 주세요.', true, cfg);
  }

  // ───────────────────────── 성공 화면 + 접수증 ─────────────────────────
  function onSuccess(root, cfg, payload, data) {
    var receiptNo = /^[A-Za-z0-9-]{4,32}$/.test(String(data.receipt_no || '')) ? String(data.receipt_no) : 'V-접수완료';
    var now = new Date();
    var receivedAt = typeof data.received_at === 'string' && data.received_at
      ? cpSlice(data.received_at, 24)
      : ymd(now) + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    var label = typeof data.visit_label === 'string' && data.visit_label
      ? cpSlice(data.visit_label, 40) : visitLabel(payload.visit_date, payload.visit_time);

    var info = {
      receiptNo: receiptNo, receivedAt: receivedAt, visitLabel: label,
      name: payload.name, birth: payload.birth, phone: payload.phone,
      network: payload.network, plan: payload.plan, prepaid: payload.prepaid,
      kind: payload.kind, currentCarrier: payload.current_carrier,
      region: payload.region, note: payload.note
    };

    try {
      document.dispatchEvent(new CustomEvent('visit:submitted', { detail: {
        site: cfg.site, network: payload.network, kind: payload.kind, prepaid: payload.prepaid,
        hasRegion: !!payload.region, planChosen: payload.plan !== PLAN_ASK
      } }));
    } catch (e) { /* 이벤트를 못 보내도 접수 화면은 계속 */ }

    var token = state.token;
    var kakao = cfg.kakao ? '<a class="vf-btn vf-btn-kakao" href="' + esc(cfg.kakao) + '" target="_blank" rel="noopener noreferrer">카카오톡 상담 이어가기</a>' : '';
    var tel = cfg.phoneHref ? '<a class="vf-btn" href="' + esc(cfg.phoneHref) + '">전화 상담</a>' : '';
    root.innerHTML = '' +
      '<div class="vf-head vf-done">' +
        '<p class="vf-badge">접수 완료</p>' +
        '<h2 id="vf-title" tabindex="-1">예약 신청이 접수되었습니다</h2>' +
        '<p class="vf-rno"><span class="vf-rno-label">접수번호</span> <strong>' + esc(receiptNo) + '</strong></p>' +
        '<p class="vf-lead">예약 확정은 상담 후 안내드립니다 (상담 ' + esc(cfg.hours) + '). 아래 접수증을 저장해 두세요.</p>' +
      '</div>' +
      '<div class="vf-body">' +
        '<figure class="vf-receipt" id="vf-receipt"><div class="vf-wait" role="status">접수증을 만들고 있어요…</div></figure>' +
        '<p class="vf-help" id="vf-save-hint" hidden>저장 버튼이 동작하지 않으면 접수증 이미지를 길게 눌러 저장하세요.</p>' +
        '<div class="vf-actions vf-actions-col" id="vf-done-actions">' + kakao + tel +
          '<button type="button" class="vf-btn" data-vf-close>닫기</button></div>' +
      '</div>';
    root.querySelectorAll('[data-vf-close]').forEach(function (b) { b.addEventListener('click', close); });
    var h = root.querySelector('#vf-title');
    if (h) { try { h.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
    root.scrollTop = 0;

    renderReceipt(info, cfg, root).then(function (blob) {
      if (token !== state.token || !root.isConnected) return;
      var fig = root.querySelector('#vf-receipt');
      var actions = root.querySelector('#vf-done-actions');
      if (!blob) {
        fig.innerHTML = '<div class="vf-wait">접수증 이미지를 만들지 못했습니다. 접수번호 <b>' + esc(receiptNo) +
          '</b> 를 메모해 두시고, 카카오톡 상담에서 알려 주세요.</div>';
        return;
      }
      var url = URL.createObjectURL(blob);
      state.receiptUrl = url;
      var fname = ('예약접수증-' + receiptNo + '.png').replace(/[^A-Za-z0-9가-힣._-]/g, '');
      fig.innerHTML = '<img src="' + url + '" alt="' + esc('예약 접수증 · 접수번호 ' + receiptNo + ' · 방문 예정 ' + label) + '">';
      var save = '<a class="vf-btn vf-btn-primary" id="vf-save" href="' + url + '" download="' + esc(fname) + '">접수증 이미지 저장</a>';
      actions.insertAdjacentHTML('afterbegin', save);
      root.querySelector('#vf-save-hint').hidden = false;
      try {
        var file = new File([blob], fname, { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          var sb = document.createElement('button');
          sb.type = 'button'; sb.className = 'vf-btn'; sb.textContent = '접수증 보내기';
          sb.addEventListener('click', function () {
            navigator.share({ files: [file], title: cfg.brand + ' 방문 예약 접수증', text: '접수번호 ' + receiptNo })
              .catch(function () { /* 사용자가 취소 */ });
          });
          var first = actions.querySelector('#vf-save');
          first.insertAdjacentElement('afterend', sb);
        }
      } catch (e) { /* 공유를 못 쓰는 환경 */ }
    });
  }

  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var sample = '가나다 예약접수증 0123456789';
    var jobs = [document.fonts.ready].concat(['500', '700', '800'].map(function (w) {
      return document.fonts.load(w + ' 24px "Noto Sans KR"', sample).catch(function () { return null; });
    }));
    return Promise.race([
      Promise.all(jobs).catch(function () { return null; }),
      new Promise(function (r) { setTimeout(r, 2500); })
    ]);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function wrapLines(ctx, text, maxW) {
    var chars = Array.from(String(text)), lines = [], line = '', lastSp = -1;
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i], test = line + ch;
      if (line && ctx.measureText(test).width > maxW) {
        if (ch !== ' ' && lastSp > 0) {
          lines.push(line.slice(0, lastSp));
          line = line.slice(lastSp + 1) + ch;
        } else {
          lines.push(line);
          line = ch === ' ' ? '' : ch;
        }
        lastSp = line.lastIndexOf(' ');
      } else {
        line = test;
        if (ch === ' ') lastSp = line.length - 1;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  // 접수증 캔버스 → PNG Blob (실패하면 null)
  function renderReceipt(info, cfg, root) {
    return loadFonts().then(function () {
      var S = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
      var W = 1080, MIN_H = 1560, PAD = 24, CARD_W = W - PAD * 2, IN = 56;
      var LX = PAD + IN, TEXT_W = CARD_W - IN * 2, LABEL_W = 236, VAL_X = LX + LABEL_W, VAL_W = TEXT_W - LABEL_W;
      var HEADER_H = 196, LH = 40, RPAD = 13;
      var INK = '#17223b', MUTED = '#627089', LINE = '#e6ebf4';
      var primary = '';
      try { primary = collapse(getComputedStyle(root).getPropertyValue('--_p')); } catch (e) { primary = ''; }
      if (!/^#[0-9a-fA-F]{3,8}$|^rgb|^hsl/.test(primary)) primary = cfg.site === 'modu' ? '#1457d9' : '#2b55ed';
      var F = function (w, s) { return w + ' ' + s + 'px ' + FONT_FAMILY; };

      var kindText = info.kind === '번호이동'
        ? '번호이동' + (info.currentCarrier ? ' (현재 ' + info.currentCarrier + ')' : '') : '신규 개통';
      var rows = [
        { label: '성함', value: info.name },
        { label: '생년월일', value: showBirth(info.birth) },
        { label: '연락번호', value: fmtPhone(info.phone) },
        { label: '방문 예정 일시', value: info.visitLabel, color: primary, weight: 800 },
        { label: '망', value: NETWORK_TEXT[info.network] || info.network },
        { label: '요금제', value: info.plan },
        { label: '선불 / 후불', value: info.prepaid ? '선불' : '후불' },
        { label: '구분', value: kindText }
      ];
      if (info.region) rows.push({ label: '희망 지역', value: info.region });
      if (info.note) rows.push({ label: '특이사항', value: info.note });

      var m = document.createElement('canvas').getContext('2d');
      m.font = F(700, 31);
      rows.forEach(function (r) {
        r.lines = wrapLines(m, r.value, VAL_W);
        r.h = r.lines.length * LH + RPAD * 2;
      });
      var tableH = rows.reduce(function (a, r) { return a + r.h; }, 0);

      var BOX_Y = PAD + HEADER_H + 30, BOX_H = 200;
      var TABLE_Y = BOX_Y + BOX_H + 22;
      var INFO_Y = TABLE_Y + tableH + 28;
      var INFO_PAD = 34, BUL_X = 30, BUL_W = TEXT_W - INFO_PAD * 2 - BUL_X - 6, BUL_LH = 40, BUL_GAP = 14;
      var bullets = [
        { t: '예약 확정은 상담 후 안내드립니다 (상담 ' + cfg.hours + ')', w: 700 },
        { t: '방문 시 신분증(실물)을 꼭 챙겨 주세요. 외국인은 접수할 수 있는 신분 서류를 예약 때 확인해 주세요.', w: 500 },
        { t: '센터 위치는 예약 확정 때 안내드립니다.', w: 500 }
      ];
      bullets.forEach(function (b) { m.font = F(b.w, 28); b.lines = wrapLines(m, b.t, BUL_W); });
      var infoH = INFO_PAD * 2 + bullets.reduce(function (a, b) { return a + b.lines.length * BUL_LH; }, 0) + BUL_GAP * (bullets.length - 1);

      var contact = '카카오톡 채널' + (cfg.phone ? ' · 전화 ' + cfg.phone : '') + ' · 상담 ' + cfg.hours;
      m.font = F(500, 27);
      var contactLines = wrapLines(m, contact, TEXT_W);
      var FOOT_H = 30 + 40 + contactLines.length * 38 + 12 + 32 + 60;
      var contentEnd = INFO_Y + infoH + 34 + FOOT_H + PAD;
      var H = Math.max(MIN_H, contentEnd);
      var FOOT_Y = H - PAD - FOOT_H;

      var canvas = document.createElement('canvas');
      canvas.width = Math.round(W * S); canvas.height = Math.round(H * S);
      var ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.scale(S, S);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

      // 카드
      roundRectPath(ctx, PAD, PAD, CARD_W, H - PAD * 2, 40);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.save();
      roundRectPath(ctx, PAD, PAD, CARD_W, H - PAD * 2, 40);
      ctx.clip();
      ctx.fillStyle = primary; ctx.fillRect(PAD, PAD, CARD_W, HEADER_H);
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.beginPath(); ctx.arc(W - 110, PAD + 40, 150, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(W - 330, PAD + HEADER_H + 20, 90, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      roundRectPath(ctx, PAD, PAD, CARD_W, H - PAD * 2, 40);
      ctx.lineWidth = 2; ctx.strokeStyle = '#dfe5ef'; ctx.stroke();

      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      // 헤더
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = F(700, 34);
      ctx.fillText(cfg.brand, LX, PAD + 66);
      ctx.fillStyle = '#ffffff'; ctx.font = F(800, 62);
      ctx.fillText('방문 개통 예약 접수증', LX, PAD + 132);

      // 접수번호 상자
      roundRectPath(ctx, LX, BOX_Y, TEXT_W, BOX_H, 28);
      ctx.fillStyle = '#f3f6fd'; ctx.fill();
      ctx.fillStyle = MUTED; ctx.font = F(500, 28);
      ctx.fillText('접수번호', LX + 36, BOX_Y + 40);
      ctx.fillStyle = primary; ctx.font = F(800, 72);
      ctx.fillText(info.receiptNo, LX + 36, BOX_Y + 98);
      ctx.fillStyle = MUTED; ctx.font = F(500, 28);
      ctx.fillText('접수 일시  ' + info.receivedAt, LX + 36, BOX_Y + 164);

      // 표
      var y = TABLE_Y;
      ctx.strokeStyle = LINE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(LX, y); ctx.lineTo(LX + TEXT_W, y); ctx.stroke();
      rows.forEach(function (r) {
        var cy = y + RPAD + LH / 2;
        ctx.fillStyle = MUTED; ctx.font = F(500, 28);
        ctx.fillText(r.label, LX, cy);
        ctx.fillStyle = r.color || INK; ctx.font = F(r.weight || 700, 31);
        r.lines.forEach(function (ln, i) { ctx.fillText(ln, VAL_X, cy + i * LH); });
        y += r.h;
        ctx.beginPath(); ctx.moveTo(LX, y); ctx.lineTo(LX + TEXT_W, y); ctx.stroke();
      });

      // 안내 상자
      roundRectPath(ctx, LX, INFO_Y, TEXT_W, infoH, 26);
      ctx.fillStyle = '#eef3ff'; ctx.fill();
      var by = INFO_Y + INFO_PAD;
      bullets.forEach(function (b) {
        ctx.fillStyle = primary; ctx.font = F(800, 28);
        ctx.fillText('•', LX + INFO_PAD, by + BUL_LH / 2);
        ctx.fillStyle = INK; ctx.font = F(b.w, 28);
        b.lines.forEach(function (ln, i) { ctx.fillText(ln, LX + INFO_PAD + BUL_X, by + BUL_LH / 2 + i * BUL_LH); });
        by += b.lines.length * BUL_LH + BUL_GAP;
      });

      // 하단
      ctx.strokeStyle = LINE;
      ctx.beginPath(); ctx.moveTo(LX, FOOT_Y); ctx.lineTo(LX + TEXT_W, FOOT_Y); ctx.stroke();
      var fy = FOOT_Y + 30 + 20;
      ctx.fillStyle = INK; ctx.font = F(800, 28);
      ctx.fillText('상담 창구', LX, fy);
      fy += 20 + 19;
      ctx.fillStyle = MUTED; ctx.font = F(500, 27);
      contactLines.forEach(function (ln, i) { ctx.fillText(ln, LX, fy + i * 38); });
      fy += contactLines.length * 38 + 12 + 16;
      ctx.fillStyle = '#8a96ab'; ctx.font = F(500, 22);
      ctx.fillText('※ 신청하신 정보가 그대로 적혀 있으니 보관에 주의해 주세요.', LX, fy);

      return new Promise(function (resolve) {
        try { canvas.toBlob(function (b) { resolve(b || null); }, 'image/png'); } catch (e) { resolve(null); }
      });
    }).catch(function () { return null; });
  }

  // ───────────────────────── 창 열기 / 닫기 ─────────────────────────
  function ensureDialog() {
    var d = document.getElementById('visit-dialog');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'visit-dialog';
      document.body.appendChild(d);
    }
    if (!d.classList.contains('vf-dialog')) d.classList.add('vf-dialog');
    if (!d.__vfBound) {
      d.__vfBound = true;
      d.addEventListener('cancel', function (e) { if (state.busy) e.preventDefault(); });
      d.addEventListener('close', onClosed);
      if (typeof d.showModal !== 'function') {
        d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !state.busy) close(); });
      }
    }
    return d;
  }
  function revokeReceipt() {
    if (state.receiptUrl) { try { URL.revokeObjectURL(state.receiptUrl); } catch (e) { /* 무시 */ } }
    state.receiptUrl = '';
  }
  function onClosed() {
    var d = document.getElementById('visit-dialog');
    // 접수 중에 닫힘(Esc 두 번째·안드로이드 뒤로가기는 cancel 로 못 막는다)이면 바로 다시 연다.
    // token·입력값은 건드리지 않아 응답이 오면 성공 화면이 그대로 뜬다.
    if (state.busy) {
      if (d && !d.open) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
      return;
    }
    document.documentElement.classList.remove('vf-lock');
    if (!d || d.open) return; // 닫자마자 다시 열린 경우
    state.token++;
    state.busy = false;
    revokeReceipt();
    d.innerHTML = ''; // 입력값(개인정보)을 화면에서도 지운다
    try {
      if (location.hash === '#reserve') history.replaceState(null, '', location.pathname + location.search);
    } catch (e) { /* 무시 */ }
  }

  function open(opts) {
    opts = opts || {};
    var cfg = getCfg();
    var dlg = ensureDialog();
    state.token++;
    state.busy = false;
    state.openedAt = Date.now();
    state.region = cpSlice(collapse(opts.region || ''), 40);
    revokeReceipt();
    dlg.setAttribute('data-site', cfg.site);
    dlg.setAttribute('aria-labelledby', 'vf-title');
    dlg.removeAttribute('aria-label');
    dlg.innerHTML = formHtml(cfg, state.region);
    wireForm(dlg, cfg);
    if (!dlg.open) {
      if (typeof dlg.showModal === 'function') { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } }
      else dlg.setAttribute('open', '');
    }
    document.documentElement.classList.add('vf-lock');
    dlg.scrollTop = 0;
    var h = dlg.querySelector('#vf-title');
    if (h) { try { h.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
  }
  function close() {
    var d = document.getElementById('visit-dialog');
    if (!d || state.busy) return;
    if (typeof d.close === 'function') { if (d.open) d.close(); }
    else { d.removeAttribute('open'); onClosed(); }
  }

  window.VisitForm = { open: open, close: close };

  // #reserve 로 들어오면 바로 연다 (지역 없이)
  function checkHash() { if (location.hash === '#reserve') open({}); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', checkHash);
  else checkHash();
  window.addEventListener('hashchange', checkHash);
})();
