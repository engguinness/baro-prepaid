/* 전환 측정.
   개인정보(이름·연락처·생년월일·특이사항·현재 번호)는 절대 이벤트에 담지 않는다.
   담는 값: 어디서 눌렀는지, 망·구분·선불/후불 같은 선택 값, 지역·요금제를 골랐는지 여부(true/false)뿐이다. */
(() => {
  const send = (name, params) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  };

  const placement = (el) => {
    if (el.closest('.mobile-bar')) return 'mobile_bar';
    if (el.closest('.floating')) return 'floating';
    if (el.closest('#visit-dialog')) return 'reserve_form';
    return 'content';
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';

    if (href.includes('pf.kakao.com')) {
      send('kakao_consult_click', {
        placement: placement(a),
        page: location.pathname,
      });
return;
    }
    if (href.includes('n-telecom.co.kr')) {
      send('activation_click', { placement: placement(a), page: location.pathname });
    }
  }, true);

  // 센터 찾기 전용
  const searchForm = document.querySelector('#search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', () => send('center_search', { method: 'text' }));
  }
  const geoBtn = document.querySelector('#use-my-location');
  if (geoBtn) {
    geoBtn.addEventListener('click', () => send('center_search', { method: 'geolocation' }));
  }
  // 방문 예약 신청 접수 성공 — visit-form.js 가 보내는 이벤트 (detail 에 개인정보 없음)
  document.addEventListener('visit:submitted', (e) => {
    const d = (e && e.detail) || {};
    send('reserve_submit', {
      site: d.site, network: d.network, kind: d.kind,
      prepaid: !!d.prepaid, has_region: !!d.hasRegion, plan_chosen: !!d.planChosen,
    });
  });
})();
