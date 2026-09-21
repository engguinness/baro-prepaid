/* 전환 측정.
   개인정보(이름·연락처·생년월일)는 절대 이벤트에 담지 않는다.
   담는 값: 어디서 눌렀는지, 센터 지역(시·구·동), 선택한 요금제 라벨뿐이다. */
(() => {
  const send = (name, params) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  };

  const placement = (el) => {
    if (el.closest('.mobile-bar')) return 'mobile_bar';
    if (el.closest('.floating')) return 'floating';
    if (el.closest('#reserve-form')) return 'reserve_form';
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
  const reserveForm = document.querySelector('#reserve-form');
  if (reserveForm) {
    reserveForm.addEventListener('submit', () => {
      const center = document.querySelector('#r-center');
      const plan = document.querySelector('#r-plan');
      send('reserve_submit', {
        center_area: center ? center.value : '',   // 시·구·동까지만
        plan: plan ? plan.value : '',
        // 이름·연락처·생년월일은 보내지 않는다
      });
      send('kakao_consult_click', { placement: 'reserve_form', page: location.pathname });
    });
  }
})();
