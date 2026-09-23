/* 1분선불폰 모바일·태블릿 메뉴 — 폭 1024px 이하에서 ≡ 버튼으로 오른쪽 메뉴를 연다.
   닫기: × 버튼 · 어두운 배경 · Esc · 메뉴 링크 누름 · 화면이 넓어짐. 열려 있는 동안 Tab 은 메뉴 안에서만 돈다. */
(function () {
  var root = document.documentElement;
  root.classList.add('menu-js');

  function init() {
    var btn = document.querySelector('.menu-toggle');
    var nav = document.getElementById('site-menu');
    if (!btn || !nav) { root.classList.remove('menu-js'); return; }
    var mq = window.matchMedia('(max-width: 1024px)');

    var head = document.createElement('div');
    head.className = 'menu-head';
    head.innerHTML = '<strong>메뉴</strong><button type="button" class="menu-close" aria-label="메뉴 닫기">×</button>';
    nav.insertBefore(head, nav.firstChild);
    var closeBtn = head.querySelector('.menu-close');

    var cta = document.querySelector('header .button.small');
    if (cta) {
      var copy = cta.cloneNode(true);
      copy.className = 'menu-cta';
      if (copy.hasAttribute('data-place')) copy.setAttribute('data-place', 'menu');
      nav.appendChild(copy);
    }

    var backdrop = document.createElement('div');
    backdrop.className = 'menu-backdrop';
    nav.parentNode.appendChild(backdrop);

    function isOpen() { return root.classList.contains('menu-open'); }
    function open() {
      root.classList.add('menu-open');
      btn.setAttribute('aria-expanded', 'true');
      setTimeout(function () { closeBtn.focus(); }, 50);
    }
    function close(backToButton) {
      if (!isOpen()) return;
      root.classList.remove('menu-open');
      btn.setAttribute('aria-expanded', 'false');
      if (backToButton) btn.focus();
    }

    btn.addEventListener('click', function () { if (isOpen()) close(true); else open(); });
    closeBtn.addEventListener('click', function () { close(true); });
    backdrop.addEventListener('click', function () { close(true); });
    nav.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (a && isOpen()) close(false);
    });
    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); close(true); return; }
      if (e.key !== 'Tab') return;
      var items = nav.querySelectorAll('a[href],button');
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !nav.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !nav.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    });
    function onWidth(ev) { if (!ev.matches) close(false); }
    if (mq.addEventListener) mq.addEventListener('change', onWidth); else if (mq.addListener) mq.addListener(onWidth);
    window.addEventListener('pageshow', function () { close(false); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
