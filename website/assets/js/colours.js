/* Colours page: the shade card with its selected-shade panel, and the photo
   colour matcher. Needs shades.js and site.js to be loaded first. */
(function () {
  'use strict';

  var shades = window.AmcoShades;
  var amco = window.Amco;
  if (!shades || !amco) { return; }

  var SAVE_LABEL = 'Save to my project';
  var REMOVE_LABEL = 'Remove from my project';

  // How each kind of light shifts a colour: multipliers for red, green, blue.
  var LIGHTS = [
    { label: 'Daylight', factors: [1, 1, 1] },
    { label: 'Warm bulb', factors: [1, 0.9, 0.72] },
    { label: 'Tube light', factors: [0.9, 0.98, 1.05] }
  ];

  var PHOTO_MAX_WIDTH = 960;
  var PHOTO_MAX_HEIGHT = 720;
  var PHOTO_BACKDROP = '#ffffff';
  var PICK_REACH = 2; // pixels each side of the tapped one, giving a 5x5 block
  var PICK_MATCHES = 3;
  var KEY_MOVES = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  var KEY_MOVE_FRACTION = 40;

  var DOMINANT_COUNT = 5;
  var DOMINANT_SAMPLES = 12000;
  var DOMINANT_BUCKET_SHIFT = 5; // 8 levels per channel
  var DOMINANT_MERGE_DISTANCE = 56;
  var DOMINANT_MIN_SHARE = 0.01;

  function byId(id) { return document.getElementById(id); }

  var main = byId('colours-main');
  var titleBand = byId('title-band');
  var titleTab = byId('title-tab');

  var cardLayout = byId('card-layout');
  var searchInput = byId('shade-search');
  var sortGroup = byId('shade-sort');
  var familyFilter = byId('family-filter');
  var shadeCount = byId('shade-count');
  var shadeGrid = byId('shade-grid');
  var shadeEmpty = byId('shade-empty');
  var shadeEmptyText = byId('shade-empty-text');
  var shadeEmptyReset = byId('shade-empty-reset');

  var detail = byId('detail');
  var detailSwatch = byId('detail-swatch');
  var detailName = byId('detail-name');
  var detailCode = byId('detail-code');
  var detailFamily = byId('detail-family');
  var detailStory = byId('detail-story');
  var detailLrv = byId('detail-lrv');
  var detailLrvAdvice = byId('detail-lrv-advice');
  var detailLrvFill = byId('detail-lrv-fill');
  var detailLights = byId('detail-lights');
  var detailPartners = byId('detail-partners');
  var detailSave = byId('detail-save');
  var detailWhatsapp = byId('detail-whatsapp');

  var matchSection = byId('match');
  var dropzone = byId('dropzone');
  var photoEmpty = byId('photo-empty');
  var photoView = byId('photo-view');
  var photoStage = byId('photo-stage');
  var photoCanvas = byId('photo-canvas');
  var photoMarker = byId('photo-marker');
  var photoInput = byId('photo-input');
  var photoLabel = byId('photo-label');
  var photoError = byId('photo-error');
  var matchEmpty = byId('match-empty');
  var matchResults = byId('match-results');
  var picked = byId('picked');
  var pickedPrompt = byId('picked-prompt');
  var pickedValue = byId('picked-value');
  var pickedHex = byId('picked-hex');
  var pickedMatches = byId('picked-matches');
  var pickedStatus = byId('picked-status');
  var dominantMatches = byId('dominant-matches');

  var photoContext = photoCanvas.getContext('2d', { willReadFrequently: true });

  var view = { query: '', family: 'all', sort: 'family', selected: null };
  var photo = { ready: false, hasMarker: false, markerX: 0, markerY: 0 };

  /* ---------- Small helpers ---------- */

  function each(nodes, callback) { Array.prototype.forEach.call(nodes, callback); }

  function setPressed(group, activeButton) {
    each(group.querySelectorAll('button'), function (button) {
      button.setAttribute('aria-pressed', String(button === activeButton));
    });
  }

  function clamp(value, low, high) { return Math.min(high, Math.max(low, value)); }

  function rgbCss(rgb) { return 'rgb(' + rgb.join(', ') + ')'; }

  function rgbHex(rgb) {
    return '#' + rgb.map(function (channel) {
      var pair = channel.toString(16);
      return pair.length === 1 ? '0' + pair : pair;
    }).join('').toUpperCase();
  }

  function rgbDistance(first, second) {
    var red = first[0] - second[0];
    var green = first[1] - second[1];
    var blue = first[2] - second[2];
    return Math.sqrt(red * red + green * green + blue * blue);
  }

  function tint(rgb, factors) {
    return rgb.map(function (channel, index) {
      return Math.min(255, Math.round(channel * factors[index]));
    });
  }

  function familyName(familyId) {
    var family = shades.families.filter(function (entry) { return entry.id === familyId; })[0];
    return family ? family.name : '';
  }

  function lrvAdvice(lrv) {
    if (lrv >= 70) { return 'It bounces a lot of light back, so it is good for small or dark rooms.'; }
    if (lrv >= 40) { return 'It is balanced. It reflects a fair amount of light without glare, so it suits most rooms.'; }
    return 'It absorbs light, so it is best on one feature wall or in a bright room.';
  }

  function matchWords(delta) {
    if (delta < 6) { return 'Very close match'; }
    if (delta < 14) { return 'Close match'; }
    return 'Nearest we make';
  }

  /* ---------- Saved state ---------- */

  function applySaveState(button) {
    var shade = shades.get(button.getAttribute('data-save-code'));
    if (!shade) { return; }
    var label = amco.project.hasShade(shade.code) ? REMOVE_LABEL : SAVE_LABEL;
    button.textContent = label;
    button.setAttribute('aria-label', label + ': ' + shade.name);
  }

  function syncSaveButtons(root) {
    each(root.querySelectorAll('[data-save-code]'), applySaveState);
  }

  function syncSaved() {
    syncSaveButtons(main);
    each(shadeGrid.querySelectorAll('[data-chip-code]'), function (chip) {
      var marker = chip.querySelector('.chip-saved');
      marker.hidden = !amco.project.hasShade(chip.getAttribute('data-chip-code'));
    });
  }

  /* ---------- Shade card ---------- */

  function normalise(text) { return text.toLowerCase().replace(/[\s-]+/g, ''); }

  function matchesQuery(shade, query) {
    var needle = normalise(query);
    if (!needle) { return true; }
    return normalise(shade.name).indexOf(needle) !== -1 || normalise(shade.code).indexOf(needle) !== -1;
  }

  function filterShades(family) {
    return shades.all.filter(function (shade) {
      return (family === 'all' || shade.family === family) && matchesQuery(shade, view.query);
    });
  }

  function matchesInOtherFamilies() {
    return view.family === 'all' ? 0 : filterShades('all').length;
  }

  function chipFaceHtml(shade) {
    return '<span class="chip-colour"></span>' +
      '<span class="chip-label">' +
        '<span class="chip-name">' + amco.escapeHtml(shade.name) + '</span>' +
        '<span class="chip-code">' + shade.code + '</span>' +
      '</span>';
  }

  function chipHtml(shade) {
    var savedAttribute = amco.project.hasShade(shade.code) ? '' : ' hidden';
    return '<button class="chip" type="button" data-chip-code="' + shade.code + '" style="--chip:' + shade.hex + '" aria-pressed="' + (shade.code === view.selected) + '">' +
      chipFaceHtml(shade) +
      '<span class="chip-saved"' + savedAttribute + '>Saved</span>' +
    '</button>';
  }

  function chipGridHtml(list) {
    return '<div class="grid chip-grid">' + list.map(chipHtml).join('') + '</div>';
  }

  function familyGroupsHtml(list) {
    return shades.families.map(function (family) {
      var members = list.filter(function (shade) { return shade.family === family.id; });
      if (!members.length) { return ''; }
      return '<section class="family-group" aria-label="' + amco.escapeHtml(family.name) + '">' +
        '<h3 class="family-head">' + amco.escapeHtml(family.name) + ' <span class="urdu" lang="ur">' + amco.escapeHtml(family.urdu) + '</span></h3>' +
        chipGridHtml(members) +
      '</section>';
    }).join('');
  }

  function countText(shown) {
    var total = shades.all.length;
    if (!shown) { return 'No shades to show'; }
    if (shown === total) { return 'All ' + total + ' shades'; }
    return 'Showing ' + shown + ' of ' + total + ' shades';
  }

  function renderEmpty() {
    var elsewhere = matchesInOtherFamilies();
    if (elsewhere) {
      shadeEmptyText.textContent = 'Nothing in ' + familyName(view.family) + ' matches "' + view.query + '", but ' +
        (elsewhere === 1 ? '1 shade in another family does.' : elsewhere + ' shades in other families do.');
      shadeEmptyReset.textContent = 'Search all families';
    } else {
      shadeEmptyText.textContent = 'We could not find "' + view.query + '" on the shade card. Try part of a name such as Hunza, Multani or kinnow, or a code such as AM-5001.';
      shadeEmptyReset.textContent = 'Clear the search and show all shades';
    }
  }

  function renderGrid() {
    var list = filterShades(view.family);
    if (view.sort === 'light') {
      list = list.slice().sort(function (first, second) { return second.lrv - first.lrv; });
    }

    shadeCount.textContent = countText(list.length);
    shadeEmpty.hidden = list.length > 0;
    if (!list.length) {
      shadeGrid.innerHTML = '';
      renderEmpty();
      return;
    }
    shadeGrid.innerHTML = view.sort === 'family' ? familyGroupsHtml(list) : chipGridHtml(list);
  }

  function renderFamilyFilter() {
    var html = '<button type="button" data-family="all" aria-pressed="true">All</button>';
    shades.families.forEach(function (family) {
      var members = shades.all.filter(function (shade) { return shade.family === family.id; });
      var sample = members[Math.floor(members.length / 2)];
      html += '<button type="button" data-family="' + family.id + '" aria-pressed="false">' +
        (sample ? '<span class="dot" style="--chip:' + sample.hex + '"></span>' : '') +
        amco.escapeHtml(family.name) +
      '</button>';
    });
    familyFilter.innerHTML = html;
  }

  function setFamily(familyId) {
    view.family = familyId;
    setPressed(familyFilter, familyFilter.querySelector('[data-family="' + familyId + '"]'));
  }

  /* ---------- Selected shade ---------- */

  function partnerHtml(shade) {
    return '<button class="chip" type="button" data-open-code="' + shade.code + '" style="--chip:' + shade.hex + '">' +
      chipFaceHtml(shade) +
    '</button>';
  }

  function renderDetail(shade) {
    detailSwatch.style.setProperty('--chip', shade.hex);
    detailName.textContent = shade.name;
    detailCode.textContent = shade.code;
    detailFamily.textContent = familyName(shade.family);
    detailStory.textContent = shade.story;

    detailLrv.textContent = 'LRV ' + shade.lrv + '.';
    detailLrvAdvice.textContent = lrvAdvice(shade.lrv);
    detailLrvFill.style.width = shade.lrv + '%';

    detailLights.innerHTML = LIGHTS.map(function (light) {
      return '<li style="--chip:' + rgbCss(tint(shade.rgb, light.factors)) + '">' +
        '<span class="light-swatch"></span><span class="small">' + light.label + '</span>' +
      '</li>';
    }).join('');

    detailPartners.innerHTML = shades.partners(shade.code).map(partnerHtml).join('');

    detailSave.setAttribute('data-save-code', shade.code);
    applySaveState(detailSave);
    detailWhatsapp.href = amco.whatsappLink(
      'Assalam o alaikum, I saw ' + shade.name + ' (' + shade.code + ') on the Amco shade card. ' +
      'What is the price, and which dealer near me keeps it?'
    );
    detail.scrollTop = 0;
  }

  function detailInView() {
    var header = document.querySelector('[data-site-header]');
    var coveredTop = header ? header.offsetHeight : 0;
    var box = detailName.getBoundingClientRect();
    return box.top >= coveredTop && box.bottom <= window.innerHeight;
  }

  function writeShadeToUrl(code) {
    if (!window.history || !window.history.replaceState) { return; }
    try {
      window.history.replaceState(null, '', window.location.pathname + '?shade=' + encodeURIComponent(code) + window.location.hash);
    } catch (error) {
      // Some browsers refuse history changes on file:// pages. The link is a nicety, not a need.
    }
  }

  function shadeFromUrl() {
    var found = /[?&]shade=([^&#]*)/.exec(window.location.search);
    if (!found) { return null; }
    try {
      return shades.get(decodeURIComponent(found[1]).trim().toUpperCase());
    } catch (error) {
      // A badly encoded link falls back to the default shade.
      return null;
    }
  }

  // options.updateUrl keeps the address shareable, options.moveFocus sends
  // keyboard and screen reader users to the panel, options.reveal scrolls the
  // panel into view when it is off screen.
  function selectShade(code, options) {
    var shade = shades.get(code);
    var settings = options || {};
    if (!shade) { return; }

    view.selected = shade.code;
    titleBand.style.setProperty('--wall', shade.hex);
    titleBand.style.setProperty('--wall-ink', shade.ink);
    titleTab.textContent = shade.name + ', ' + shade.code;
    renderDetail(shade);

    each(shadeGrid.querySelectorAll('[data-chip-code]'), function (chip) {
      chip.setAttribute('aria-pressed', String(chip.getAttribute('data-chip-code') === shade.code));
    });

    if (settings.updateUrl) { writeShadeToUrl(shade.code); }
    if (settings.moveFocus) { detailName.focus({ preventScroll: true }); }
    if (settings.reveal && !detailInView()) { cardLayout.scrollIntoView(); }
  }

  /* ---------- Photo matcher ---------- */

  function showPhotoError(message) {
    photoError.textContent = message;
    photoError.hidden = false;
  }

  function clearPhotoError() {
    photoError.hidden = true;
    photoError.textContent = '';
  }

  function matchRowHtml(sourceRgb, match, extraNote) {
    var shade = match.shade;
    var safeName = amco.escapeHtml(shade.name);
    return '<li class="match-row">' +
      '<span class="pair" aria-hidden="true" style="--from:' + rgbCss(sourceRgb) + ';--chip:' + shade.hex + '">' +
        '<span class="pair-photo"></span><span class="pair-shade"></span>' +
      '</span>' +
      '<div class="match-body">' +
        '<p><strong>' + safeName + '</strong> <span class="muted num">' + shade.code + '</span></p>' +
        '<p class="small"><span class="tag">' + matchWords(match.delta) + '</span>' +
          (extraNote ? ' <span class="muted">' + amco.escapeHtml(extraNote) + '</span>' : '') +
        '</p>' +
        '<div class="row match-actions">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-save-code="' + shade.code + '"></button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-open-code="' + shade.code + '" aria-label="Open in the shade card: ' + safeName + '">Open in the shade card</button>' +
        '</div>' +
      '</div>' +
    '</li>';
  }

  function renderPicked(rgb) {
    var matches = shades.nearest(rgb, PICK_MATCHES);
    picked.style.setProperty('--chip', rgbCss(rgb));
    pickedHex.textContent = 'From your photo (' + rgbHex(rgb) + ')';
    pickedPrompt.hidden = true;
    pickedValue.hidden = false;
    pickedMatches.innerHTML = matches.map(function (match) {
      return matchRowHtml(rgb, match, '');
    }).join('');
    pickedStatus.textContent = 'Closest Amco shade: ' + matches[0].shade.name + '. ' + matchWords(matches[0].delta) + '.';
    syncSaveButtons(pickedMatches);
  }

  function resetPicked() {
    photo.hasMarker = false;
    photoMarker.hidden = true;
    picked.style.removeProperty('--chip');
    pickedPrompt.hidden = false;
    pickedValue.hidden = true;
    pickedMatches.innerHTML = '';
    pickedStatus.textContent = '';
  }

  function renderDominant(colours) {
    dominantMatches.innerHTML = colours.map(function (colour) {
      var percent = Math.max(1, Math.round(colour.share * 100));
      return matchRowHtml(colour.rgb, shades.nearest(colour.rgb, 1)[0], 'About ' + percent + '% of the photo');
    }).join('');
    syncSaveButtons(dominantMatches);
  }

  // Averages a small block around the point so one noisy pixel cannot decide the colour.
  function pickAt(pointX, pointY) {
    var width = photoCanvas.width;
    var height = photoCanvas.height;
    var centreX = clamp(Math.round(pointX), 0, width - 1);
    var centreY = clamp(Math.round(pointY), 0, height - 1);
    var left = Math.max(0, centreX - PICK_REACH);
    var top = Math.max(0, centreY - PICK_REACH);
    var right = Math.min(width - 1, centreX + PICK_REACH);
    var bottom = Math.min(height - 1, centreY + PICK_REACH);
    var block = photoContext.getImageData(left, top, right - left + 1, bottom - top + 1).data;
    var pixelCount = block.length / 4;
    var sums = [0, 0, 0];
    var offset;

    for (offset = 0; offset < block.length; offset += 4) {
      sums[0] += block[offset];
      sums[1] += block[offset + 1];
      sums[2] += block[offset + 2];
    }

    photo.hasMarker = true;
    photo.markerX = centreX;
    photo.markerY = centreY;
    photoMarker.style.left = ((centreX + 0.5) / width * 100) + '%';
    photoMarker.style.top = ((centreY + 0.5) / height * 100) + '%';
    photoMarker.hidden = false;

    renderPicked(sums.map(function (sum) { return Math.round(sum / pixelCount); }));
  }

  // Sorts sampled pixels into coarse colour buckets, then keeps the biggest
  // buckets that are visibly different from each other.
  function dominantColours() {
    var width = photoCanvas.width;
    var height = photoCanvas.height;
    var pixels = photoContext.getImageData(0, 0, width, height).data;
    var stride = Math.max(1, Math.floor(Math.sqrt(width * height / DOMINANT_SAMPLES)));
    var buckets = {};
    var sampled = 0;
    var chosen = [];
    var row;
    var column;
    var offset;
    var key;
    var bucket;

    for (row = 0; row < height; row += stride) {
      for (column = 0; column < width; column += stride) {
        offset = (row * width + column) * 4;
        key = (pixels[offset] >> DOMINANT_BUCKET_SHIFT) + '-' +
          (pixels[offset + 1] >> DOMINANT_BUCKET_SHIFT) + '-' +
          (pixels[offset + 2] >> DOMINANT_BUCKET_SHIFT);
        bucket = buckets[key];
        if (!bucket) {
          bucket = { count: 0, sums: [0, 0, 0] };
          buckets[key] = bucket;
        }
        bucket.count += 1;
        bucket.sums[0] += pixels[offset];
        bucket.sums[1] += pixels[offset + 1];
        bucket.sums[2] += pixels[offset + 2];
        sampled += 1;
      }
    }

    Object.keys(buckets)
      .map(function (bucketKey) {
        var entry = buckets[bucketKey];
        return {
          count: entry.count,
          rgb: entry.sums.map(function (sum) { return Math.round(sum / entry.count); })
        };
      })
      .sort(function (first, second) { return second.count - first.count; })
      .forEach(function (candidate) {
        var lookalike = chosen.filter(function (colour) {
          return rgbDistance(colour.rgb, candidate.rgb) < DOMINANT_MERGE_DISTANCE;
        })[0];
        if (lookalike) {
          lookalike.count += candidate.count;
          return;
        }
        var bigEnough = !chosen.length || candidate.count / sampled >= DOMINANT_MIN_SHARE;
        if (chosen.length < DOMINANT_COUNT && bigEnough) { chosen.push(candidate); }
      });

    return chosen
      .sort(function (first, second) { return second.count - first.count; })
      .map(function (colour) { return { rgb: colour.rgb, share: colour.count / sampled }; });
  }

  function showPhoto(image) {
    if (!photoContext || !image.naturalWidth || !image.naturalHeight) {
      showPhotoError('We could not read that photo here. Try a JPG or PNG instead.');
      return;
    }

    var scale = Math.min(1, PHOTO_MAX_WIDTH / image.naturalWidth, PHOTO_MAX_HEIGHT / image.naturalHeight);
    var width = Math.max(1, Math.round(image.naturalWidth * scale));
    var height = Math.max(1, Math.round(image.naturalHeight * scale));

    photoCanvas.width = width;
    photoCanvas.height = height;
    photoContext.fillStyle = PHOTO_BACKDROP;
    photoContext.fillRect(0, 0, width, height);
    photoContext.drawImage(image, 0, 0, width, height);

    photo.ready = true;
    clearPhotoError();
    resetPicked();
    photoEmpty.hidden = true;
    photoView.hidden = false;
    matchEmpty.hidden = true;
    matchResults.hidden = false;
    photoLabel.textContent = 'Choose another photo';
    renderDominant(dominantColours());
  }

  function loadPhoto(file) {
    if (file.type && file.type.indexOf('image/') !== 0) {
      showPhotoError('"' + file.name + '" is not a photo. Choose a JPG, PNG or WebP image.');
      return;
    }

    var objectUrl = window.URL.createObjectURL(file);
    var image = new window.Image();
    image.onload = function () {
      window.URL.revokeObjectURL(objectUrl);
      showPhoto(image);
    };
    image.onerror = function () {
      window.URL.revokeObjectURL(objectUrl);
      showPhotoError('We could not open "' + file.name + '" as a photo. Try a JPG or PNG instead.');
    };
    image.src = objectUrl;
  }

  /* ---------- Events ---------- */

  main.addEventListener('click', function (event) {
    var saveButton = event.target.closest('[data-save-code]');
    var openButton = event.target.closest('[data-open-code]');
    var chip = event.target.closest('[data-chip-code]');

    if (saveButton) {
      amco.project.toggleShade(saveButton.getAttribute('data-save-code'));
    } else if (openButton) {
      selectShade(openButton.getAttribute('data-open-code'), { updateUrl: true, moveFocus: true, reveal: true });
    } else if (chip) {
      selectShade(chip.getAttribute('data-chip-code'), { updateUrl: true, reveal: true });
    }
  });

  searchInput.addEventListener('input', function () {
    view.query = searchInput.value.trim();
    renderGrid();
  });

  sortGroup.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) { return; }
    view.sort = button.getAttribute('data-sort');
    setPressed(sortGroup, button);
    renderGrid();
  });

  familyFilter.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) { return; }
    setFamily(button.getAttribute('data-family'));
    renderGrid();
  });

  shadeEmptyReset.addEventListener('click', function () {
    if (!matchesInOtherFamilies()) {
      view.query = '';
      searchInput.value = '';
    }
    setFamily('all');
    renderGrid();
    searchInput.focus();
  });

  photoInput.addEventListener('change', function () {
    var file = photoInput.files && photoInput.files[0];
    if (file) { loadPhoto(file); }
    photoInput.value = '';
  });

  matchSection.addEventListener('dragover', function (event) {
    event.preventDefault();
    dropzone.classList.add('is-over');
  });

  matchSection.addEventListener('dragleave', function (event) {
    if (!matchSection.contains(event.relatedTarget)) { dropzone.classList.remove('is-over'); }
  });

  matchSection.addEventListener('drop', function (event) {
    var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    event.preventDefault();
    dropzone.classList.remove('is-over');
    if (file) {
      loadPhoto(file);
    } else {
      showPhotoError('That was not a photo file. Save the picture to your device first, then drop it here or use the button.');
    }
  });

  photoStage.addEventListener('click', function (event) {
    var box;
    if (!photo.ready) { return; }
    if (event.detail === 0) {
      // Enter or Space carries no pointer position, so reuse the marker or start in the middle.
      pickAt(photo.hasMarker ? photo.markerX : photoCanvas.width / 2, photo.hasMarker ? photo.markerY : photoCanvas.height / 2);
      return;
    }
    box = photoCanvas.getBoundingClientRect();
    pickAt(
      (event.clientX - box.left) / box.width * photoCanvas.width,
      (event.clientY - box.top) / box.height * photoCanvas.height
    );
  });

  photoStage.addEventListener('keydown', function (event) {
    var move = Object.prototype.hasOwnProperty.call(KEY_MOVES, event.key) ? KEY_MOVES[event.key] : null;
    var stepSize;
    var startX;
    var startY;
    if (!move || !photo.ready) { return; }
    event.preventDefault();
    stepSize = Math.max(1, Math.round(Math.max(photoCanvas.width, photoCanvas.height) / KEY_MOVE_FRACTION));
    startX = photo.hasMarker ? photo.markerX : Math.round(photoCanvas.width / 2);
    startY = photo.hasMarker ? photo.markerY : Math.round(photoCanvas.height / 2);
    pickAt(startX + move[0] * stepSize, startY + move[1] * stepSize);
  });

  /* ---------- Start ---------- */

  renderFamilyFilter();
  renderGrid();
  selectShade((shadeFromUrl() || shades.all[0]).code);
  amco.project.onChange(syncSaved);
})();
