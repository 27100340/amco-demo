/* Products page: the price list with its category filter, the side-by-side
   comparison and the prices shown in the "Good, better, best" guide. */
(function () {
  'use strict';

  var data = window.AmcoData;
  var shades = window.AmcoShades;
  var amco = window.Amco;
  var esc = amco.escapeHtml;

  var ALL_CATEGORIES = 'all';
  var MIN_COMPARE = 2;
  var MAX_COMPARE = 3;
  var PRICE_ROUNDING_PKR = 10;
  var WASH_SEGMENTS = 5;
  var DRUM_PACK_ID = 'drum';
  var FALLBACK_CHIP = '#ccc';
  var GRADED_TIERS = ['Economy', 'Good', 'Better', 'Best'];
  var WASH_NOTES = {
    1: 'Dust it only. Water leaves marks.',
    2: 'Takes a light wipe, nothing more.',
    3: 'Wipes with a damp cloth.',
    4: 'Scrubbable. Fine for kitchens and corridors.',
    5: 'Fully washable. Stains scrub off.'
  };
  var NOT_RATED = 'Not rated';
  var COMPARE_HINT = 'Nothing to compare yet. Pick two or three products from the price list above.';

  var filterEl = document.getElementById('category-filter');
  var countEl = document.getElementById('product-count');
  var listEl = document.getElementById('product-list');
  var barEl = document.getElementById('compare-bar');
  var barTextEl = document.getElementById('compare-bar-text');
  var barLinkEl = document.getElementById('compare-bar-link');
  var clearEl = document.getElementById('compare-clear');
  var liveEl = document.getElementById('compare-live');
  var compareHeadingEl = document.getElementById('compare-heading');
  var compareEmptyEl = document.getElementById('compare-empty');
  var comparePanelEl = document.getElementById('compare-panel');
  var compareTableEl = document.getElementById('compare-table');

  var drumPack = data.packs.filter(function (pack) { return pack.id === DRUM_PACK_ID; })[0] || data.packs[0];
  var activeCategory = ALL_CATEGORIES;
  var compareIds = [];

  /* ---------- Figures ---------- */

  function packPrice(product, pack) {
    return Math.round(product.pricePerLitre * pack.litres / PRICE_ROUNDING_PKR) * PRICE_ROUNDING_PKR;
  }

  function coverageSqFt(product) {
    return Math.round(product.coverage * data.SQFT_PER_SQM);
  }

  function chipHex(product) {
    var shade = shades.get(product.chip);
    return shade ? shade.hex : FALLBACK_CHIP;
  }

  function tierLabel(product) {
    return GRADED_TIERS.indexOf(product.tier) === -1 ? product.tier : product.tier + ' grade';
  }

  function washRating(product) {
    return product.washable ? product.washable + ' out of ' + WASH_SEGMENTS : NOT_RATED;
  }

  function priceMessage(product) {
    var packNames = data.packs.map(function (pack) { return pack.label.toLowerCase(); }).join(', ');
    return 'Assalam o alaikum, please confirm the price of ' + product.name + ' (' + packNames + ') and tell me the nearest dealer.';
  }

  function isCompared(productId) {
    return compareIds.indexOf(productId) !== -1;
  }

  function joinNames(names) {
    if (names.length < 2) { return names.join(''); }
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  /* ---------- Price list ---------- */

  function tagsHtml(product) {
    var html = '<span class="tag">' + esc(tierLabel(product)) + '</span>';
    if (product.finish !== product.tier) {
      html += '<span class="tag">' + esc(product.finish) + ' finish</span>';
    }
    return html;
  }

  function coverageHtml(product) {
    var coats = product.coats === 1 ? 'One coat is enough.' : 'Plan for ' + product.coats + ' coats.';
    return '<p class="small">One litre covers about ' + coverageSqFt(product) + ' sq ft per coat. ' + coats + '</p>';
  }

  function washHtml(product) {
    var segments = '';
    var segment;
    if (!product.washable) { return ''; }
    for (segment = 1; segment <= WASH_SEGMENTS; segment += 1) {
      segments += segment <= product.washable ? '<span class="is-on"></span>' : '<span></span>';
    }
    return '' +
      '<div class="wash">' +
        '<p class="small"><strong>Washability ' + washRating(product) + '.</strong> ' + esc(WASH_NOTES[product.washable] || '') + '</p>' +
        '<span class="wash-bar" aria-hidden="true">' + segments + '</span>' +
      '</div>';
  }

  function packTableHtml(product) {
    var rows = data.packs.map(function (pack) {
      return '<tr>' +
        '<th scope="row">' + esc(pack.label) + ' <span class="muted">' + pack.litres + ' L</span></th>' +
        '<td class="num">' + amco.formatPkr(packPrice(product, pack)) + '</td>' +
      '</tr>';
    }).join('');
    return '<table class="table">' +
      '<caption class="visually-hidden">Price of each tin of ' + esc(product.name) + '</caption>' +
      '<tbody>' + rows + '</tbody></table>';
  }

  function productHtml(product) {
    var productId = esc(product.id);
    var points = product.points.map(function (point) { return '<li>' + esc(point) + '</li>'; }).join('');
    return '' +
      '<article class="leaf product" id="' + productId + '" style="--chip:' + chipHex(product) + '">' +
        '<div class="leaf-body product-body">' +
          '<div class="stack">' +
            '<div class="stack stack-sm">' +
              '<h3>' + esc(product.name) + '</h3>' +
              '<p class="row">' + tagsHtml(product) + '</p>' +
            '</div>' +
            '<p>' + esc(product.line) + '</p>' +
            '<ul class="list-check">' + points + '</ul>' +
            coverageHtml(product) +
            washHtml(product) +
          '</div>' +
          '<div class="product-buy stack">' +
            '<p class="price-figure num">' + amco.formatPkr(product.pricePerLitre) + ' <small>per litre</small></p>' +
            packTableHtml(product) +
            '<div class="product-actions">' +
              '<a class="btn" href="tools.html?product=' + encodeURIComponent(product.id) + '#calculator">Calculate how much I need</a>' +
              '<a class="btn btn-wa" target="_blank" rel="noopener" href="' + esc(amco.whatsappLink(priceMessage(product))) + '">Ask price on WhatsApp</a>' +
              '<button class="btn btn-ghost compare-toggle" type="button" data-compare="' + productId + '" aria-pressed="' + isCompared(product.id) + '">Compare this product</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderFilter() {
    var options = [{ id: ALL_CATEGORIES, name: 'All products' }].concat(data.categories);
    filterEl.innerHTML = options.map(function (category) {
      return '<button type="button" data-category="' + esc(category.id) + '" aria-pressed="' + (category.id === activeCategory) + '">' + esc(category.name) + '</button>';
    }).join('');
  }

  function countText(count) {
    var category = data.categories.filter(function (item) { return item.id === activeCategory; })[0];
    return (category ? category.name : 'All products') + ': ' + count;
  }

  function renderList() {
    var visible = data.products.filter(function (product) {
      return activeCategory === ALL_CATEGORIES || product.category === activeCategory;
    });
    countEl.textContent = countText(visible.length);
    listEl.innerHTML = visible.length
      ? visible.map(productHtml).join('')
      : '<p class="panel">No products in this group yet.</p>';
  }

  /* ---------- Comparison ---------- */

  var COMPARE_ROWS = [
    { label: 'Finish', value: function (product) { return product.finish; } },
    { label: 'Price per litre', value: function (product) { return amco.formatPkr(product.pricePerLitre); } },
    { label: 'Drum price', value: function (product) { return amco.formatPkr(packPrice(product, drumPack)); } },
    { label: 'Coverage', value: function (product) { return 'About ' + coverageSqFt(product) + ' sq ft per litre, per coat'; } },
    { label: 'Washability', value: washRating },
    { label: 'Best for', value: function (product) { return product.line; } }
  ];

  function compareTableHtml(selected) {
    var head = selected.map(function (product) {
      return '<th scope="col">' +
        '<span class="dot" style="--chip:' + chipHex(product) + '"></span> ' + esc(product.name) + '<br>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-compare-remove="' + esc(product.id) + '" aria-label="Remove ' + esc(product.name) + ' from the comparison">Remove</button>' +
      '</th>';
    }).join('');
    var body = COMPARE_ROWS.map(function (row) {
      var cells = selected.map(function (product) { return '<td>' + esc(row.value(product)) + '</td>'; }).join('');
      return '<tr><th scope="row">' + row.label + '</th>' + cells + '</tr>';
    }).join('');
    return '<caption class="visually-hidden">Selected products compared</caption>' +
      '<thead><tr><th scope="col"><span class="visually-hidden">What is compared</span></th>' + head + '</tr></thead>' +
      '<tbody>' + body + '</tbody>';
  }

  function compareStatus(names) {
    if (!names.length) { return 'Comparison cleared.'; }
    if (names.length < MIN_COMPARE) { return names[0] + ' picked. Pick one more to compare.'; }
    return 'Comparing ' + joinNames(names) + '.';
  }

  function renderCompare() {
    var selected = compareIds
      .map(function (productId) { return data.product(productId); })
      .filter(Boolean);
    var names = selected.map(function (product) { return product.name; });
    var ready = selected.length >= MIN_COMPARE;

    barEl.hidden = !selected.length;
    barTextEl.textContent = compareStatus(names);
    barLinkEl.hidden = !ready;

    compareEmptyEl.hidden = ready;
    compareEmptyEl.textContent = selected.length ? compareStatus(names) : COMPARE_HINT;
    comparePanelEl.hidden = !ready;
    compareTableEl.innerHTML = ready ? compareTableHtml(selected) : '';

    Array.prototype.forEach.call(listEl.querySelectorAll('[data-compare]'), function (button) {
      button.setAttribute('aria-pressed', String(isCompared(button.getAttribute('data-compare'))));
    });
    return compareStatus(names);
  }

  function toggleCompare(productId) {
    var index = compareIds.indexOf(productId);
    if (index !== -1) {
      compareIds.splice(index, 1);
    } else if (compareIds.length >= MAX_COMPARE) {
      amco.toast('You can compare ' + MAX_COMPARE + ' products at a time. Remove one first, then add this one.');
      return;
    } else {
      compareIds.push(productId);
    }
    liveEl.textContent = renderCompare();
  }

  /* ---------- Good, better, best guide ---------- */

  function fillGradeGuide() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-guide-product]'), function (leaf) {
      var product = data.product(leaf.getAttribute('data-guide-product'));
      var priceEl = leaf.querySelector('[data-guide-price]');
      if (!product) { return; }
      leaf.style.setProperty('--chip', chipHex(product));
      if (priceEl) { priceEl.textContent = amco.formatPkr(product.pricePerLitre) + ' per litre'; }
    });
  }

  // Lets other pages link straight to one product, for example products.html#aqueous-matt.
  function showLinkedProduct() {
    var productId = window.location.hash.slice(1);
    var target = data.product(productId) ? document.getElementById(productId) : null;
    if (target) { target.scrollIntoView(); }
  }

  /* ---------- Events ---------- */

  filterEl.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-category]');
    if (!button) { return; }
    activeCategory = button.getAttribute('data-category');
    Array.prototype.forEach.call(filterEl.children, function (other) {
      other.setAttribute('aria-pressed', String(other === button));
    });
    renderList();
  });

  listEl.addEventListener('click', function (event) {
    var button = event.target.closest('[data-compare]');
    if (button) { toggleCompare(button.getAttribute('data-compare')); }
  });

  compareTableEl.addEventListener('click', function (event) {
    var button = event.target.closest('[data-compare-remove]');
    if (!button) { return; }
    toggleCompare(button.getAttribute('data-compare-remove'));
    compareHeadingEl.focus();
  });

  clearEl.addEventListener('click', function () {
    compareIds = [];
    liveEl.textContent = renderCompare();
  });

  renderFilter();
  renderList();
  renderCompare();
  fillGradeGuide();
  showLinkedProduct();
})();
