/* Shared shell for every page: header, footer, the "My project" drawer and
   small helpers. Pages mark their nav entry with <body data-page="...">. */
(function () {
  'use strict';

  // Single place for business details. Replace the WhatsApp number before launch.
  var CONFIG = {
    brand: 'Amco Paints',
    legalName: 'Amco Paint Industries (Pvt) Ltd',
    whatsapp: '923000000000',
    phone: '042-37163641',
    email: 'amcopaints@gmail.com',
    office: 'Al-Masoom Plaza, Sagian Road, Ravi Town, Lahore',
    works: '18 km Sheikhupura Road, Kot Abdul Malik'
  };

  var NAV = [
    { id: 'colours', href: 'colours.html', label: 'Colours' },
    { id: 'visualiser', href: 'visualiser.html', label: 'Visualiser' },
    { id: 'my-property', href: 'my-property.html', label: 'Upload your plans' },
    { id: 'products', href: 'products.html', label: 'Products' },
    { id: 'tools', href: 'tools.html', label: 'Tools & advice' },
    { id: 'dealers', href: 'dealers.html', label: 'Dealers' },
    { id: 'painters', href: 'painters.html', label: 'Painters' }
  ];

  // Inline line icons, 24px grid, drawn with a 1.5px stroke by the .icon class.
  var ICONS = {
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    brush: '<path d="M9.5 14.5l9-9a1.8 1.8 0 0 0-2.5-2.5l-9 9"/><path d="M7 12c-2.2 0-3.5 1.6-3.5 3.8 0 1.6-.6 2.6-1.5 3.2 3.4.9 7.5-.4 7.5-4.5z"/>',
    whatsapp: '<path d="M3.6 20.4l1.2-4.3a8.6 8.6 0 1 1 3.2 3.1z"/><path d="M9.1 8.4c.3-.6.8-.8 1.1-.5l.9 1.5c.2.3.1.7-.2.9l-.5.4c.5 1.1 1.4 2 2.5 2.5l.4-.5c.2-.3.6-.4.9-.2l1.5.9c.3.3.1.8-.5 1.1-1 .5-2.4.2-3.9-1-1.6-1.4-2.5-3.2-2.2-5.1z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
  };

  function icon(name) {
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
  }

  // The refined wordmark: a brand-red chip with a tin-label band, then AMCO.
  var LOGO_MARK = '<svg class="logo-mark" viewBox="0 0 26 26" aria-hidden="true" focusable="false">' +
    '<rect width="26" height="26" rx="2" fill="currentColor"/><rect x="0" y="17" width="26" height="3" fill="#fff" fill-opacity="0.9"/></svg>';

  var STORAGE_KEY = 'amco.project.v1';
  var SCROLL_CONDENSE_AT = 48;
  var listeners = [];

  function readProject() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.shades)) { return parsed; }
    } catch (error) {
      // Storage can be blocked (private mode, file:// policies); fall through.
    }
    return { shades: [], walls: [], estimate: null };
  }

  var project = readProject();

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch (error) {
      // The project still works for this page view without storage.
    }
    listeners.forEach(function (listener) { listener(project); });
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function formatPkr(amount) {
    return 'Rs ' + Math.round(amount).toLocaleString('en-PK');
  }

  function whatsappLink(message) {
    return 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(message);
  }

  function projectMessage() {
    var lines = ['Assalam o alaikum, I planned this on the Amco Paints website:'];
    if (project.shades.length) {
      lines.push('', 'Shades I like:');
      project.shades.forEach(function (code) {
        var shade = window.AmcoShades && window.AmcoShades.get(code);
        if (shade) { lines.push('- ' + shade.name + ' (' + shade.code + ')'); }
      });
    }
    if (project.walls && project.walls.length) {
      lines.push('', 'From the 3D visualiser:');
      project.walls.forEach(function (wall) {
        lines.push('- ' + wall.label + ': ' + wall.shadeName + ' (' + wall.code + ')');
      });
    }
    if (project.estimate) {
      lines.push('', 'Estimate: ' + project.estimate.summary);
    }
    lines.push('', 'Please share price and the nearest dealer.');
    return lines.join('\n');
  }

  var Project = {
    get: function () { return project; },
    hasShade: function (code) { return project.shades.indexOf(code) !== -1; },
    toggleShade: function (code) {
      var index = project.shades.indexOf(code);
      var shade = window.AmcoShades && window.AmcoShades.get(code);
      if (index === -1) {
        project.shades.push(code);
        toast((shade ? shade.name : 'Shade') + ' saved to your project');
      } else {
        project.shades.splice(index, 1);
        toast((shade ? shade.name : 'Shade') + ' removed from your project');
      }
      persist();
      return index === -1;
    },
    setWalls: function (walls) { project.walls = walls; persist(); },
    setEstimate: function (estimate) { project.estimate = estimate; persist(); },
    clear: function () { project = { shades: [], walls: [], estimate: null }; persist(); },
    onChange: function (listener) { listeners.push(listener); },
    message: projectMessage
  };

  /* ---------- Toast ---------- */

  var toastEl;
  var toastTimer;

  function toast(message) {
    if (!toastEl) { return; }
    toastEl.textContent = message;
    toastEl.setAttribute('data-open', 'true');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.setAttribute('data-open', 'false'); }, 2400);
  }

  /* ---------- Shell ---------- */

  function logoHtml(withSub) {
    return '<a class="logo" href="index.html" aria-label="Amco Paints home">' + LOGO_MARK +
      '<span class="logo-text"><span class="logo-word">AMCO</span>' +
      (withSub ? '<span class="logo-sub">Makers of Cover Up paints</span>' : '') +
      '</span></a>';
  }

  function buildHeader(page) {
    var links = NAV.map(function (item) {
      var current = item.id === page ? ' aria-current="page"' : '';
      return '<a href="' + item.href + '"' + current + '>' + item.label + '</a>';
    }).join('');

    return '' +
      '<div class="utility-bar">' +
        '<div class="wrap">' +
          '<p class="utility-tagline">Made in Lahore since 1985</p>' +
          '<nav class="utility-links" aria-label="Quick links">' +
            '<a href="dealers.html#find">' + icon('pin') + 'Find a dealer</a>' +
            '<a href="painters.html">' + icon('brush') + 'Painter services</a>' +
            '<a target="_blank" rel="noopener" href="' + whatsappLink('Assalam o alaikum, I have a question about Amco Paints.') + '">' + icon('whatsapp') + 'WhatsApp</a>' +
          '</nav>' +
        '</div>' +
      '</div>' +
      '<div class="header-bar">' +
        '<div class="wrap">' +
          logoHtml(true) +
          '<nav class="site-nav" id="site-nav" aria-label="Main">' + links + '</nav>' +
          '<div class="header-actions">' +
            '<button class="btn btn-ghost btn-sm" type="button" data-open-project>My project <span class="count-badge" data-project-count>0</span></button>' +
          '</div>' +
          '<button class="icon-btn nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">' + icon('menu') + '</button>' +
        '</div>' +
      '</div>';
  }

  function footerColumn(title, items) {
    return '<div><h4>' + title + '</h4><ul>' + items.map(function (item) {
      return '<li><a href="' + item[0] + '">' + item[1] + '</a></li>';
    }).join('') + '</ul></div>';
  }

  function buildFooter() {
    return '' +
      '<div class="wrap">' +
        '<div class="footer-grid">' +
          '<div class="footer-brand">' +
            logoHtml(true) +
            '<p>' + CONFIG.legalName + ', makers of Cover Up paints. Made in Lahore since 1985 for Pakistani walls and Pakistani weather.</p>' +
            '<p class="urdu" lang="ur">پاکستان کے رنگ، پاکستان کی دیواروں کے لیے</p>' +
          '</div>' +
          footerColumn('Plan', [
            ['colours.html', 'Shade card'],
            ['colours.html#match', 'Match a colour from a photo'],
            ['visualiser.html', '3D visualiser'],
            ['my-property.html', 'Upload your plans'],
            ['tools.html#calculator', 'Paint calculator']
          ]) +
          footerColumn('Fix', [
            ['tools.html#doctor', 'Wall doctor'],
            ['tools.html#city', 'Paint for your city'],
            ['tools.html#countdown', 'Eid and shaadi countdown'],
            ['products.html', 'All products']
          ]) +
          footerColumn('Reach us', [
            ['dealers.html', 'Find a dealer'],
            ['dealers.html#verify', 'Check a tin is genuine'],
            ['painters.html', 'Trusted painters'],
            ['painters.html#club', 'Ustad Club for painters'],
            ['tel:+924237163641', CONFIG.phone],
            ['mailto:' + CONFIG.email, CONFIG.email]
          ]) +
        '</div>' +
        '<div class="footer-legal">' +
          '<p>Office: ' + CONFIG.office + '. Works: ' + CONFIG.works + '.</p>' +
          '<p>Screen colours are a guide. Check the printed shade card before you buy.</p>' +
        '</div>' +
      '</div>';
  }

  function buildDrawer() {
    return '' +
      '<div class="drawer-head">' +
        '<h3>My project</h3>' +
        '<button class="icon-btn" type="button" data-close-project aria-label="Close my project">' + icon('close') + '</button>' +
      '</div>' +
      '<div class="drawer-body" data-project-body></div>' +
      '<div class="drawer-foot">' +
        '<a class="btn btn-wa" data-project-send target="_blank" rel="noopener" href="#">Send to Amco on WhatsApp</a>' +
        '<button class="btn btn-ghost" type="button" data-project-clear>Clear project</button>' +
      '</div>';
  }

  function renderDrawer(body, sendLink, countEls) {
    var html = '';
    var empty = !project.shades.length && !(project.walls && project.walls.length) && !project.estimate;

    if (empty) {
      html = '<div class="stack"><p>Nothing saved yet.</p>' +
        '<p class="muted">Save shades from the shade card, paint walls in the 3D visualiser or run the calculator. Everything collects here, ready to send to a dealer.</p>' +
        '<a class="btn" href="colours.html">Open the shade card</a></div>';
    }

    if (project.shades.length) {
      html += '<h4>Saved shades</h4>';
      project.shades.forEach(function (code) {
        var shade = window.AmcoShades && window.AmcoShades.get(code);
        if (!shade) { return; }
        html += '<div class="project-item" style="--chip:' + shade.hex + '">' +
          '<span class="sw"></span>' +
          '<span><strong>' + escapeHtml(shade.name) + '</strong><br><span class="small muted">' + shade.code + '</span></span>' +
          '<button class="icon-btn" type="button" data-remove-shade="' + shade.code + '" aria-label="Remove ' + escapeHtml(shade.name) + '">' + icon('close') + '</button>' +
        '</div>';
      });
    }

    if (project.walls && project.walls.length) {
      html += '<h4>From the 3D visualiser</h4>';
      project.walls.forEach(function (wall) {
        html += '<div class="project-item" style="--chip:' + wall.hex + '">' +
          '<span class="sw"></span>' +
          '<span><strong>' + escapeHtml(wall.label) + '</strong><br><span class="small muted">' + escapeHtml(wall.shadeName) + ', ' + wall.code + '</span></span><span></span>' +
        '</div>';
      });
    }

    if (project.estimate) {
      html += '<h4>Paint estimate</h4>' +
        '<p>' + escapeHtml(project.estimate.summary) + '</p>';
    }

    body.innerHTML = html;
    sendLink.href = whatsappLink(projectMessage());
    var total = project.shades.length + (project.walls ? project.walls.length : 0) + (project.estimate ? 1 : 0);
    countEls.forEach(function (el) { el.textContent = String(total); });
  }

  // The header condenses once the page has scrolled past the utility bar.
  function watchScroll(header) {
    var scrolled = null;
    function update() {
      var next = window.scrollY > SCROLL_CONDENSE_AT;
      if (next === scrolled) { return; }
      scrolled = next;
      header.setAttribute('data-scrolled', String(next));
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  function init() {
    var page = document.body.getAttribute('data-page') || '';

    var header = document.querySelector('[data-site-header]');
    if (header) {
      header.className = 'site-header';
      header.innerHTML = buildHeader(page);
      watchScroll(header);
    }

    var footer = document.querySelector('[data-site-footer]');
    if (footer) {
      footer.className = 'site-footer';
      footer.innerHTML = buildFooter();
    }

    var scrim = document.createElement('div');
    scrim.className = 'scrim';
    var drawer = document.createElement('aside');
    drawer.className = 'drawer';
    drawer.setAttribute('aria-label', 'My project');
    drawer.innerHTML = buildDrawer();
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(scrim);
    document.body.appendChild(drawer);
    document.body.appendChild(toastEl);

    var body = drawer.querySelector('[data-project-body]');
    var sendLink = drawer.querySelector('[data-project-send]');
    var countEls = Array.prototype.slice.call(document.querySelectorAll('[data-project-count]'));

    function setDrawer(open) {
      drawer.setAttribute('data-open', String(open));
      scrim.setAttribute('data-open', String(open));
      if (open) { drawer.querySelector('[data-close-project]').focus(); }
    }

    function refresh() { renderDrawer(body, sendLink, countEls); }

    document.addEventListener('click', function (event) {
      var target = event.target.closest('[data-open-project], [data-close-project], [data-project-clear], [data-remove-shade], .nav-toggle');
      if (!target) { return; }
      if (target.hasAttribute('data-open-project')) { setDrawer(true); }
      if (target.hasAttribute('data-close-project')) { setDrawer(false); }
      if (target.hasAttribute('data-project-clear')) { Project.clear(); toast('Project cleared'); }
      if (target.hasAttribute('data-remove-shade')) { Project.toggleShade(target.getAttribute('data-remove-shade')); }
      if (target.classList.contains('nav-toggle')) {
        var nav = document.getElementById('site-nav');
        var open = nav.getAttribute('data-open') !== 'true';
        nav.setAttribute('data-open', String(open));
        target.setAttribute('aria-expanded', String(open));
      }
    });

    scrim.addEventListener('click', function () { setDrawer(false); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { setDrawer(false); }
    });

    Project.onChange(refresh);
    refresh();
  }

  window.Amco = {
    config: CONFIG,
    project: Project,
    toast: toast,
    escapeHtml: escapeHtml,
    formatPkr: formatPkr,
    whatsappLink: whatsappLink
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
