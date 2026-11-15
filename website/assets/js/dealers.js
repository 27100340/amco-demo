/* Dealers page: dealer finder, the genuine-tin check and the two painter
   forms. Nothing here talks to a server: every enquiry becomes a WhatsApp
   link that the visitor chooses to open and send. */
(function () {
  'use strict';

  var data = window.AmcoData;
  var shades = window.AmcoShades;
  var amco = window.Amco;
  var esc = amco.escapeHtml;

  var PAGE_SHADE_CODE = 'AM-5005';
  var ALL_CITIES = 'all';
  var GREETING = 'Assalam o alaikum, ';

  var BATCH_PATTERN = /^AMC[-\s]?(\d{4})[-\s]?(\d{4})$/;
  var BATCH_PREFIX = 'AMC';
  var BATCH_FORMAT = 'AMC-0000-0000';

  var PHONE_PATTERN = /^[\d\s+()-]+$/;
  var PHONE_MIN_DIGITS = 10;
  var PHONE_MAX_DIGITS = 13;
  var YEARS_PATTERN = /^\d+$/;
  var YEARS_MAX = 70;
  var ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var RULE_MESSAGES = {
    phone: 'Enter a phone number with its code, for example 0300 1234567.',
    years: 'Enter your years of experience as a whole number, for example 8.',
    date: 'Pick today or a later date, or leave this blank.'
  };

  function whatsappAnchor(message, label, className) {
    return '<a class="' + className + '" target="_blank" rel="noopener" href="' + esc(amco.whatsappLink(message)) + '">' + esc(label) + '</a>';
  }

  /* ---------- Find a dealer ---------- */

  function initFinder() {
    var filterEl = document.getElementById('city-filter');
    var searchEl = document.getElementById('dealer-search');
    var countEl = document.getElementById('dealer-count');
    var listEl = document.getElementById('dealer-list');
    var joinLinkEl = document.getElementById('dealer-join-link');
    var pageShade = shades.get(PAGE_SHADE_CODE);
    var chipStyle = pageShade ? ' style="--chip:' + pageShade.hex + '"' : '';
    var activeCity = ALL_CITIES;
    var searchText = '';

    function distinctCities() {
      var cities = [];
      data.dealers.forEach(function (dealer) {
        if (cities.indexOf(dealer.city) === -1) { cities.push(dealer.city); }
      });
      return cities;
    }

    function matches(dealer) {
      var haystack = (dealer.city + ' ' + dealer.area + ' ' + dealer.name).toLowerCase();
      var inCity = activeCity === ALL_CITIES || dealer.city === activeCity;
      return inCity && haystack.indexOf(searchText.toLowerCase()) !== -1;
    }

    function dealerHtml(dealer) {
      var place = dealer.area + ', ' + dealer.city;
      var message = GREETING + 'please send me the phone number and address of this Amco dealer: ' + dealer.name + ' (' + place + ').';
      return '' +
        '<article class="leaf"' + chipStyle + '>' +
          '<div class="leaf-body dealer-body">' +
            '<div class="stack stack-sm">' +
              '<h3>' + esc(dealer.name) + '</h3>' +
              '<p class="row"><span>' + esc(place) + '</span><span class="tag">' + esc(dealer.type) + '</span></p>' +
            '</div>' +
            whatsappAnchor(message, 'Get phone and address on WhatsApp', 'btn btn-wa btn-sm') +
          '</div>' +
        '</article>';
    }

    // The place the visitor was looking for, in their own words where they typed any.
    function searchedPlace() {
      if (!searchText) { return activeCity; }
      return activeCity === ALL_CITIES ? searchText : searchText + ', ' + activeCity;
    }

    function emptyHtml() {
      var place = searchedPlace();
      var message = GREETING + 'I am looking for an Amco dealer near ' + place + '.';
      return '' +
        '<div class="panel stack">' +
          '<p>No dealer listed in ' + esc(place) + ' yet. WhatsApp us and we will connect you with the nearest one.</p>' +
          '<p>' + whatsappAnchor(message, 'Ask for the nearest dealer on WhatsApp', 'btn btn-wa') + '</p>' +
        '</div>';
    }

    function countText(count) {
      var noun = count === 1 ? ' dealer' : ' dealers';
      var where = activeCity === ALL_CITIES ? ' listed' : ' in ' + activeCity;
      var matching = searchText ? ' matching "' + searchText + '"' : '';
      return count ? count + noun + where + matching : 'No dealers found';
    }

    function renderFilter() {
      var options = [{ value: ALL_CITIES, label: 'All cities' }].concat(distinctCities().map(function (city) {
        return { value: city, label: city };
      }));
      filterEl.innerHTML = options.map(function (option) {
        return '<button type="button" data-city="' + esc(option.value) + '" aria-pressed="' + (option.value === activeCity) + '">' + esc(option.label) + '</button>';
      }).join('');
    }

    function renderList() {
      var found = data.dealers.filter(matches);
      countEl.textContent = countText(found.length);
      listEl.innerHTML = found.length ? found.map(dealerHtml).join('') : emptyHtml();
    }

    filterEl.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-city]');
      if (!button) { return; }
      activeCity = button.getAttribute('data-city');
      Array.prototype.forEach.call(filterEl.children, function (other) {
        other.setAttribute('aria-pressed', String(other === button));
      });
      renderList();
    });

    searchEl.addEventListener('input', function () {
      searchText = searchEl.value.trim();
      renderList();
    });

    joinLinkEl.href = amco.whatsappLink(GREETING + 'I would like to become an Amco dealer.\nShop name: \nCity and market: ');
    renderFilter();
    renderList();
  }

  /* ---------- Check a tin is genuine ---------- */

  // Returns the code as printed on the lid (AMC-0000-0000), or null if the
  // text cannot be an Amco batch code. Spaces or missing dashes are forgiven.
  function normaliseBatch(text) {
    var match = BATCH_PATTERN.exec(String(text).trim().toUpperCase());
    return match ? BATCH_PREFIX + '-' + match[1] + '-' + match[2] : null;
  }

  function outcomeHtml(state, title, bodyHtml) {
    return '<div class="result verify-outcome stack" data-state="' + state + '"><h3>' + esc(title) + '</h3>' + bodyHtml + '</div>';
  }

  function genuineHtml(code, batch) {
    var rows = [['Product', batch.product], ['Pack', batch.pack], ['Packed', batch.packed]].map(function (row) {
      return '<tr><th scope="row">' + row[0] + '</th><td>' + esc(row[1]) + '</td></tr>';
    }).join('');
    return outcomeHtml('genuine', 'This tin is genuine', '' +
      '<p>Batch code ' + esc(code) + ' is in our packing records.</p>' +
      '<table class="table"><tbody>' + rows + '</tbody></table>' +
      '<p class="small muted">Check that the lid was still sealed when you got it. A genuine sticker on a tin that has been opened does not prove what is inside.</p>');
  }

  function unknownHtml(code) {
    var message = GREETING + 'the Amco website did not recognise batch code ' + code + '. I want to report this tin.\nBought from (shop and city): ';
    return outcomeHtml('unknown', 'We do not recognise this code', '' +
      '<p>' + esc(code) + ' is not in our packing records. First check that you typed it exactly as it is printed on the lid sticker.</p>' +
      '<p>If it still does not match, do not use the tin. Keep the tin and your receipt, and report it to us so we can trace where it was sold.</p>' +
      '<p>' + whatsappAnchor(message, 'Report this tin on WhatsApp', 'btn btn-wa') + '</p>');
  }

  function formatHelpHtml(wasEmpty) {
    var title = wasEmpty ? 'Type the batch code first' : 'That is not how an Amco batch code looks';
    return outcomeHtml('format', title, '' +
      '<p>The code is the letters ' + BATCH_PREFIX + ', then four digits, a dash and four more digits, like this: ' + BATCH_FORMAT + '.</p>' +
      '<p>You will find it on the sticker on the lid of the tin.</p>');
  }

  function initVerify() {
    var formEl = document.getElementById('verify-form');
    var inputEl = document.getElementById('batch-code');
    var resultEl = document.getElementById('verify-result');

    formEl.addEventListener('submit', function (event) {
      var typed = inputEl.value.trim();
      var code = normaliseBatch(typed);
      event.preventDefault();
      if (!code) {
        resultEl.innerHTML = formatHelpHtml(!typed);
        inputEl.focus();
        return;
      }
      inputEl.value = code;
      resultEl.innerHTML = Object.prototype.hasOwnProperty.call(data.batches, code)
        ? genuineHtml(code, data.batches[code])
        : unknownHtml(code);
    });
  }

  /* ---------- Painter forms ---------- */

  function padTwo(number) {
    return number < 10 ? '0' + number : String(number);
  }

  function todayIso() {
    var now = new Date();
    return now.getFullYear() + '-' + padTwo(now.getMonth() + 1) + '-' + padTwo(now.getDate());
  }

  // "2026-11-15" becomes "15 November 2026" so the message reads naturally.
  function readableDate(isoDate) {
    var parts = ISO_DATE_PATTERN.exec(isoDate);
    var month = parts ? MONTHS[Number(parts[2]) - 1] : null;
    return month ? Number(parts[3]) + ' ' + month + ' ' + parts[1] : isoDate;
  }

  function countDigits(text) {
    return text.replace(/\D/g, '').length;
  }

  // Returns the problem with a field in plain words, or '' when it is fine.
  function fieldProblem(field) {
    var value = field.value.trim();
    var rule = field.getAttribute('data-rule');
    var digits;
    if (!value) {
      return field.required ? field.getAttribute('data-required-message') : '';
    }
    if (rule === 'phone') {
      digits = countDigits(value);
      if (!PHONE_PATTERN.test(value) || digits < PHONE_MIN_DIGITS || digits > PHONE_MAX_DIGITS) { return RULE_MESSAGES.phone; }
    }
    if (rule === 'years' && (!YEARS_PATTERN.test(value) || Number(value) > YEARS_MAX)) { return RULE_MESSAGES.years; }
    if (rule === 'date' && value < todayIso()) { return RULE_MESSAGES.date; }
    return '';
  }

  function showFieldProblem(field) {
    var problem = fieldProblem(field);
    var errorEl = document.getElementById(field.id + '-error');
    field.setAttribute('aria-invalid', String(Boolean(problem)));
    if (errorEl) {
      errorEl.textContent = problem;
      errorEl.hidden = !problem;
    }
    return problem;
  }

  function messageValue(field) {
    var value = field.value.trim();
    if (!value) { return field.getAttribute('data-empty-text') || ''; }
    return field.getAttribute('data-rule') === 'date' ? readableDate(value) : value;
  }

  function showOpened(statusEl, link) {
    var fallback = document.createElement('a');
    fallback.href = link;
    fallback.target = '_blank';
    fallback.rel = 'noopener';
    fallback.textContent = 'open WhatsApp here';
    statusEl.textContent = 'WhatsApp has opened in a new tab with your message ready. Press send there. If no tab opened, ';
    statusEl.appendChild(fallback);
    statusEl.appendChild(document.createTextNode('.'));
  }

  function initWhatsAppForm(formEl) {
    var fields = Array.prototype.slice.call(formEl.querySelectorAll('[data-label]'));
    var statusEl = formEl.querySelector('[data-form-status]');

    fields.forEach(function (field) {
      if (field.getAttribute('data-rule') === 'date') { field.min = todayIso(); }
    });

    // Once a field has been flagged, clear the flag as soon as it is fixed.
    function recheck(event) {
      if (event.target.getAttribute('aria-invalid') === 'true') { showFieldProblem(event.target); }
    }
    formEl.addEventListener('input', recheck);
    formEl.addEventListener('change', recheck);

    formEl.addEventListener('submit', function (event) {
      var invalid = fields.filter(function (field) { return showFieldProblem(field); });
      var lines;
      var link;
      event.preventDefault();
      if (invalid.length) {
        statusEl.textContent = '';
        invalid[0].focus();
        return;
      }
      lines = [formEl.getAttribute('data-intro')].concat(fields.map(function (field) {
        return field.getAttribute('data-label') + ': ' + messageValue(field);
      }));
      link = amco.whatsappLink(lines.join('\n'));
      window.open(link, '_blank', 'noopener');
      showOpened(statusEl, link);
    });
  }

  initFinder();
  initVerify();
  Array.prototype.forEach.call(document.querySelectorAll('[data-whatsapp-form]'), initWhatsAppForm);
})();
