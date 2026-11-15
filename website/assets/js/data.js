/* Amco product, city and problem data for the MVP.
   Product names follow Amco's Cover Up Splendid Range and Smart Series.
   Prices, coverage figures and dealer rows are working placeholders, and the
   two "Proposed product" entries do not exist yet: confirm all of them with
   Amco's real price list and dealer register before launch. */
(function () {
  'use strict';

  // Tin sizes sold in Pakistan.
  var PACKS = [
    { id: 'drum', label: 'Drum', litres: 14.56 },
    { id: 'gallon', label: 'Gallon', litres: 3.64 },
    { id: 'quarter', label: 'Quarter', litres: 0.91 }
  ];

  var CATEGORIES = [
    { id: 'interior', name: 'Interior walls' },
    { id: 'exterior', name: 'Exterior walls' },
    { id: 'enamel', name: 'Wood and metal' },
    { id: 'prep', name: 'Primers and putty' },
    { id: 'protect', name: 'Damp and heat protection (proposed)' }
  ];

  // coverage = square metres per litre, per coat, on a primed smooth wall.
  var PRODUCTS = [
    {
      id: 'aqueous-matt', name: 'Cover Up Aqueous Matt', category: 'interior', tier: 'Best', finish: 'Matt',
      pricePerLitre: 1180, coverage: 12, coats: 2, washable: 5,
      line: 'Water-based flawless matt finish for drawing rooms and bedrooms.',
      points: ['Wipes clean: tea, crayon and fingerprints', 'Water based and low odour, so the room is usable the same night', 'Hides hairline plaster marks'],
      chip: 'AM-5006'
    },
    {
      id: 'plastic-emulsion', name: 'Cover Up Plastic Emulsion', category: 'interior', tier: 'Better', finish: 'Matt',
      pricePerLitre: 990, coverage: 12, coats: 2, washable: 4,
      line: '100% acrylic interior emulsion with a smooth, even finish.',
      points: ['Acrylic film stands up to regular wiping', 'Good for kitchens, corridors and children\'s rooms', 'Available in the full shade card'],
      chip: 'AM-4007'
    },
    {
      id: 'special-emulsion', name: 'Cover Up Special Emulsion', category: 'interior', tier: 'Good', finish: 'Matt',
      pricePerLitre: 760, coverage: 11, coats: 2, washable: 3,
      line: 'The everyday anti-fungal emulsion for whole-house repaints.',
      points: ['Anti-fungal for humid rooms', 'Semi-washable: wipes with a damp cloth', 'Good coverage per drum'],
      chip: 'AM-1004'
    },
    {
      id: 'smart-emulsion', name: 'Smart Super Emulsion', category: 'interior', tier: 'Economy', finish: 'Flat',
      pricePerLitre: 430, coverage: 9, coats: 2, washable: 1,
      line: 'Smart Series budget finish for ceilings, rentals and stores.',
      points: ['Lowest cost per square foot', 'Bright flat finish for ceilings', 'Not washable: keep it away from kitchens'],
      chip: 'AM-1001'
    },
    {
      id: 'weather-cover', name: 'Cover Up Weather Cover', category: 'exterior', tier: 'Best', finish: 'Flat',
      pricePerLitre: 2350, coverage: 10, coats: 2, washable: 5,
      line: '100% acrylic exterior paint built for monsoon, heat and smog.',
      points: ['Sheds rain and resists algae streaks', 'Colour that holds on south and west walls', 'Flexible film that bridges hairline cracks'],
      chip: 'AM-2005'
    },
    {
      id: 'weather-coat', name: 'Smart Series Weather Coat', category: 'exterior', tier: 'Good', finish: 'Matt',
      pricePerLitre: 1450, coverage: 10, coats: 2, washable: 3,
      line: 'Dependable exterior coat for boundary walls and shaded sides.',
      points: ['Good value on large boundary walls', 'Dust-resistant matt film', 'Pairs with Smart Series Wall Primer'],
      chip: 'AM-7006'
    },
    {
      id: 'synthetic-enamel', name: 'Cover Up Synthetic Enamel', category: 'enamel', tier: 'Best', finish: 'Gloss',
      pricePerLitre: 1320, coverage: 13, coats: 2, washable: 5,
      line: 'Alkyd gloss enamel for doors, grills and gates.',
      points: ['High gloss that holds through summer', 'Tough film for gates and window grills', 'For wood and metal'],
      chip: 'AM-7008'
    },
    {
      id: 'matt-enamel', name: 'Cover Up Matt Finish Enamel', category: 'enamel', tier: 'Better', finish: 'Matt',
      pricePerLitre: 1260, coverage: 12, coats: 2, washable: 5,
      line: 'Enamel toughness with a flat, modern look for walls and woodwork.',
      points: ['Stands up to scrubbing in kitchens', 'No glare on uneven walls', 'For interior walls, wood and metal'],
      chip: 'AM-6002'
    },
    {
      id: 'timber-cover', name: 'Cover Up Timber Cover', category: 'enamel', tier: 'Wood lacquer', finish: 'Wood lacquer',
      pricePerLitre: 1480, coverage: 10, coats: 2, washable: 0,
      line: 'Nitrocellulose wood lacquer that shows the grain of doors and furniture.',
      points: ['Clear finish that deepens sheesham and deodar', 'Fast drying between coats', 'For interior woodwork'],
      chip: 'AM-2008'
    },
    {
      id: 'splendid-metallic', name: 'Cover Up Splendid Metallic', category: 'enamel', tier: 'Metallic', finish: 'Metallic',
      pricePerLitre: 1690, coverage: 9, coats: 2, washable: 0,
      line: 'Spray-applied metallic finish for gates, grills and feature woodwork.',
      points: ['Metallic sheen on metal and wood', 'Alkyd based for outdoor durability', 'Apply by spray for an even finish'],
      chip: 'AM-7009'
    },
    {
      id: 'pearl-glow', name: 'Cover Up Pearl Glow', category: 'interior', tier: 'Feature finish', finish: 'Feature finish',
      pricePerLitre: 1890, coverage: 8, coats: 2, washable: 0,
      line: 'Water-based pearl finish in Light Gold, Royal Gold and Silver for one statement wall.',
      points: ['Soft shimmer for a drawing room or shaadi backdrop', 'Use over a matt base coat', 'A little covers a feature wall'],
      chip: 'AM-3009'
    },
    {
      id: 'wall-primer', name: 'Smart Series Wall Primer', category: 'prep', tier: 'Primer', finish: 'Primer',
      pricePerLitre: 720, coverage: 11, coats: 1, washable: 0,
      line: 'Primer that seals fresh plaster and gives the topcoat an even base.',
      points: ['Helps stop salts burning through the topcoat', 'Evens out suction so the finish is uniform', 'Use one coat under every emulsion'],
      chip: 'AM-1002'
    },
    {
      id: 'wall-putty', name: 'Cover Up Wall Filling Putty', category: 'prep', tier: 'Filler', finish: 'Filler',
      pricePerLitre: 190, coverage: 1.6, coats: 2, washable: 0,
      line: 'Water-based, sandable putty for a level wall before paint.',
      points: ['Fills dents and trowel marks', 'Sands to a fine surface', 'Two thin coats beat one thick coat'],
      chip: 'AM-1006'
    },
    {
      id: 'damp-stop', name: 'Cover Up Damp Stop', category: 'protect', tier: 'Proposed product', finish: 'Proposed product',
      pricePerLitre: 1650, coverage: 6, coats: 2, washable: 0,
      line: 'Proposed addition to the range: a waterproof barrier coat for seelan-affected walls.',
      points: ['Blocks moisture rising up to 1 metre', 'Paint over it with any emulsion', 'For interior and exterior plaster'],
      chip: 'AM-5004'
    },
    {
      id: 'roof-cool', name: 'Cover Up Roof Cool', category: 'protect', tier: 'Proposed product', finish: 'Proposed product',
      pricePerLitre: 1390, coverage: 5, coats: 2, washable: 0,
      line: 'Proposed addition to the range: a heat-reflective roof coat that also seals hairline cracks.',
      points: ['Reflects sun to keep the top floor cooler', 'Waterproofs the slab before monsoon', 'Walkable once cured'],
      chip: 'AM-1001'
    }
  ];

  // Typical paintable areas (square feet) for a double-storey house.
  var HOUSES = [
    { id: '3-marla', label: '3 marla', walls: 3400, ceilings: 1200, exterior: 1400 },
    { id: '5-marla', label: '5 marla', walls: 5500, ceilings: 1900, exterior: 2200 },
    { id: '7-marla', label: '7 marla', walls: 7000, ceilings: 2500, exterior: 2800 },
    { id: '10-marla', label: '10 marla', walls: 9000, ceilings: 3200, exterior: 3500 },
    { id: '1-kanal', label: '1 kanal', walls: 14000, ceilings: 5000, exterior: 5500 }
  ];

  var CITIES = [
    {
      id: 'karachi', name: 'Karachi', urdu: 'کراچی', chip: 'AM-5007',
      climate: 'Humid sea air, salt and strong sun all year, with short violent monsoon bursts.',
      stresses: ['Salt deposits and corrosion on grills and gates', 'Fungus in humid, closed rooms', 'Colour fade on sea-facing walls'],
      exterior: ['wall-primer', 'weather-cover'], interior: ['wall-primer', 'plastic-emulsion'], metal: 'synthetic-enamel',
      tip: 'Wash sea-facing walls with fresh water and let them dry fully before priming. Salt left under paint blisters within one season.',
      window: 'October to March'
    },
    {
      id: 'lahore', name: 'Lahore', urdu: 'لاہور', chip: 'AM-2006',
      climate: 'Summers above 45°C, a heavy monsoon from July to September and winter smog.',
      stresses: ['Rising damp (seelan) after monsoon', 'Smog and dust staining exterior walls', 'Heat cracking on roof slabs'],
      exterior: ['wall-primer', 'weather-cover'], interior: ['wall-primer', 'aqueous-matt'], metal: 'synthetic-enamel',
      tip: 'Treat damp patches with Cover Up Damp Stop up to one metre from the floor before any emulsion goes on.',
      window: 'October to November and February to April'
    },
    {
      id: 'islamabad', name: 'Islamabad and Rawalpindi', urdu: 'اسلام آباد', chip: 'AM-6002',
      climate: 'The wettest of the big cities: long monsoon, cool damp winters and shaded hillsides.',
      stresses: ['Algae and green streaks on north walls', 'Rain run-off marks under parapets', 'Slow drying in winter'],
      exterior: ['wall-primer', 'weather-cover'], interior: ['wall-primer', 'aqueous-matt'], metal: 'synthetic-enamel',
      tip: 'Scrub algae off with a bleach wash and rinse before repainting, or it grows back through the new coat.',
      window: 'March to May and October'
    },
    {
      id: 'faisalabad', name: 'Faisalabad', urdu: 'فیصل آباد', chip: 'AM-3002',
      climate: 'Hot, dry summers with industrial dust and a moderate monsoon.',
      stresses: ['Dust and soot settling on exterior walls', 'Chalking on sun-facing sides', 'Hard water stains near pipes'],
      exterior: ['wall-primer', 'weather-cover'], interior: ['wall-primer', 'special-emulsion'], metal: 'synthetic-enamel',
      tip: 'Pick mid-tone exterior shades: they hide dust far better than pure white.',
      window: 'October to March'
    },
    {
      id: 'multan', name: 'Multan', urdu: 'ملتان', chip: 'AM-5001',
      climate: 'Among the hottest cities in the country, dry, with dust storms and very little rain.',
      stresses: ['Colour fade and chalking from extreme sun', 'Hairline cracks from heat movement', 'Hot top floors under bare slabs'],
      exterior: ['wall-primer', 'weather-cover'], interior: ['wall-primer', 'special-emulsion'], metal: 'synthetic-enamel',
      tip: 'Coat the roof with Cover Up Roof Cool before May. A reflective slab makes the top floor noticeably easier to live in.',
      window: 'November to March'
    },
    {
      id: 'peshawar', name: 'Peshawar', urdu: 'پشاور', chip: 'AM-2001',
      climate: 'Hot summers, cold winters and dust, with rain in both winter and monsoon.',
      stresses: ['Wide temperature swings opening cracks', 'Dust staining', 'Damp after winter rain'],
      exterior: ['wall-primer', 'weather-cover'], interior: ['wall-primer', 'special-emulsion'], metal: 'synthetic-enamel',
      tip: 'Fill cracks with putty and prime them separately before the full coat so they do not show through.',
      window: 'March to May and September to November'
    },
    {
      id: 'quetta', name: 'Quetta', urdu: 'کوئٹہ', chip: 'AM-7004',
      climate: 'Cold, dry winters with frost and big swings between day and night.',
      stresses: ['Frost and thermal cracking', 'Very dry air: paint dries too fast in summer', 'Dust'],
      exterior: ['wall-primer', 'weather-cover'], interior: ['wall-primer', 'aqueous-matt'], metal: 'matt-enamel',
      tip: 'Do not paint outdoors when the night temperature drops below 10°C. The film will not cure properly.',
      window: 'April to October'
    },
    {
      id: 'hyderabad', name: 'Hyderabad', urdu: 'حیدرآباد', chip: 'AM-3005',
      climate: 'Hot, dry and windy, with salty groundwater and occasional heavy monsoon rain.',
      stresses: ['Salt (shora) pushing through lower walls', 'Wind-blown dust', 'Strong sun fade'],
      exterior: ['wall-primer', 'weather-cover'], interior: ['wall-primer', 'special-emulsion'], metal: 'synthetic-enamel',
      tip: 'Brush off white salt dry, never wash it in. Then seal with Smart Series Wall Primer before painting.',
      window: 'October to March'
    }
  ];

  var PROBLEMS = [
    {
      id: 'seelan', name: 'Damp patches', local: 'Seelan', urdu: 'سیلن', chip: 'AM-7004',
      looks: 'Dark, cold patches low on the wall that grow after rain. Paint bubbles and falls off.',
      cause: 'Water rising from the ground or leaking from a pipe, bathroom or roof behind the wall.',
      steps: ['Find and fix the water source first: a leaking pipe, bathroom or roof drain.', 'Scrape all loose paint and plaster and let the wall dry for at least a week.', 'Apply two coats of Cover Up Damp Stop up to one metre above the damp line.', 'Prime with Smart Series Wall Primer, then finish with your emulsion.'],
      products: ['damp-stop', 'wall-primer', 'aqueous-matt'], days: 10
    },
    {
      id: 'shora', name: 'White salt on the wall', local: 'Shora / kalar', urdu: 'شورہ', chip: 'AM-1007',
      looks: 'White powder or crystals pushing through the paint, usually near the floor.',
      cause: 'Salts in the bricks, sand or groundwater travel to the surface as the wall dries.',
      steps: ['Brush the salt off dry. Do not wash it: water carries it back in.', 'Wait until no new salt appears for a few days.', 'Seal with one coat of Smart Series Wall Primer.', 'Finish with two coats of emulsion.'],
      products: ['wall-primer', 'special-emulsion'], days: 6
    },
    {
      id: 'peeling', name: 'Peeling and flaking', local: 'Papri', urdu: 'پپڑی', chip: 'AM-2003',
      looks: 'Paint lifting in sheets or flakes, often over old distemper or chalky lime wash.',
      cause: 'New paint applied over a loose, dusty or unprimed surface, or over damp.',
      steps: ['Scrape back to a firm edge and sand it smooth.', 'Wash off old distemper or lime wash completely.', 'Level with Cover Up Wall Filling Putty and sand.', 'Prime with Smart Series Wall Primer before the topcoat.'],
      products: ['wall-putty', 'wall-primer', 'plastic-emulsion'], days: 5
    },
    {
      id: 'cracks', name: 'Cracks', local: 'Daraar', urdu: 'دراڑ', chip: 'AM-7007',
      looks: 'Hairline or wider cracks in plaster, often at corners, around windows or on the roof.',
      cause: 'Plaster shrinking as it cures, heat movement, or settlement of the structure.',
      steps: ['Open hairline cracks slightly with a scraper so filler can grip.', 'Fill with Cover Up Wall Filling Putty in two passes and sand flat.', 'Spot-prime the filled areas.', 'Use Cover Up Weather Cover outside: its flexible film bridges hairline movement.'],
      products: ['wall-putty', 'wall-primer', 'weather-cover'], days: 4
    },
    {
      id: 'fungus', name: 'Fungus and algae', local: 'Kaai', urdu: 'کائی', chip: 'AM-6003',
      looks: 'Black spots indoors or green and black streaks outside, worst on shaded, damp walls.',
      cause: 'Moisture that never dries out: poor ventilation indoors, rain run-off outdoors.',
      steps: ['Scrub with a bleach solution (1 part bleach to 3 parts water) and rinse.', 'Let the wall dry fully.', 'Prime with Smart Series Wall Primer.', 'Finish with Cover Up Plastic Emulsion indoors or Cover Up Weather Cover outdoors.'],
      products: ['wall-primer', 'plastic-emulsion', 'weather-cover'], days: 4
    },
    {
      id: 'fading', name: 'Fading and chalking', local: 'Rang urrna', urdu: 'رنگ اڑنا', chip: 'AM-3009',
      looks: 'Colour looks washed out and leaves powder on your hand when you rub the wall.',
      cause: 'Years of strong sun breaking down a low-grade or interior paint used outdoors.',
      steps: ['Wash the wall to remove all chalky powder.', 'Prime with Smart Series Wall Primer to bind what remains.', 'Repaint with two coats of Cover Up Weather Cover.', 'Choose earth and mid tones for west-facing walls: they hold colour longest.'],
      products: ['wall-primer', 'weather-cover'], days: 3
    },
    {
      id: 'blisters', name: 'Bubbles and blisters', local: 'Bulbulay', urdu: 'بلبلے', chip: 'AM-4006',
      looks: 'Raised bubbles under the paint film, sometimes with water inside.',
      cause: 'Painting on a damp or very hot wall, or moisture trapped behind the film.',
      steps: ['Scrape the blisters and check whether the wall behind is damp.', 'If damp, treat as seelan first.', 'Sand, spot-prime and repaint in the cool part of the day.'],
      products: ['damp-stop', 'wall-primer', 'special-emulsion'], days: 4
    },
    {
      id: 'rust', name: 'Rust on gates and grills', local: 'Zang', urdu: 'زنگ', chip: 'AM-2005',
      looks: 'Brown stains and flaking metal on gates, grills and railings.',
      cause: 'Bare metal exposed to moisture, fastest in coastal air.',
      steps: ['Wire-brush or sand back to bright metal.', 'Wipe clean and prime the same day.', 'Finish with two coats of Cover Up Synthetic Enamel.'],
      products: ['synthetic-enamel'], days: 2
    }
  ];

  // Demo rows. Replace with the real dealer register.
  var DEALERS = [
    { city: 'Lahore', area: 'Sagian Road, Ravi Town', name: 'Amco Paints head office and display', type: 'Company' },
    { city: 'Lahore', area: 'Shah Alam Market', name: 'Authorised dealer, Shah Alam Market', type: 'Dealer' },
    { city: 'Lahore', area: 'Township', name: 'Authorised dealer, Township', type: 'Dealer' },
    { city: 'Lahore', area: 'Johar Town', name: 'Authorised dealer, Johar Town', type: 'Dealer' },
    { city: 'Sheikhupura', area: 'Lahore Road', name: 'Authorised dealer, Sheikhupura', type: 'Dealer' },
    { city: 'Gujranwala', area: 'GT Road', name: 'Authorised dealer, Gujranwala', type: 'Dealer' },
    { city: 'Faisalabad', area: 'Jhang Road', name: 'Authorised dealer, Faisalabad', type: 'Dealer' },
    { city: 'Sialkot', area: 'Paris Road', name: 'Authorised dealer, Sialkot', type: 'Dealer' },
    { city: 'Multan', area: 'Bosan Road', name: 'Authorised dealer, Multan', type: 'Dealer' },
    { city: 'Rawalpindi', area: 'Saddar', name: 'Authorised dealer, Rawalpindi', type: 'Dealer' },
    { city: 'Islamabad', area: 'G-9 Markaz', name: 'Authorised dealer, Islamabad', type: 'Dealer' },
    { city: 'Peshawar', area: 'University Road', name: 'Authorised dealer, Peshawar', type: 'Dealer' }
  ];

  // Demo batch codes for the genuine-tin check.
  var BATCHES = {
    'AMC-2610-4827': { product: 'Cover Up Aqueous Matt', packed: 'October 2026', pack: 'Drum 14.56 L' },
    'AMC-2609-1175': { product: 'Cover Up Weather Cover', packed: 'September 2026', pack: 'Gallon 3.64 L' },
    'AMC-2611-3390': { product: 'Cover Up Synthetic Enamel', packed: 'November 2026', pack: 'Quarter 0.91 L' }
  };

  var byId = {};
  PRODUCTS.forEach(function (product) { byId[product.id] = product; });

  // Split a litre requirement into the fewest tins, largest first.
  function packsFor(litres) {
    var remaining = Math.max(0, litres);
    var counts = PACKS.map(function (pack, index) {
      var isSmallest = index === PACKS.length - 1;
      var count = isSmallest ? Math.ceil(remaining / pack.litres - 1e-9) : Math.floor(remaining / pack.litres + 1e-9);
      remaining -= count * pack.litres;
      return Math.max(0, count);
    });
    // Four quarters make a gallon and four gallons make a drum: carry upwards.
    for (var index = PACKS.length - 1; index > 0; index -= 1) {
      if (counts[index] >= 4) {
        counts[index - 1] += Math.floor(counts[index] / 4);
        counts[index] = counts[index] % 4;
      }
    }
    return PACKS
      .map(function (pack, i) { return { pack: pack, count: counts[i] }; })
      .filter(function (row) { return row.count > 0; });
  }

  window.AmcoData = {
    packs: PACKS,
    categories: CATEGORIES,
    products: PRODUCTS,
    product: function (id) { return byId[id] || null; },
    houses: HOUSES,
    cities: CITIES,
    problems: PROBLEMS,
    dealers: DEALERS,
    batches: BATCHES,
    packsFor: packsFor,
    SQFT_PER_SQM: 10.7639
  };
})();
