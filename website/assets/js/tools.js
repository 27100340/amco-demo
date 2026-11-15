/* Tools page: paint calculator, city guide, wall doctor and occasion countdown.
   Prices, coverage, cities and wall problems all come from AmcoData so the
   numbers live in one place. */
(function () {
  'use strict';

  var data = window.AmcoData;
  var shades = window.AmcoShades;
  var amco = window.Amco;
  if (!data || !shades || !amco) { return; }

  var escapeHtml = amco.escapeHtml;

  /* ---------- Constants ---------- */

  var DOOR_AREA_SQFT = 21;
  var WINDOW_AREA_SQFT = 15;
  var WASTAGE_RATE = 0.1;
  var MAX_ROOMS = 20;
  var MIN_ROOM_FT = 1;
  var MAX_ROOM_SIDE_FT = 100;
  var MAX_ROOM_HEIGHT_FT = 30;
  var MAX_OPENINGS = 20;
  var DEFAULT_ROOM = { length: 14, width: 12, height: 10, doors: 1, windows: 1, ceiling: false };
  var DEFAULT_COATS = 2;
  var DEFAULT_HOUSE_ID = '5-marla';
  var DEFAULT_WALL_PRODUCT_ID = 'aqueous-matt';
  var DEFAULT_EXTERIOR_PRODUCT_ID = 'weather-cover';
  var CEILING_PRODUCT_ID = 'smart-emulsion';
  var SEALER_ID = 'wall-primer';
  var PUTTY_ID = 'wall-putty';
  var SEALER_COATS = 1;
  var PUTTY_COATS = 2;
  var PREP_CATEGORY = 'prep';
  var EXTERIOR_CATEGORY = 'exterior';
  var PRODUCTS_PAGE = 'products.html';
  var DEFAULT_CITY_ID = 'lahore';
  var MISSING_SHADE = 'var(--line)';

  var ROOM_FIELDS = [
    { key: 'length', label: 'Length', unit: 'ft', min: MIN_ROOM_FT, max: MAX_ROOM_SIDE_FT, whole: false },
    { key: 'width', label: 'Width', unit: 'ft', min: MIN_ROOM_FT, max: MAX_ROOM_SIDE_FT, whole: false },
    { key: 'height', label: 'Height', unit: 'ft', min: MIN_ROOM_FT, max: MAX_ROOM_HEIGHT_FT, whole: false },
    { key: 'doors', label: 'Doors', unit: '', min: 0, max: MAX_OPENINGS, whole: true },
    { key: 'windows', label: 'Windows', unit: '', min: 0, max: MAX_OPENINGS, whole: true }
  ];

  var CONDITIONS = {
    repaint: {
      label: 'repaint in the same colour', sealer: false, putty: false,
      hint: 'No primer needed when the old paint is sound and you are keeping the colour.'
    },
    change: {
      label: 'colour change', sealer: true, putty: false,
      hint: 'Adds 1 coat of Smart Series Wall Primer so the old colour does not show through.'
    },
    fresh: {
      label: 'new plaster', sealer: true, putty: true,
      hint: 'Adds 1 coat of Smart Series Wall Primer on every surface and 2 coats of Cover Up Wall Filling Putty on interior walls and ceilings.'
    }
  };

  var CURE_DAYS = 5;
  var REST_WEEKDAY = 0;
  var MAX_PLAN_DAYS = 730;
  var MS_PER_DAY = 86400000;
  var SMALLEST_JOB_ID = 'rooms';
  var REPAIR_STEP = { key: 'repair', days: 4 };
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Eid dates are astronomical estimates; the real day follows the moon sighting.
  var OCCASIONS = {
    fitr: { name: 'Eid ul-Fitr', date: '2027-03-10', note: 'Expected date. It depends on moon sighting and can move by a day.' },
    adha: { name: 'Eid ul-Adha', date: '2027-05-17', note: 'Expected date. It depends on moon sighting and can move by a day.' },
    own: { name: 'your occasion', date: '', note: 'The house is dry, aired and ready for guests.' }
  };

  // Working days per stage. The totals are 3, 8, 12 and 18 days.
  var JOBS = {
    rooms: { label: '1 to 2 rooms', steps: [{ key: 'prepPrimer', days: 1 }, { key: 'firstCoat', days: 1 }, { key: 'secondCoat', days: 1 }] },
    marla5: { label: '5 marla house', steps: [{ key: 'prep', days: 2 }, { key: 'primer', days: 2 }, { key: 'firstCoat', days: 2 }, { key: 'secondCoat', days: 2 }] },
    marla10: { label: '10 marla house', steps: [{ key: 'prep', days: 3 }, { key: 'primer', days: 3 }, { key: 'firstCoat', days: 3 }, { key: 'secondCoat', days: 3 }] },
    kanal: { label: '1 kanal house', steps: [{ key: 'prep', days: 5 }, { key: 'primer', days: 4 }, { key: 'firstCoat', days: 4 }, { key: 'secondCoat', days: 5 }] }
  };

  var STEP_TEXT = {
    repair: { label: 'Putty and damp repair', detail: 'Fix leaks, treat damp, fill and level with putty, then leave it to dry.' },
    prep: { label: 'Prep', detail: 'Move furniture, cover floors, scrape loose paint, sand and fill small cracks.' },
    prepPrimer: { label: 'Prep and primer', detail: 'Cover floors, scrape, sand and fill, then one coat of primer the same day.' },
    primer: { label: 'Primer', detail: 'One coat of Smart Series Wall Primer so the finish dries even.' },
    firstCoat: { label: 'First coat', detail: 'Ceilings first, then walls. Leave it to dry overnight.' },
    secondCoat: { label: 'Second coat', detail: 'Second coat, then edges, doors and touch-ups.' },
    cure: { label: 'Curing and airing', detail: 'Keep the windows open. The paint hardens and the smell clears.' }
  };

  /* ---------- Small helpers ---------- */

  function byId(id) { return document.getElementById(id); }

  function findById(list, id) {
    return list.filter(function (item) { return item.id === id; })[0] || null;
  }

  function formatNumber(value, decimals) {
    return value.toLocaleString('en-PK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function plural(count, word) {
    return count + ' ' + word + (count === 1 ? '' : 's');
  }

  function joinList(items) {
    if (items.length < 2) { return items.join(''); }
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  function capitalise(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function shadeHex(code) {
    var shade = shades.get(code);
    return shade ? shade.hex : MISSING_SHADE;
  }

  function pressOnly(group, value) {
    Array.prototype.forEach.call(group.querySelectorAll('button[data-value]'), function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-value') === value));
    });
  }

  function bindChoice(group, onPick) {
    group.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-value]');
      if (!button || !group.contains(button)) { return; }
      var value = button.getAttribute('data-value');
      pressOnly(group, value);
      onPick(value);
    });
  }

  function isPutty(product) { return product.id === PUTTY_ID; }

  function priceText(product) {
    return amco.formatPkr(product.pricePerLitre) + ' per ' + (isPutty(product) ? 'kg' : 'litre');
  }

  function productLeafHtml(product, note) {
    return '<a class="leaf leaf-link" href="' + PRODUCTS_PAGE + '#' + escapeHtml(product.id) + '" style="--chip:' + shadeHex(product.chip) + '">' +
      '<span class="leaf-body">' +
        (note ? '<span class="tag">' + escapeHtml(note) + '</span>' : '') +
        '<strong class="leaf-name">' + escapeHtml(product.name) + '</strong>' +
        '<span class="small">' + escapeHtml(product.line) + '</span>' +
        '<span class="small muted num">' + escapeHtml(priceText(product)) + '</span>' +
      '</span>' +
    '</a>';
  }

  function pickButtonHtml(item, secondary) {
    return '<button class="pick" type="button" data-value="' + escapeHtml(item.id) + '" aria-pressed="false" style="--chip:' + shadeHex(item.chip) + '">' +
      '<span class="dot" aria-hidden="true"></span>' +
      '<span class="pick-text"><strong>' + escapeHtml(item.name) + '</strong>' +
        (secondary ? '<span class="small">' + escapeHtml(secondary) + '</span>' : '') +
      '</span>' +
      '<span class="urdu" lang="ur">' + escapeHtml(item.urdu) + '</span>' +
    '</button>';
  }

  function initPicker(list, items, buttonHtml, onPick, initialId) {
    list.innerHTML = items.map(buttonHtml).join('');
    bindChoice(list, onPick);
    pressOnly(list, initialId);
    onPick(initialId);
  }

  /* ---------- 1. Paint calculator ---------- */

  var calc = {
    mode: 'rooms',
    rooms: [],
    nextRoomId: 1,
    houseId: DEFAULT_HOUSE_ID,
    parts: { walls: true, ceilings: true, exterior: true },
    wallProductId: DEFAULT_WALL_PRODUCT_ID,
    exteriorProductId: DEFAULT_EXTERIOR_PRODUCT_ID,
    ceilingMatchesWalls: false,
    coats: DEFAULT_COATS,
    condition: 'repaint',
    wastage: true,
    estimate: null
  };

  var calcDom = {
    mode: byId('calc-mode'),
    roomsPane: byId('rooms-pane'),
    housePane: byId('house-pane'),
    roomList: byId('room-list'),
    addRoom: byId('add-room'),
    roomLimit: byId('room-limit'),
    houseSize: byId('house-size'),
    houseParts: byId('house-parts'),
    wallLabel: byId('wall-product-label'),
    wallProduct: byId('wall-product'),
    exteriorField: byId('exterior-field'),
    exteriorProduct: byId('exterior-product'),
    ceilingPaint: byId('ceiling-paint'),
    coats: byId('coats'),
    condition: byId('condition'),
    conditionHint: byId('condition-hint'),
    wastage: byId('wastage'),
    estimate: byId('estimate'),
    status: byId('estimate-status'),
    actions: byId('estimate-actions'),
    send: byId('send-estimate'),
    printDate: byId('estimate-date')
  };

  function fieldError(field, value) {
    var outOfRange = isNaN(value) || value < field.min || value > field.max;
    var notWhole = field.whole && Math.floor(value) !== value;
    if (!outOfRange && !notWhole) { return ''; }
    if (field.whole) { return field.label + ' must be a whole number from ' + field.min + ' to ' + field.max + '.'; }
    return field.label + ' must be between ' + field.min + ' and ' + field.max + ' ' + field.unit + '.';
  }

  function measureRoom(room) {
    var errors = [];
    var invalid = {};
    ROOM_FIELDS.forEach(function (field) {
      var message = fieldError(field, room[field.key]);
      if (message) {
        errors.push(message);
        invalid[field.key] = true;
      }
    });

    var measurable = errors.length === 0;
    var wallSqFt = 0;
    var ceilingSqFt = 0;
    if (measurable) {
      var grossWallSqFt = 2 * (room.length + room.width) * room.height;
      var openingsSqFt = room.doors * DOOR_AREA_SQFT + room.windows * WINDOW_AREA_SQFT;
      wallSqFt = Math.max(0, grossWallSqFt - openingsSqFt);
      ceilingSqFt = room.ceiling ? room.length * room.width : 0;
      if (openingsSqFt >= grossWallSqFt) {
        errors.push('The doors and windows cover more than the walls. Check the numbers.');
      }
    }
    return { measurable: measurable, errors: errors, invalid: invalid, wallSqFt: wallSqFt, ceilingSqFt: ceilingSqFt };
  }

  function addRoom() {
    var room = { id: calc.nextRoomId };
    Object.keys(DEFAULT_ROOM).forEach(function (key) { room[key] = DEFAULT_ROOM[key]; });
    calc.nextRoomId += 1;
    calc.rooms.push(room);
    return room;
  }

  function roomFieldHtml(room, field) {
    var inputId = 'room-' + room.id + '-' + field.key;
    var value = isNaN(room[field.key]) ? '' : room[field.key];
    var input = '<input class="input" type="number" id="' + inputId + '" data-field="' + field.key + '"' +
      ' inputmode="' + (field.whole ? 'numeric' : 'decimal') + '" step="' + (field.whole ? '1' : 'any') + '"' +
      ' min="' + field.min + '" max="' + field.max + '" value="' + value + '">';
    return '<div class="field"><label for="' + inputId + '">' + field.label + '</label>' +
      (field.unit ? '<div class="input-unit">' + input + '<span>' + field.unit + '</span></div>' : input) +
    '</div>';
  }

  function roomHtml(room, index) {
    var roomNumber = index + 1;
    return '<li class="room" data-room-id="' + room.id + '">' +
      '<div class="row row-between">' +
        '<h4>Room ' + roomNumber + '</h4>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-remove-room>Remove room ' + roomNumber + '</button>' +
      '</div>' +
      '<div class="grid room-fields">' +
        ROOM_FIELDS.map(function (field) { return roomFieldHtml(room, field); }).join('') +
      '</div>' +
      '<label class="check"><input type="checkbox" data-field="ceiling"' + (room.ceiling ? ' checked' : '') + '><span>Include the ceiling</span></label>' +
      '<p class="small num" data-room-area></p>' +
      '<p class="small field-error" data-room-error hidden></p>' +
    '</li>';
  }

  function refreshRoom(item, room) {
    var measured = measureRoom(room);
    var areaText = 'Not counted yet.';
    if (measured.measurable) {
      areaText = 'Walls ' + formatNumber(measured.wallSqFt, 0) + ' sq ft' +
        (room.ceiling ? ', ceiling ' + formatNumber(measured.ceilingSqFt, 0) + ' sq ft' : '');
    }
    item.querySelector('[data-room-area]').textContent = areaText;

    var error = item.querySelector('[data-room-error]');
    error.textContent = measured.errors.join(' ');
    error.hidden = measured.errors.length === 0;

    Array.prototype.forEach.call(item.querySelectorAll('input[type="number"]'), function (input) {
      input.setAttribute('aria-invalid', String(Boolean(measured.invalid[input.getAttribute('data-field')])));
    });
  }

  function renderRooms() {
    calcDom.roomList.innerHTML = calc.rooms.map(roomHtml).join('');
    Array.prototype.forEach.call(calcDom.roomList.children, function (item, index) {
      refreshRoom(item, calc.rooms[index]);
    });
    var full = calc.rooms.length >= MAX_ROOMS;
    calcDom.addRoom.disabled = full;
    calcDom.addRoom.textContent = calc.rooms.length ? 'Add another room' : 'Add a room';
    calcDom.roomLimit.hidden = !full;
  }

  function collectSurfaces() {
    if (calc.mode === 'house') {
      var house = findById(data.houses, calc.houseId);
      return {
        walls: calc.parts.walls ? house.walls : 0,
        ceilings: calc.parts.ceilings ? house.ceilings : 0,
        exterior: calc.parts.exterior ? house.exterior : 0,
        scope: house.label + ' house'
      };
    }

    var surfaces = { walls: 0, ceilings: 0, exterior: 0, scope: '' };
    var roomsCounted = 0;
    calc.rooms.forEach(function (room) {
      var measured = measureRoom(room);
      surfaces.walls += measured.wallSqFt;
      surfaces.ceilings += measured.ceilingSqFt;
      if (measured.wallSqFt + measured.ceilingSqFt > 0) { roomsCounted += 1; }
    });
    surfaces.scope = plural(roomsCounted, 'room');
    return surfaces;
  }

  // Turn a quantity into what the customer actually carries home and pays for.
  function priceLine(line) {
    if (isPutty(line.product)) {
      line.unit = 'kg';
      line.bought = Math.ceil(line.quantity);
      line.buyText = formatNumber(line.bought, 0) + ' kg';
    } else {
      var packs = data.packsFor(line.quantity);
      line.unit = 'L';
      line.bought = packs.reduce(function (sum, row) { return sum + row.count * row.pack.litres; }, 0);
      line.buyText = joinList(packs.map(function (row) { return plural(row.count, row.pack.label.toLowerCase()); }));
    }
    line.cost = line.bought * line.product.pricePerLitre;
  }

  function buildEstimate() {
    var surfaces = collectSurfaces();
    var condition = CONDITIONS[calc.condition];
    var interiorSqFt = surfaces.walls + surfaces.ceilings;
    var paintedSqFt = interiorSqFt + surfaces.exterior;
    var wastageFactor = calc.wastage ? 1 + WASTAGE_RATE : 1;

    var jobs = [
      { productId: calc.wallProductId, sqFt: surfaces.walls, coats: calc.coats, use: calc.mode === 'house' ? 'interior walls' : 'walls' },
      { productId: calc.ceilingMatchesWalls ? calc.wallProductId : CEILING_PRODUCT_ID, sqFt: surfaces.ceilings, coats: calc.coats, use: 'ceilings' },
      { productId: calc.exteriorProductId, sqFt: surfaces.exterior, coats: calc.coats, use: 'exterior walls' }
    ];
    if (condition.sealer) { jobs.push({ productId: SEALER_ID, sqFt: paintedSqFt, coats: SEALER_COATS, use: 'primer' }); }
    if (condition.putty) { jobs.push({ productId: PUTTY_ID, sqFt: interiorSqFt, coats: PUTTY_COATS, use: 'putty' }); }

    var lines = [];
    var lineByProduct = {};
    jobs.forEach(function (job) {
      var product = data.product(job.productId);
      if (!product || job.sqFt <= 0) { return; }
      var line = lineByProduct[product.id];
      if (!line) {
        line = { product: product, sqFt: 0, quantity: 0, coats: job.coats, uses: [] };
        lineByProduct[product.id] = line;
        lines.push(line);
      }
      line.sqFt += job.sqFt;
      line.quantity += job.sqFt / data.SQFT_PER_SQM * job.coats / product.coverage * wastageFactor;
      line.uses.push(job.use);
    });
    lines.forEach(priceLine);

    var estimate = { lines: lines, litres: 0, puttyKg: 0, cost: 0, paintedSqFt: paintedSqFt, scope: surfaces.scope, usesSealer: false };
    lines.forEach(function (line) {
      estimate.cost += line.cost;
      if (isPutty(line.product)) { estimate.puttyKg += line.bought; } else { estimate.litres += line.quantity; }
      if (line.product.id === SEALER_ID) { estimate.usesSealer = true; }
    });
    return estimate;
  }

  function describeJob(estimate) {
    return formatNumber(estimate.paintedSqFt, 0) + ' sq ft (' + estimate.scope + '), ' +
      plural(calc.coats, 'coat') + ', ' + CONDITIONS[calc.condition].label + ', ' +
      (calc.wastage ? Math.round(WASTAGE_RATE * 100) + '% wastage included' : 'no wastage allowance');
  }

  function buyPhrase(line) {
    return line.buyText + ' of ' + line.product.name;
  }

  function estimateSummary(estimate) {
    return 'About ' + formatNumber(estimate.litres, 1) + ' litres' +
      (estimate.puttyKg ? ' plus ' + formatNumber(estimate.puttyKg, 0) + ' kg of putty' : '') +
      ' for ' + describeJob(estimate) + ': ' + estimate.lines.map(buyPhrase).join('; ') +
      ', around ' + amco.formatPkr(estimate.cost) + ' at indicative retail prices before labour.';
  }

  function estimateMessage(estimate) {
    var message = ['Assalam o alaikum, I worked out this estimate on the Amco Paints website:', '', 'Job: ' + describeJob(estimate), ''];
    estimate.lines.forEach(function (line) {
      message.push('- ' + line.product.name + ': ' + line.buyText + ', ' + amco.formatPkr(line.cost));
    });
    message.push('', 'Total: ' + amco.formatPkr(estimate.cost) + ' (indicative retail price, labour not included)');
    message.push('', 'Please confirm the price and the nearest dealer.');
    return message.join('\n');
  }

  function emptyEstimateMessage() {
    if (calc.mode === 'house') { return 'Tick at least one part of the house and your estimate will appear here.'; }
    if (!calc.rooms.length) { return 'Add a room and your estimate will appear here.'; }
    return 'Correct the measurements marked in red and your estimate will appear here.';
  }

  function estimateRowHtml(line) {
    return '<tr>' +
      '<td><strong>' + escapeHtml(line.product.name) + '</strong><br>' +
        '<span class="muted">' + escapeHtml(capitalise(joinList(line.uses)) + ', ' + plural(line.coats, 'coat')) + '</span></td>' +
      '<td class="num">' + formatNumber(line.sqFt, 0) + ' sq ft</td>' +
      '<td class="num">' + formatNumber(line.quantity, 1) + ' ' + line.unit + '</td>' +
      '<td>' + escapeHtml(line.buyText) + '</td>' +
      '<td class="num">' + escapeHtml(amco.formatPkr(line.cost)) + '</td>' +
    '</tr>';
  }

  function estimateHtml(estimate) {
    var contents = (estimate.usesSealer ? 'Paint and sealer for ' : 'Paint for ') + describeJob(estimate) + '.' +
      (estimate.puttyKg ? ' You also need ' + formatNumber(estimate.puttyKg, 0) + ' kg of putty.' : '');
    return '<div>' +
        '<p class="muted">You need about</p>' +
        '<p class="result-figure">' + formatNumber(estimate.litres, 1) + ' litres</p>' +
      '</div>' +
      '<p class="muted">' + escapeHtml(contents) + '</p>' +
      '<ul class="buy-list">' +
        estimate.lines.map(function (line) { return '<li>Buy ' + escapeHtml(buyPhrase(line)) + '.</li>'; }).join('') +
      '</ul>' +
      '<div class="table-scroll"><table class="table estimate-table">' +
        '<thead><tr><th scope="col">Product</th><th scope="col" class="num">Area</th><th scope="col" class="num">Needed</th><th scope="col">Buy</th><th scope="col" class="num">Cost</th></tr></thead>' +
        '<tbody>' + estimate.lines.map(estimateRowHtml).join('') + '</tbody>' +
        '<tfoot><tr><th scope="row" colspan="4">Total for materials</th><td class="num">' + escapeHtml(amco.formatPkr(estimate.cost)) + '</td></tr></tfoot>' +
      '</table></div>';
  }

  function renderEstimate() {
    var estimate = buildEstimate();
    var hasEstimate = estimate.lines.length > 0;
    calc.estimate = hasEstimate ? estimate : null;
    calcDom.actions.hidden = !hasEstimate;

    if (!hasEstimate) {
      calcDom.estimate.innerHTML = '<h3>Nothing to work out yet</h3><p class="muted">' + escapeHtml(emptyEstimateMessage()) + '</p>';
      calcDom.status.textContent = 'No estimate yet.';
      return;
    }

    calcDom.estimate.innerHTML = estimateHtml(estimate);
    calcDom.send.href = amco.whatsappLink(estimateMessage(estimate));
    calcDom.status.textContent = 'About ' + formatNumber(estimate.litres, 1) + ' litres, ' + amco.formatPkr(estimate.cost) + ' for materials.';
  }

  function syncMode() {
    var wholeHouse = calc.mode === 'house';
    calcDom.roomsPane.hidden = wholeHouse;
    calcDom.housePane.hidden = !wholeHouse;
    calcDom.exteriorField.hidden = !wholeHouse;
    calcDom.wallLabel.textContent = wholeHouse ? 'Paint for interior walls' : 'Paint for the walls';
  }

  function renderHouseAreas() {
    var house = findById(data.houses, calc.houseId);
    Array.prototype.forEach.call(calcDom.houseParts.querySelectorAll('[data-part-area]'), function (label) {
      label.textContent = 'about ' + formatNumber(house[label.getAttribute('data-part-area')], 0) + ' sq ft';
    });
  }

  function productOptionsHtml(includeCategory) {
    return data.categories.filter(includeCategory).map(function (category) {
      var options = data.products
        .filter(function (product) { return product.category === category.id; })
        .map(function (product) {
          return '<option value="' + escapeHtml(product.id) + '">' + escapeHtml(product.name + ', ' + priceText(product)) + '</option>';
        })
        .join('');
      return options ? '<optgroup label="' + escapeHtml(category.name) + '">' + options + '</optgroup>' : '';
    }).join('');
  }

  function requestedProduct() {
    var match = /[?&]product=([^&#]+)/.exec(window.location.search);
    if (!match) { return null; }
    var productId;
    try {
      productId = decodeURIComponent(match[1]);
    } catch (error) {
      // A badly encoded link is treated the same as no product in the link.
      return null;
    }
    var product = data.product(productId);
    return product && product.id === productId ? product : null;
  }

  // tools.html?product=<id> arrives from product pages. Primers and putty are
  // added through the wall condition, so they switch that on instead.
  function applyRequestedProduct() {
    var product = requestedProduct();
    if (!product) { return; }
    if (isPutty(product)) { calc.condition = 'fresh'; return; }
    if (product.category === PREP_CATEGORY) { calc.condition = 'change'; return; }
    calc.wallProductId = product.id;
    if (product.category === EXTERIOR_CATEGORY) { calc.exteriorProductId = product.id; }
  }

  function onRoomEdit(event) {
    var input = event.target;
    var item = input.closest('[data-room-id]');
    var key = input.getAttribute('data-field');
    if (!item || !key) { return; }
    var room = findById(calc.rooms, Number(item.getAttribute('data-room-id')));
    if (!room) { return; }
    room[key] = input.type === 'checkbox' ? input.checked : parseFloat(input.value);
    refreshRoom(item, room);
    renderEstimate();
  }

  function onRoomListClick(event) {
    var button = event.target.closest('[data-remove-room]');
    if (!button) { return; }
    var roomId = Number(button.closest('[data-room-id]').getAttribute('data-room-id'));
    calc.rooms = calc.rooms.filter(function (room) { return room.id !== roomId; });
    renderRooms();
    renderEstimate();
    calcDom.addRoom.focus();
  }

  function onAddRoom() {
    if (calc.rooms.length >= MAX_ROOMS) { return; }
    var room = addRoom();
    renderRooms();
    renderEstimate();
    byId('room-' + room.id + '-' + ROOM_FIELDS[0].key).focus();
  }

  function initCalculator() {
    applyRequestedProduct();

    calcDom.houseSize.innerHTML = data.houses.map(function (house) {
      return '<button type="button" data-value="' + escapeHtml(house.id) + '" aria-pressed="false">' + escapeHtml(house.label) + '</button>';
    }).join('');
    pressOnly(calcDom.houseSize, calc.houseId);

    calcDom.wallProduct.innerHTML = productOptionsHtml(function (category) { return category.id !== PREP_CATEGORY; });
    calcDom.exteriorProduct.innerHTML = productOptionsHtml(function (category) { return category.id === EXTERIOR_CATEGORY; });
    calcDom.wallProduct.value = calc.wallProductId;
    calcDom.exteriorProduct.value = calc.exteriorProductId;

    var ceilingProduct = data.product(CEILING_PRODUCT_ID);
    if (ceilingProduct) { calcDom.ceilingPaint.querySelector('[data-value="standard"]').textContent = ceilingProduct.name; }

    pressOnly(calcDom.condition, calc.condition);
    calcDom.conditionHint.textContent = CONDITIONS[calc.condition].hint;

    bindChoice(calcDom.mode, function (mode) {
      calc.mode = mode;
      syncMode();
      renderEstimate();
    });
    bindChoice(calcDom.houseSize, function (houseId) {
      calc.houseId = houseId;
      renderHouseAreas();
      renderEstimate();
    });
    bindChoice(calcDom.ceilingPaint, function (choice) {
      calc.ceilingMatchesWalls = choice === 'walls';
      renderEstimate();
    });
    bindChoice(calcDom.coats, function (coats) {
      calc.coats = Number(coats);
      renderEstimate();
    });
    bindChoice(calcDom.condition, function (condition) {
      calc.condition = condition;
      calcDom.conditionHint.textContent = CONDITIONS[condition].hint;
      renderEstimate();
    });

    calcDom.houseParts.addEventListener('change', function (event) {
      var part = event.target.getAttribute('data-part');
      if (!part) { return; }
      calc.parts[part] = event.target.checked;
      renderEstimate();
    });
    calcDom.wallProduct.addEventListener('change', function () {
      calc.wallProductId = calcDom.wallProduct.value;
      renderEstimate();
    });
    calcDom.exteriorProduct.addEventListener('change', function () {
      calc.exteriorProductId = calcDom.exteriorProduct.value;
      renderEstimate();
    });
    calcDom.wastage.addEventListener('change', function () {
      calc.wastage = calcDom.wastage.checked;
      renderEstimate();
    });

    calcDom.roomList.addEventListener('input', onRoomEdit);
    calcDom.roomList.addEventListener('change', onRoomEdit);
    calcDom.roomList.addEventListener('click', onRoomListClick);
    calcDom.addRoom.addEventListener('click', onAddRoom);

    byId('save-estimate').addEventListener('click', function () {
      if (!calc.estimate) { return; }
      amco.project.setEstimate({ summary: estimateSummary(calc.estimate) });
      amco.toast('Estimate saved. Open My project to send it to a dealer.');
    });
    byId('print-estimate').addEventListener('click', function () {
      calcDom.printDate.textContent = 'Amco Paints estimate, prepared on ' + formatDate(startOfDay(new Date())) + '.';
      window.print();
    });

    addRoom();
    renderRooms();
    renderHouseAreas();
    syncMode();
    renderEstimate();
  }

  /* ---------- 2. Paint for your city ---------- */

  function coatNote(product) {
    return (product.category === PREP_CATEGORY ? 'Primer, ' : 'Finish, ') + plural(product.coats, 'coat');
  }

  function systemHtml(system) {
    var products = [].concat(system.productIds)
      .map(function (productId) { return data.product(productId); })
      .filter(Boolean);
    return '<div class="stack stack-sm">' +
      '<h4>' + escapeHtml(system.label) + '</h4>' +
      '<ol class="list-plain grid system-list">' +
        products.map(function (product) { return '<li>' + productLeafHtml(product, coatNote(product)) + '</li>'; }).join('') +
      '</ol>' +
    '</div>';
  }

  function cityDetailHtml(city) {
    var systems = [
      { label: 'Exterior walls', productIds: city.exterior },
      { label: 'Interior walls', productIds: city.interior },
      { label: 'Gates, grills and doors', productIds: city.metal }
    ];
    return '<div class="city-head stack">' +
        '<h3>' + escapeHtml(city.name) + '</h3>' +
        '<p class="urdu" lang="ur">' + escapeHtml(city.urdu) + '</p>' +
        '<p>' + escapeHtml(city.climate) + '</p>' +
        '<p><span class="chip-tab">Best months to paint: ' + escapeHtml(city.window) + '</span></p>' +
      '</div>' +
      '<div class="split">' +
        '<div class="panel stack">' +
          '<h4>What the weather does to paint here</h4>' +
          '<ul class="plain-bullets">' +
            city.stresses.map(function (stress) { return '<li>' + escapeHtml(stress) + '</li>'; }).join('') +
          '</ul>' +
          '<p class="note">' + escapeHtml(city.tip) + '</p>' +
        '</div>' +
        '<div class="stack stack-lg">' +
          '<h3>The system we recommend</h3>' +
          systems.map(systemHtml).join('') +
        '</div>' +
      '</div>';
  }

  function initCityGuide() {
    var section = byId('city');
    var detail = byId('city-detail');

    function showCity(cityId) {
      var city = findById(data.cities, cityId);
      if (!city) { return; }
      var shade = shades.get(city.chip);
      if (shade) {
        section.style.setProperty('--wall', shade.hex);
        section.style.setProperty('--wall-ink', shade.ink);
      }
      detail.innerHTML = cityDetailHtml(city);
    }

    initPicker(byId('city-list'), data.cities, function (city) { return pickButtonHtml(city, ''); }, showCity, DEFAULT_CITY_ID);
  }

  /* ---------- 3. Wall doctor ---------- */

  function problemDetailHtml(problem) {
    var message = 'Assalam o alaikum, my wall problem is: ' + problem.name + ' (' + problem.local + '). ' +
      'I am sending a photo. Please tell me how to fix it.';
    var products = problem.products
      .map(function (productId) { return data.product(productId); })
      .filter(Boolean);
    return '<div class="split">' +
      '<div class="stack">' +
        '<h3>' + escapeHtml(problem.name) + '</h3>' +
        '<p class="muted problem-local">' + escapeHtml(problem.local) + '<span class="urdu" lang="ur">' + escapeHtml(problem.urdu) + '</span></p>' +
        '<h4>What it looks like</h4>' +
        '<p>' + escapeHtml(problem.looks) + '</p>' +
        '<h4>Why it happens</h4>' +
        '<p>' + escapeHtml(problem.cause) + '</p>' +
        '<p><span class="tag">Allow about ' + escapeHtml(plural(problem.days, 'day')) + '</span></p>' +
        '<p class="small muted">That includes drying time between the steps.</p>' +
        '<p><a class="btn btn-wa" target="_blank" rel="noopener" href="' + escapeHtml(amco.whatsappLink(message)) + '">Send a photo of your wall to Amco</a></p>' +
      '</div>' +
      '<div class="stack stack-lg">' +
        '<div class="panel stack">' +
          '<h4>How to fix it</h4>' +
          '<ol class="steps">' +
            problem.steps.map(function (step) { return '<li>' + escapeHtml(step) + '</li>'; }).join('') +
          '</ol>' +
        '</div>' +
        '<div class="stack">' +
          '<h4>What you will need</h4>' +
          '<ul class="list-plain grid system-list">' +
            products.map(function (product) { return '<li>' + productLeafHtml(product, '') + '</li>'; }).join('') +
          '</ul>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function initWallDoctor() {
    var detail = byId('problem-detail');

    function showProblem(problemId) {
      var problem = findById(data.problems, problemId);
      if (problem) { detail.innerHTML = problemDetailHtml(problem); }
    }

    initPicker(byId('problem-list'), data.problems, function (problem) { return pickButtonHtml(problem, problem.local); }, showProblem, data.problems[0].id);
  }

  /* ---------- 4. Eid and shaadi countdown ---------- */

  var countdown = { occasion: 'fitr', jobId: SMALLEST_JOB_ID, repair: false };

  var countdownDom = {
    occasion: byId('occasion'),
    occasionHint: byId('occasion-hint'),
    customField: byId('custom-date-field'),
    customDate: byId('custom-date'),
    customError: byId('custom-date-error'),
    jobSize: byId('job-size'),
    jobHint: byId('job-hint'),
    repair: byId('needs-repair'),
    output: byId('countdown-output')
  };

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, count) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
  }

  function daysBetween(from, to) {
    var fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    var toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((toUtc - fromUtc) / MS_PER_DAY);
  }

  function parseIsoDate(text) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) { return null; }
    var monthIndex = Number(match[2]) - 1;
    var date = new Date(Number(match[1]), monthIndex, Number(match[3]));
    return date.getMonth() === monthIndex ? date : null;
  }

  function toIsoDate(date) {
    function pad(value) { return (value < 10 ? '0' : '') + value; }
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function formatDayMonth(date) {
    return DAY_NAMES[date.getDay()] + ' ' + date.getDate() + ' ' + MONTH_NAMES[date.getMonth()];
  }

  function formatDate(date) {
    return formatDayMonth(date) + ' ' + date.getFullYear();
  }

  function formatRange(start, end) {
    if (daysBetween(start, end) === 0) { return formatDate(end); }
    var first = start.getFullYear() === end.getFullYear() ? formatDayMonth(start) : formatDate(start);
    return first + ' to ' + formatDate(end);
  }

  function previousWorkingDay(date) {
    var day = date;
    while (day.getDay() === REST_WEEKDAY) { day = addDays(day, -1); }
    return day;
  }

  function totalDays(steps) {
    return steps.reduce(function (sum, step) { return sum + step.days; }, 0);
  }

  // Walk back from the occasion: curing first, then each stage in reverse.
  function planSchedule(occasionDate, steps) {
    var rows = [];
    var cursor = addDays(occasionDate, -CURE_DAYS);
    for (var index = steps.length - 1; index >= 0; index -= 1) {
      var end = previousWorkingDay(cursor);
      var start = end;
      for (var worked = 1; worked < steps[index].days; worked += 1) {
        start = previousWorkingDay(addDays(start, -1));
      }
      rows.unshift({ key: steps[index].key, start: start, end: end });
      cursor = addDays(start, -1);
    }
    var finishDate = rows[rows.length - 1].end;
    rows.push({ key: 'cure', start: addDays(finishDate, 1), end: addDays(occasionDate, -1) });
    return { rows: rows, startDate: rows[0].start, finishDate: finishDate };
  }

  function selectedOccasionDate() {
    var occasion = OCCASIONS[countdown.occasion];
    return parseIsoDate(occasion.date || countdownDom.customDate.value);
  }

  function dateProblem(date, today) {
    if (!date) { return 'Pick your date and the schedule will appear here.'; }
    var daysAway = daysBetween(today, date);
    if (daysAway <= 0) { return 'That date has already passed. Choose another occasion or enter a later date.'; }
    if (daysAway > MAX_PLAN_DAYS) { return 'That is more than two years away. Pick a closer date and plan again nearer the time.'; }
    return '';
  }

  function selectedSteps() {
    return (countdown.repair ? [REPAIR_STEP] : []).concat(JOBS[countdown.jobId].steps);
  }

  function startDistanceText(daysToStart) {
    if (daysToStart < 0) { return 'That was ' + plural(-daysToStart, 'day') + ' ago.'; }
    if (daysToStart === 0) { return 'That is today. Book your painter now.'; }
    if (daysToStart === 1) { return 'That is tomorrow. Book your painter today.'; }
    return 'That is ' + plural(daysToStart, 'day') + ' from today.';
  }

  function lateAdviceHtml(occasionDate, today) {
    var occasion = OCCASIONS[countdown.occasion];
    var smallestJob = JOBS[SMALLEST_JOB_ID];
    var smallestPlan = planSchedule(occasionDate, smallestJob.steps);
    var smallestFits = daysBetween(today, smallestPlan.startDate) >= 0;
    var advice = smallestFits
      ? 'A smaller job still fits: ' + smallestJob.label + ' with no repairs can start as late as ' + formatDate(smallestPlan.startDate) + '.'
      : 'Even ' + smallestJob.label + ' would be rushed now.';
    var message = 'Assalam o alaikum, I need painting finished before ' + formatDate(occasionDate) +
      ' (' + JOBS[countdown.jobId].label + '). Can Amco arrange a fast crew?';
    return '<div class="note stack stack-sm">' +
      '<p><strong>This job no longer fits before ' + escapeHtml(occasion.name) + '.</strong></p>' +
      '<p>' + escapeHtml(advice + ' Or message Amco and ask for a fast crew with extra painters.') + '</p>' +
      '<p><a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="' + escapeHtml(amco.whatsappLink(message)) + '">Ask Amco for a fast crew</a></p>' +
    '</div>';
  }

  function scheduleRowHtml(dateText, label, detail) {
    return '<li>' +
      '<span class="schedule-date num">' + escapeHtml(dateText) + '</span>' +
      '<span><strong>' + escapeHtml(label) + '</strong><br><span class="small muted">' + escapeHtml(detail) + '</span></span>' +
    '</li>';
  }

  function scheduleHtml(occasionDate, today) {
    var occasion = OCCASIONS[countdown.occasion];
    var steps = selectedSteps();
    var plan = planSchedule(occasionDate, steps);
    var daysToStart = daysBetween(today, plan.startDate);
    var late = daysToStart < 0;

    var rows = plan.rows.map(function (row) {
      return scheduleRowHtml(formatRange(row.start, row.end), STEP_TEXT[row.key].label, STEP_TEXT[row.key].detail);
    });
    rows.push(scheduleRowHtml(formatDate(occasionDate), capitalise(occasion.name), occasion.note));

    return '<div class="result stack" data-state="' + (late ? 'late' : 'ok') + '">' +
        '<div>' +
          '<p class="muted">' + (late ? 'The painters needed to start by' : 'The painters must start by') + '</p>' +
          '<p class="result-figure">' + escapeHtml(formatDate(plan.startDate)) + '</p>' +
        '</div>' +
        '<p>' + escapeHtml(startDistanceText(daysToStart) + ' ' + capitalise(occasion.name) + ' is ' + plural(daysBetween(today, occasionDate), 'day') + ' away.') + '</p>' +
        '<p class="muted">' + escapeHtml(plural(totalDays(steps), 'working day') + ' on site, finished by ' + formatDate(plan.finishDate) +
          ', then ' + CURE_DAYS + ' days for the paint to cure and the smell to clear. Sundays are counted as a day off.') + '</p>' +
      '</div>' +
      '<div class="panel stack">' +
        (late ? lateAdviceHtml(occasionDate, today) : '') +
        '<h3>Your schedule</h3>' +
        '<ol class="schedule" role="list">' + rows.join('') + '</ol>' +
      '</div>';
  }

  function renderCountdown() {
    var today = startOfDay(new Date());
    var usesOwnDate = countdown.occasion === 'own';
    var occasionDate = selectedOccasionDate();
    var problem = dateProblem(occasionDate, today);
    var showFieldError = usesOwnDate && Boolean(problem) && countdownDom.customDate.value !== '';

    countdownDom.customField.hidden = !usesOwnDate;
    countdownDom.customError.textContent = showFieldError ? problem : '';
    countdownDom.customError.hidden = !showFieldError;
    countdownDom.customDate.setAttribute('aria-invalid', String(showFieldError));

    countdownDom.occasionHint.hidden = usesOwnDate || !occasionDate;
    if (!usesOwnDate && occasionDate) { countdownDom.occasionHint.textContent = 'Expected on ' + formatDate(occasionDate) + '.'; }

    countdownDom.jobHint.textContent = 'About ' + plural(totalDays(JOBS[countdown.jobId].steps), 'working day') + ' of painting' +
      (countdown.repair ? ', plus ' + REPAIR_STEP.days + ' days for putty or damp repair.' : '.');

    countdownDom.output.innerHTML = problem
      ? '<div class="panel stack"><h3>No schedule yet</h3><p>' + escapeHtml(problem) + '</p></div>'
      : scheduleHtml(occasionDate, today);
  }

  function initCountdown() {
    var today = startOfDay(new Date());
    countdownDom.customDate.min = toIsoDate(addDays(today, 1));
    countdownDom.customDate.max = toIsoDate(addDays(today, MAX_PLAN_DAYS));

    bindChoice(countdownDom.occasion, function (occasion) {
      countdown.occasion = occasion;
      renderCountdown();
    });
    bindChoice(countdownDom.jobSize, function (jobId) {
      countdown.jobId = jobId;
      renderCountdown();
    });
    countdownDom.customDate.addEventListener('input', renderCountdown);
    countdownDom.customDate.addEventListener('change', renderCountdown);
    countdownDom.repair.addEventListener('change', function () {
      countdown.repair = countdownDom.repair.checked;
      renderCountdown();
    });

    renderCountdown();
  }

  /* ---------- Start ---------- */

  // The sections above the target grow once they render, so re-anchor deep links.
  function scrollToHashTarget() {
    var targetId = window.location.hash.slice(1);
    var target = targetId ? byId(targetId) : null;
    if (target) { target.scrollIntoView(); }
  }

  initCalculator();
  initCityGuide();
  initWallDoctor();
  initCountdown();
  scrollToHashTarget();
})();
