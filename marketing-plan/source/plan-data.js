/* Data-driven parts of the marketing plan: bar charts, the six-month timeline
   and both content calendars. Runs once before headless Chrome prints. */
(function () {
  'use strict';

  var WEEKS_IN_TIMELINE = 27;

  var CHARTS = {
    market: {
      max: 520,
      rows: [
        ['2025', 413.9, 'USD 414m'],
        ['2026 (est.)', 428.8, 'USD 429m'],
        ['2031 (forecast)', 510.8, 'USD 511m']
      ]
    },
    reach: {
      max: 100,
      rows: [
        ['TikTok (18+)', 94.1, '94.1m'],
        ['YouTube', 60.6, '60.6m'],
        ['Facebook', 50.3, '50.3m'],
        ['Snapchat', 42.8, '42.8m'],
        ['Instagram', 24.3, '24.3m'],
        ['LinkedIn (members)', 22.0, '22.0m']
      ]
    },
    instagram: {
      max: 62,
      rows: [
        ['Brighto', 58.2, '58.2k'],
        ['Master', 33.4, '33.4k'],
        ['Gobi\'s', 22.9, '22.9k'],
        ['Berger', 22.4, '22.4k'],
        ['Diamond', 16.0, '16.0k'],
        ['Dulux Pakistan', 8.7, '8.7k'],
        ['Happilac', 7.7, '7.7k'],
        ['Nippon', 4.6, '4.6k'],
        ['Cover Up (Amco) today', 0.5, '0.5k', true],
        ['Cover Up target, May 2027', 8.0, '8.0k', true]
      ]
    },
    budget: {
      max: 320,
      rows: [
        ['Meta ads', 300, 'Rs 300k'],
        ['Content production', 160, 'Rs 160k'],
        ['Google Search ads', 90, 'Rs 90k'],
        ['TikTok and YouTube ads', 90, 'Rs 90k'],
        ['Painter and creator fees', 70, 'Rs 70k'],
        ['SEO and GEO content', 60, 'Rs 60k'],
        ['Tools', 30, 'Rs 30k']
      ]
    }
  };

  // [lane, [startWeek, spanWeeks, label, hex, ink]...]; week 1 = 30 Nov 2026.
  var TIMELINE = [
    ['Campaign', [
      [1, 5, 'Rang-e-Pakistan launch', '#1f5ea7', '#fff'],
      [6, 5, 'Seedha Hisaab', '#e2b11d', '#14212b'],
      [11, 5, 'Eid se pehle, ghar naya', '#c7252c', '#fff'],
      [16, 3, 'Pakistan Day', '#115740', '#fff'],
      [19, 4, 'Garmi se pehle', '#1d99af', '#fff'],
      [23, 3, 'Bari Eid', '#a2482f', '#fff'],
      [26, 2, 'Rains', '#5e696f', '#fff']
    ]],
    ['Tool in focus', [
      [1, 5, '3D house, shade card', '#14212b', '#fff'],
      [6, 4, 'Price list, calculator', '#14212b', '#fff'],
      [10, 6, 'Eid countdown, painter booking', '#14212b', '#fff'],
      [16, 3, 'Shade stories', '#14212b', '#fff'],
      [19, 4, 'Paint for your city', '#14212b', '#fff'],
      [23, 3, 'Calculator', '#14212b', '#fff'],
      [26, 2, 'Wall doctor', '#14212b', '#fff']
    ]],
    ['Paid media weight', [
      [1, 5, 'Medium: reach and follows', '#55626d', '#fff'],
      [6, 5, 'Medium: search and traffic', '#55626d', '#fff'],
      [11, 5, 'Heavy: click to WhatsApp', '#d3222a', '#fff'],
      [16, 3, 'Light', '#b9c4cc', '#14212b'],
      [19, 4, 'Medium: product', '#55626d', '#fff'],
      [23, 3, 'Heavy', '#d3222a', '#fff'],
      [26, 2, 'Medium', '#55626d', '#fff']
    ]],
    ['Trade programme', [
      [1, 5, 'Dealer QR kits', '#2e5c45', '#fff'],
      [6, 5, 'Ustad Club pilot, Lahore', '#2e5c45', '#fff'],
      [11, 5, 'Painter job leads', '#2e5c45', '#fff'],
      [16, 7, 'Ustad Club: Gujranwala, Faisalabad', '#2e5c45', '#fff'],
      [23, 5, 'Labour Day drive, dealer meet', '#2e5c45', '#fff']
    ]]
  ];

  var TIMELINE_TICKS = { 1: 'Dec', 6: 'Jan', 10: 'Feb', 14: 'Mar', 19: 'Apr', 23: 'May', 27: 'Jun' };

  var MOMENTS = [
    [4, 'Quaid Day 25 Dec'],
    [11, 'Ramadan ~8 Feb'],
    [15, 'Eid ul-Fitr ~9 Mar'],
    [17, '23 March'],
    [22, 'Labour Day'],
    [25, 'Eid ul-Adha ~17 May']
  ];

  // December 2026: [date, pillar, Instagram, Facebook, LinkedIn and other]
  var DECEMBER = [
    ['Tue 1', 'Rang-e-Pakistan', 'Launch reel, 30 sec: "63 rang, sab apne". Shade names over the places they come from.', 'Same film, uploaded natively with Urdu caption. Pin it. New cover and profile picture.', 'LinkedIn: company page goes live. Director\'s note on why a Lahore paint maker built a 3D house.'],
    ['Wed 2', 'Rang-e-Pakistan', 'Carousel: 9 shades named after places you know.', 'Photo album. Question: "Aap ka sheher kaun sa rang hai?"', ''],
    ['Thu 3', 'See before you buy', 'Reel: screen recording of the 3D house. "Dewar chuno, rang chuno."', 'Reel plus first click-to-WhatsApp ad, Lahore only.', 'LinkedIn carousel for architects: every Amco shade has a code and a light reflectance value.'],
    ['Fri 4', 'Community', 'Stories poll: Chaunsa or Sindhri?', 'Jumma greeting set on Badshahi Marble.', ''],
    ['Sat 5', 'Ustad', 'Reel, Ustad tip 1: roller or brush, and where each belongs.', 'Same reel with Urdu subtitles. Share into three home-building groups.', 'TikTok and YouTube Shorts cut.'],
    ['Sun 6', 'Community', 'Launch #MeraRangAmco: post your wall, tag us.', 'Reply to every comment from launch week.', ''],
    ['Mon 7', 'Shaadi season', 'Carousel: the wedding-house checklist. Four weeks out, two weeks out, one week out.', 'Urdu version with link to the Eid and shaadi countdown tool.', 'Blog: "Shaadi se pehle ghar ka paint: kab shuru karein".'],
    ['Tue 8', 'See before you buy', 'Reel: one shade under a tube light and a warm bulb. "Dukan mein kuch, ghar mein kuch?"', 'Same reel.', 'LinkedIn: why shade cards mislead under shop lighting.'],
    ['Wed 9', 'Rang-e-Pakistan', 'Shade story: Kashmiri Chai (AM-4006), shot with a cup of pink tea.', 'Same, Urdu caption.', ''],
    ['Thu 10', 'Deewar Doctor', 'Reel, Deewar Doctor 1: seelan fixed in four steps.', 'Same reel, boosted in Lahore and Gujranwala.', 'LinkedIn: "Become an Amco dealer in central Punjab".'],
    ['Fri 11', 'Community', 'Stories question box: "Paint ka koi sawal?"', 'Jumma greeting plus the best question of the week, answered.', ''],
    ['Sat 12', 'Ghar ki kahani', 'Reel: one drawing room, one day, Cover Up Aqueous Matt in Gwadar Bay. Before and after.', 'Album with the full cost breakdown in rupees.', 'TikTok and Shorts cut. Google Business post.'],
    ['Sun 13', 'Community', 'Stories poll: which room next?', 'Community replies.', ''],
    ['Mon 14', 'Seedha Hisaab', 'Carousel: "5 marla ghar ka paint: poora hisaab." Litres, drums, rupees.', 'Urdu version with calculator link.', 'Blog: "5 marla house paint cost in Pakistan".'],
    ['Tue 15', 'See before you buy', 'Reel: matching a shade from a dupatta with the photo tool.', 'Same reel.', 'LinkedIn: how an honest calculator stops over-ordering on site.'],
    ['Wed 16', 'Rang-e-Pakistan', 'Shade story: Dhund (AM-7001), timed for fog season.', 'Same.', ''],
    ['Thu 17', 'Ustad', 'Reel, Ustad tip 2: two thin coats of putty beat one thick coat.', 'Same reel, shared in painter groups.', 'LinkedIn: announcing the Amco Ustad Club for painters.'],
    ['Fri 18', 'Seedha Hisaab', 'Stories: checking a batch code on the lid, start to finish.', 'Jumma greeting plus "Asli dabba kaise pehchanein".', ''],
    ['Sat 19', 'Deewar Doctor', 'Reel, Deewar Doctor 2: shora, the white salt, and why you never wash it.', 'Same reel.', 'TikTok and Shorts cut. Google Business post.'],
    ['Sun 20', 'Community', 'Repost the best #MeraRangAmco wall of the week.', 'Same.', ''],
    ['Mon 21', 'Made for our weather', 'Carousel: "Lahore ki sardi aur aap ki deewarein." Smog, fog, damp.', 'Same, linking to Paint for your city.', 'Blog: "Best exterior paint for Lahore weather".'],
    ['Tue 22', 'Ghar ki kahani', 'Reel: "Made in Lahore". Thirty seconds inside the Kot Abdul Malik plant.', 'Same reel.', 'LinkedIn: quality control at the plant, with photos.'],
    ['Wed 23', 'Rang-e-Pakistan', 'Shade story: Parcham (AM-6001).', 'Same.', ''],
    ['Thu 24', 'Ustad', 'Reel: an ustad with 20 years on the roller tells his story.', 'Same reel.', ''],
    ['Fri 25', 'Occasion', 'Quaid-e-Azam Day: typographic tribute in Parcham and Karakoram Snow. Christmas greeting in Stories.', 'Same.', 'LinkedIn: same tribute.'],
    ['Sat 26', 'Ghar ki kahani', 'Reel: children\'s room time-lapse in Fairy Meadows and Sindhri.', 'Album.', 'TikTok and Shorts cut. Google Business post.'],
    ['Sun 27', 'Community', 'Stories vote: choose the "Amco Rang 2027" from three finalists.', 'Poll post.', ''],
    ['Mon 28', 'Rang-e-Pakistan', 'Carousel: the five most viewed shades on the website this month.', 'Same.', 'Blog: "Room colour combinations for Pakistani homes".'],
    ['Tue 29', 'Ustad', 'Reel: five questions to ask your painter before work starts.', 'Same reel.', 'LinkedIn: the 2027 season. Ramadan in February compresses the repaint peak.'],
    ['Wed 30', 'Rang-e-Pakistan', 'Announce the winning "Amco Rang 2027".', 'Same.', ''],
    ['Thu 31', 'Seedha Hisaab', '"Naya saal, nayi deewar." Teaser: the full Amco price list goes public on 4 January.', 'Same.', '']
  ];

  // January to May 2027: [week of, campaign, hero content, tool to push, paid focus, SEO articles]
  var WEEKLY = [
    ['4 Jan', 'Seedha Hisaab', 'Film: "Paint ki qeemat chhupane ki cheez nahi." The price list goes public.', 'Price list', 'Reach, Lahore and central Punjab', 'Paint price in Pakistan 2027 (updated monthly). Distemper v plastic emulsion: price and life.'],
    ['11 Jan', 'Seedha Hisaab', 'Carousel series: what a 5, 7 and 10 marla house costs to paint.', 'Calculator', 'Traffic to calculator', '10 marla house paint cost. How many litres of paint for one room.'],
    ['18 Jan', 'Deewar Doctor', 'Winter damp week: three Deewar Doctor reels on seelan, fungus and peeling.', 'Wall doctor', 'Video views, Lahore, Islamabad', 'Seelan ka ilaj (Urdu). Seepage in walls: solution and cost.'],
    ['25 Jan', 'Eid countdown', '"Ramzan se pehle shuru karein." The countdown tool opens with last start dates.', 'Eid countdown', 'Click to WhatsApp', 'When to start painting before Eid 2027. How long paint takes to dry in winter.'],
    ['1 Feb', 'Eid countdown', 'Kashmir Day static (5 Feb). Pre-Ramadan booking push with dealer offers.', 'Painter booking', 'Click to WhatsApp', 'Best paint for a drawing room. Washable paint: is it worth the price.'],
    ['8 Feb', 'Eid se pehle, ghar naya', 'Ramadan begins (expected 8 Feb). Campaign film. Posting moves to 9 pm to 11 pm, after taraweeh.', 'Eid countdown', 'Heavy: click to WhatsApp', 'Painting during Ramadan: a low-odour guide.'],
    ['15 Feb', 'Eid se pehle, ghar naya', 'Deadline posts by house size: "10 marla? 19 February aakhri din."', 'Eid countdown', 'Heavy: retarget calculator users', 'How long it takes to paint a 10 marla house.'],
    ['22 Feb', 'Eid se pehle, ghar naya', 'Makeover stories shot between iftar and sehri. Ustads at work in Ramadan.', 'Painter booking', 'Heavy', 'Paint colours for a small bedroom.'],
    ['1 Mar', 'Eid se pehle, ghar naya', '"Sirf ek kamra? Abhi waqt hai." One-room and feature-wall jobs.', '3D house', 'Heavy: last-minute rooms', 'Feature wall ideas for Eid.'],
    ['8 Mar', 'Eid ul-Fitr', 'Eid greeting film (Eid expected 9 or 10 Mar). #EidKaGhar winners.', 'Shade card', 'Light', 'None: review and refresh the top ten pages.'],
    ['15 Mar', 'Pakistan Day', 'Shade stories by region: Hunza, Thar, Multan, Karachi, Ziarat.', 'Shade card', 'Light: video views', 'The story behind Multani Blue. Colours of Pakistan: a paint palette.'],
    ['22 Mar', 'Pakistan Day', '23 March film: the map of Pakistan built from 63 shades.', 'Shade card', 'Medium: reach', 'None: digital PR push for the film.'],
    ['29 Mar', 'Bahar ka rang', 'Exterior season opens. Front elevations repainted in the 3D house.', '3D house (outside)', 'Medium: exterior product', 'Best exterior paint in Pakistan. Exterior colour combinations for a 5 marla front.'],
    ['5 Apr', 'Made for our weather', 'City series: Karachi salt, Lahore damp, Islamabad rain, Multan heat.', 'Paint for your city', 'Medium, by city', 'Exterior paint for Karachi sea air. Exterior paint for Islamabad rain.'],
    ['12 Apr', 'Garmi se pehle', 'Weather Cover push: "Garmi se pehle bahar ki deewar." Why exterior paint fails in June.', 'Calculator', 'Medium: Multan, Faisalabad, Lahore', 'Best exterior paint for hot weather in Pakistan.'],
    ['19 Apr', 'Garmi se pehle', 'Proof film: a hose test and a scrub test on a Weather Cover wall, one take.', 'Products', 'Medium', 'How long exterior paint lasts in Pakistan. Roof heat-proofing: methods and cost.'],
    ['26 Apr', 'Ustad week', 'Tributes to painters before Labour Day (1 May). Ustad Club sign-up drive.', 'Ustad Club', 'Medium: painters on TikTok', 'How to become a professional painter in Pakistan.'],
    ['3 May', 'Bari Eid', '"Bari Eid se pehle." Gates, grills and washable walls before guests arrive.', 'Calculator', 'Heavy: click to WhatsApp', 'Enamel paint price in Pakistan. How to paint a rusted gate.'],
    ['10 May', 'Bari Eid', 'One-day jobs. Eid ul-Adha greeting (expected 16 or 17 May).', 'Painter booking', 'Heavy', 'None: refresh the price list page.'],
    ['17 May', 'After Eid', 'Washable paint proof: cleaning walls after Eid, on camera.', 'Products', 'Light', 'How to clean painted walls.'],
    ['24 May', 'Monsoon se pehle', 'Seelan repairs and exterior prep before July. Hand-over to the June plan.', 'Wall doctor', 'Medium', 'How to waterproof walls before monsoon. Shora on walls: causes and fix.']
  ];

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  function renderCharts() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-bars]'), function (holder) {
      var chart = CHARTS[holder.getAttribute('data-bars')];
      holder.innerHTML = chart.rows.map(function (row) {
        var width = Math.max(1, (row[1] / chart.max) * 78);
        return '<div class="bar-row"><span>' + escapeHtml(row[0]) + '</span><span class="bar-track">' +
          '<span class="bar' + (row[3] ? ' hi' : '') + '" style="width:' + width.toFixed(1) + '%"></span>' +
          '<span class="bar-val">' + escapeHtml(row[2]) + '</span></span></div>';
      }).join('');
    });
  }

  function renderTimeline() {
    var holder = document.querySelector('[data-timeline]');
    if (!holder) { return; }
    var html = '<span class="head"></span>';
    for (var week = 1; week <= WEEKS_IN_TIMELINE; week += 1) {
      html += '<span class="head tick" style="grid-column:' + (week + 1) + '">' + (TIMELINE_TICKS[week] || '') + '</span>';
    }
    TIMELINE.forEach(function (lane, laneIndex) {
      var row = laneIndex + 2;
      html += '<span class="lane" style="grid-row:' + row + ';grid-column:1">' + lane[0] + '</span>';
      lane[1].forEach(function (seg) {
        html += '<span class="seg" style="grid-row:' + row + ';grid-column:' + (seg[0] + 1) + ' / span ' + seg[1] + ';--chip:' + seg[3] + ';--chip-ink:' + seg[4] + '">' + escapeHtml(seg[2]) + '</span>';
      });
    });
    var momentRow = TIMELINE.length + 2;
    html += '<span class="lane" style="grid-row:' + momentRow + ';grid-column:1">Key dates</span>';
    MOMENTS.forEach(function (moment, index) {
      // Alternate two rows so neighbouring dates never collide.
      var span = Math.min(5, WEEKS_IN_TIMELINE - moment[0] + 1);
      html += '<span class="tick" style="grid-row:' + (momentRow + (index % 2)) + ';grid-column:' + (moment[0] + 1) + ' / span ' + span + ';font-weight:600;color:#14212b">' + escapeHtml(moment[1]) + '</span>';
    });
    holder.innerHTML = html;
  }

  function renderRows(selector, rows) {
    var body = document.querySelector(selector);
    if (!body) { return; }
    body.innerHTML = rows.map(function (row) {
      return '<tr>' + row.map(function (cell, index) {
        return '<td' + (index === 0 ? ' style="white-space:nowrap;font-weight:700"' : '') + '>' + escapeHtml(cell) + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  renderCharts();
  renderTimeline();
  renderRows('[data-december-a]', DECEMBER.slice(0, 16));
  renderRows('[data-december-b]', DECEMBER.slice(16));
  renderRows('[data-weekly]', WEEKLY);
})();
