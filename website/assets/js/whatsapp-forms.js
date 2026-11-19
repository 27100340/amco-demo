/* WhatsApp enquiry forms, shared by every page that has one. A form marked
   data-whatsapp-form checks its fields, then builds a WhatsApp message from
   them (data-intro, then one "Label: value" line per [data-label] field) and
   opens it. Nothing is sent to a server. Load after site.js. */
(function () {
  'use strict';

  var amco = window.Amco;

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

  // The problem with a non-empty value under a field's data-rule, in plain
  // words, or '' when it is fine. today is an ISO date (YYYY-MM-DD).
  function ruleProblem(value, rule, today) {
    var digits;
    if (rule === 'phone') {
      digits = countDigits(value);
      if (!PHONE_PATTERN.test(value) || digits < PHONE_MIN_DIGITS || digits > PHONE_MAX_DIGITS) { return RULE_MESSAGES.phone; }
    }
    if (rule === 'years' && (!YEARS_PATTERN.test(value) || Number(value) > YEARS_MAX)) { return RULE_MESSAGES.years; }
    if (rule === 'date' && value < today) { return RULE_MESSAGES.date; }
    return '';
  }

  // Returns the problem with a field in plain words, or '' when it is fine.
  function fieldProblem(field) {
    var value = field.value.trim();
    if (!value) {
      return field.required ? field.getAttribute('data-required-message') : '';
    }
    return ruleProblem(value, field.getAttribute('data-rule'), todayIso());
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

  function init(formEl) {
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

  window.AmcoForms = { init: init, ruleProblem: ruleProblem, readableDate: readableDate };
  Array.prototype.forEach.call(document.querySelectorAll('[data-whatsapp-form]'), init);
})();
