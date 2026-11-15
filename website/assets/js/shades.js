/* Amco shade library — "Rang-e-Pakistan" collection.
   Demo data for the MVP: names, codes and hex values are proposals and must be
   matched against Amco's physical shade card before launch. */
(function () {
  'use strict';

  var FAMILIES = [
    { id: 'white', name: 'Whites', urdu: 'سفید' },
    { id: 'earth', name: 'Earth', urdu: 'مٹی' },
    { id: 'sun', name: 'Sun', urdu: 'دھوپ' },
    { id: 'rose', name: 'Rose & berry', urdu: 'گلاب' },
    { id: 'blue', name: 'Blues', urdu: 'نیلا' },
    { id: 'green', name: 'Greens', urdu: 'سبز' },
    { id: 'grey', name: 'Greys', urdu: 'سرمئی' }
  ];

  // [code, name, hex, family, where the colour comes from]
  var RAW = [
    ['AM-1001', 'Karakoram Snow', '#F3F5F2', 'white', 'Fresh snow on the high Karakoram, a clean white with no yellow in it.'],
    ['AM-1002', 'Nathia Mist', '#E9EDE8', 'white', 'Morning cloud sitting in the pines at Nathia Gali.'],
    ['AM-1003', 'Chandni', '#E6EAEE', 'white', 'Moonlight on a whitewashed roof.'],
    ['AM-1004', 'Malai', '#F6EFDB', 'white', 'The cream that sets on top of boiled milk.'],
    ['AM-1005', 'Kheer', '#F3E8D0', 'white', 'Slow-cooked rice pudding, warm and soft.'],
    ['AM-1006', 'Badshahi Marble', '#ECE5D9', 'white', 'The marble domes of Badshahi Mosque at noon.'],
    ['AM-1007', 'Khewra Salt', '#F1DFD6', 'white', 'Pink rock salt from the Khewra mines, held up to the light.'],
    ['AM-1008', 'Chitral Cotton', '#EFE9DF', 'white', 'Undyed handspun cotton.'],
    ['AM-1009', 'Motia', '#F7F4E6', 'white', 'Jasmine buds strung for a summer evening.'],

    ['AM-2001', 'Thar Sand', '#D8BB8E', 'earth', 'Dunes of the Thar an hour before sunset.'],
    ['AM-2002', 'Cholistan Dune', '#C8A572', 'earth', 'Deeper desert sand from around Derawar Fort.'],
    ['AM-2003', 'Multani Mitti', '#CDB896', 'earth', 'The pale clay every household knows.'],
    ['AM-2004', 'Doodh Patti', '#B98C60', 'earth', 'Strong milky tea from a roadside dhaba.'],
    ['AM-2005', 'Mohenjo Brick', '#B4663E', 'earth', 'Fired brick that has lasted 4,500 years at Mohenjo-daro.'],
    ['AM-2006', 'Lahori Brick', '#A2482F', 'earth', 'The small red bricks of the Walled City.'],
    ['AM-2007', 'Gurr', '#8B5A2C', 'earth', 'Fresh jaggery straight from the pan.'],
    ['AM-2008', 'Sheesham', '#5A3A2A', 'earth', 'Polished sheesham wood from a Chiniot workshop.'],
    ['AM-2009', 'Rohtas Stone', '#A49685', 'earth', 'Weathered sandstone of Rohtas Fort.'],

    ['AM-3001', 'Basant', '#F5C82B', 'sun', 'Kite-flying yellow on a Lahore rooftop.'],
    ['AM-3002', 'Sarson', '#E2B11D', 'sun', 'Mustard fields across Punjab in January.'],
    ['AM-3003', 'Haldi', '#D7991C', 'sun', 'Turmeric, ground fresh.'],
    ['AM-3004', 'Sindhri', '#F6CD5F', 'sun', 'The first Sindhri mangoes of June.'],
    ['AM-3005', 'Chaunsa', '#F4B43C', 'sun', 'Ripe Chaunsa from Multan, the late-season favourite.'],
    ['AM-3006', 'Hunza Apricot', '#EFA35E', 'sun', 'Apricots drying on rooftops in Hunza.'],
    ['AM-3007', 'Kinnow', '#EC8926', 'sun', 'Sargodha kinnow, peeled in the winter sun.'],
    ['AM-3008', 'Genda', '#E79418', 'sun', 'Marigold garlands at a mehndi.'],
    ['AM-3009', 'Makai', '#F3DC9A', 'sun', 'Roasted corn sold from a cart in the rain.'],

    ['AM-4001', 'Truck Art Red', '#C7252C', 'rose', 'The red that outlines every painted truck on the GT Road.'],
    ['AM-4002', 'Shaadi Red', '#A11722', 'rose', 'A bridal dupatta.'],
    ['AM-4003', 'Anarkali', '#C13A4D', 'rose', 'Pomegranate blossom.'],
    ['AM-4004', 'Sharbat', '#D8425D', 'rose', 'Rose sharbat poured over ice at iftar.'],
    ['AM-4005', 'Gulab', '#E48A9F', 'rose', 'Desi roses sold by the handful.'],
    ['AM-4006', 'Kashmiri Chai', '#E8B8B6', 'rose', 'Pink tea topped with crushed pistachio.'],
    ['AM-4007', 'Mohatta Pink', '#D8A08D', 'rose', 'The pink Jodhpur stone of Mohatta Palace, Karachi.'],
    ['AM-4008', 'Falsa', '#6A2D4E', 'rose', 'Falsa berries in early summer.'],
    ['AM-4009', 'Jamun', '#4A2B5D', 'rose', 'Jamun stains on your fingers in July.'],

    ['AM-5001', 'Multani Blue', '#1F5EA7', 'blue', 'Cobalt glaze from the kashi tilework of Multan.'],
    ['AM-5002', 'Attabad', '#1D99AF', 'blue', 'The unreal turquoise of Attabad Lake.'],
    ['AM-5003', 'Ferozi', '#2FB4AF', 'blue', 'Turquoise stone set in silver.'],
    ['AM-5004', 'Saif-ul-Malook', '#2D7EA5', 'blue', 'The lake at first light, before the wind picks up.'],
    ['AM-5005', 'Neelum', '#2B4D85', 'blue', 'The Neelum River in winter.'],
    ['AM-5006', 'Gwadar Bay', '#2A6E89', 'blue', 'Deep water off the Makran coast.'],
    ['AM-5007', 'Clifton Dusk', '#5D6E91', 'blue', 'Karachi sky ten minutes after sunset.'],
    ['AM-5008', 'Arabian Mist', '#A8C3D3', 'blue', 'Sea haze over the harbour.'],
    ['AM-5009', 'Aasman', '#BED8E9', 'blue', 'A clear sky after rain.'],

    ['AM-6001', 'Parcham', '#115740', 'green', 'The deep green of the flag.'],
    ['AM-6002', 'Margalla Pine', '#2E5C45', 'green', 'Pines on Trail 5 above Islamabad.'],
    ['AM-6003', 'Ziarat Juniper', '#4A6A56', 'green', 'Thousand-year-old juniper forest in Ziarat.'],
    ['AM-6004', 'Podina', '#4E9C68', 'green', 'Fresh mint for the chutney.'],
    ['AM-6005', 'Swat Meadow', '#6E9F59', 'green', 'Summer pasture above Kalam.'],
    ['AM-6006', 'Deosai', '#8CB37B', 'green', 'The Deosai plains in July.'],
    ['AM-6007', 'Pista', '#B6CE99', 'green', 'Pistachio kulfi.'],
    ['AM-6008', 'Fairy Meadows', '#A8C899', 'green', 'Grass at the foot of Nanga Parbat.'],
    ['AM-6009', 'Mehndi', '#7A7A2F', 'green', 'Henna paste before it dries.'],

    ['AM-7001', 'Dhund', '#C8CBCA', 'grey', 'Winter fog over the motorway.'],
    ['AM-7002', 'Monsoon Cloud', '#99A2A7', 'grey', 'The sky just before the first rain of July.'],
    ['AM-7003', 'Sea View', '#8895A0', 'grey', 'An overcast afternoon at Sea View.'],
    ['AM-7004', 'Tarbela', '#6D8490', 'grey', 'Still water behind the dam.'],
    ['AM-7005', 'Ravi Slate', '#5E696F', 'grey', 'Wet slate on the river bank.'],
    ['AM-7006', 'Taxila Stone', '#B8B0A2', 'grey', 'Carved Gandhara schist.'],
    ['AM-7007', 'Hingol', '#8B8276', 'grey', 'The rock towers of Hingol National Park.'],
    ['AM-7008', 'Surma', '#2D3237', 'grey', 'Kohl black, softer than pure black.'],
    ['AM-7009', 'Chaandi', '#D9DCDD', 'grey', 'Hand-beaten silver leaf.']
  ];

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function channelToLinear(v) {
    var c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  // Light reflectance value (0-100): how much light the colour bounces back.
  function lrv(hex) {
    var rgb = hexToRgb(hex);
    var y = 0.2126 * channelToLinear(rgb[0]) + 0.7152 * channelToLinear(rgb[1]) + 0.0722 * channelToLinear(rgb[2]);
    return Math.round(y * 100);
  }

  function rgbToLab(rgb) {
    var r = channelToLinear(rgb[0]), g = channelToLinear(rgb[1]), b = channelToLinear(rgb[2]);
    var x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    var y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    var z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  var SHADES = RAW.map(function (row) {
    var rgb = hexToRgb(row[2]);
    var value = lrv(row[2]);
    return {
      code: row[0],
      name: row[1],
      hex: row[2],
      family: row[3],
      story: row[4],
      rgb: rgb,
      lab: rgbToLab(rgb),
      lrv: value,
      // Text colour that stays readable on top of this shade.
      ink: value > 38 ? '#16202B' : '#FFFFFF'
    };
  });

  var byCode = {};
  SHADES.forEach(function (shade) { byCode[shade.code] = shade; });

  function distance(labA, labB) {
    var dl = labA[0] - labB[0], da = labA[1] - labB[1], db = labA[2] - labB[2];
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  // Closest shades in the library to any RGB colour (CIE76 distance in Lab).
  function nearest(rgb, count) {
    var lab = rgbToLab(rgb);
    return SHADES
      .map(function (shade) { return { shade: shade, delta: distance(lab, shade.lab) }; })
      .sort(function (a, b) { return a.delta - b.delta; })
      .slice(0, count || 3);
  }

  // Three shades that sit well with the given one: a light neutral, a tonal
  // neighbour from the same family, and an accent from across the wheel.
  function partners(code) {
    var shade = byCode[code];
    if (!shade) { return []; }
    var neutral = SHADES
      .filter(function (s) { return s.family === 'white' && s.code !== code; })
      .sort(function (a, b) { return distance(shade.lab, a.lab) - distance(shade.lab, b.lab); })[0];
    var tonal = SHADES
      .filter(function (s) { return s.family === shade.family && s.code !== code && Math.abs(s.lrv - shade.lrv) > 8; })
      .sort(function (a, b) { return distance(shade.lab, a.lab) - distance(shade.lab, b.lab); })[0];
    var opposite = [shade.lab[0] > 60 ? 35 : 70, -shade.lab[1], -shade.lab[2]];
    var accent = SHADES
      .filter(function (s) { return s.family !== shade.family && s.family !== 'white' && s.code !== code; })
      .sort(function (a, b) { return distance(opposite, a.lab) - distance(opposite, b.lab); })[0];
    return [neutral, tonal, accent].filter(Boolean);
  }

  window.AmcoShades = {
    families: FAMILIES,
    all: SHADES,
    get: function (code) { return byCode[code] || null; },
    nearest: nearest,
    partners: partners,
    lrv: lrv
  };
})();
