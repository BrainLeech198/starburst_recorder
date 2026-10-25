/**
 * 官网的两件小事：中英切换、滚动渐显。
 * 语言存在 localStorage 的 sb_locale 里，和 App 用的是同一个键，
 * 在 App 里选了英文，打开官网也是英文。
 */
(function () {
  var STORAGE_KEY = 'sb_locale';
  var dict = window.SITE_I18N || {};
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.lang__btn'));

  function readLang() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'zh' || saved === 'en') return saved;
    } catch (error) {
      /* 隐私模式读不了就按默认 */
    }
    return 'zh';
  }

  function saveLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (error) {
      /* 存不了就只在本次生效 */
    }
  }

  function setMeta(name, content) {
    var node = document.querySelector('meta[name="' + name + '"]');
    if (node) node.setAttribute('content', content);
  }

  function apply(lang) {
    var messages = dict[lang] || dict.zh;
    if (!messages) return;

    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      var key = node.getAttribute('data-i18n');
      if (messages[key] !== undefined) node.textContent = messages[key];
    });

    // 图片的 alt 也跟语言走，读屏软件不该在中英文之间跳
    document.querySelectorAll('[data-i18n-alt]').forEach(function (node) {
      var key = node.getAttribute('data-i18n-alt');
      if (messages[key] !== undefined) node.setAttribute('alt', messages[key]);
    });

    // 链接目标也跟语言走：完整更新日志中文版和英文版是两份文件
    document.querySelectorAll('[data-i18n-href]').forEach(function (node) {
      var key = node.getAttribute('data-i18n-href');
      if (messages[key] !== undefined) node.setAttribute('href', messages[key]);
    });

    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = messages['meta.title'];
    setMeta('description', messages['meta.description']);

    var brand = document.querySelector('.topbar__brand');
    if (brand) brand.setAttribute('aria-label', messages['app.name']);

    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
    });
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      var lang = button.dataset.lang;
      apply(lang);
      saveLang(lang);
    });
  });

  apply(readLang());

  // 滚动渐显：没有 IntersectionObserver 或用户要求减少动效时，直接显示
  var targets = document.querySelectorAll(
    '.hero__copy, .hero__paper, .section-head, .card, .compare, .shot, .privacy, .chips, .open__actions, .downloads'
  );
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!('IntersectionObserver' in window) || reduceMotion) {
    targets.forEach(function (node) {
      node.classList.add('is-visible');
    });
    return;
  }

  targets.forEach(function (node, index) {
    node.classList.add('reveal');
    node.style.transitionDelay = (index % 4) * 60 + 'ms';
  });

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
  );

  targets.forEach(function (node) {
    observer.observe(node);
  });
})();
