/* Amco trusted painters and Ustad Club data.
   The eight painters below are SAMPLE LISTINGS for the prototype, not real
   people: every one carries sample: true and the page labels them
   "Sample listing". The reward values (points per tin, tier thresholds,
   cash-back, referral bonus) are INDICATIVE placeholders that Amco has not
   agreed. Replace both with Amco's painter list and confirmed rules before
   launch. No painter phone numbers are stored here: every enquiry goes to
   Amco's own WhatsApp number. */
(function () {
  'use strict';

  var CITIES = [
    { code: 'LHR', name: 'Lahore' },
    { code: 'KHI', name: 'Karachi' },
    { code: 'ISB', name: 'Islamabad' },
    { code: 'FSD', name: 'Faisalabad' },
    { code: 'MUL', name: 'Multan' }
  ];

  var SPECIALITIES = [
    { id: 'interior', label: 'Interior', urdu: 'اندرونی' },
    { id: 'exterior', label: 'Exterior', urdu: 'بیرونی' },
    { id: 'texture', label: 'Texture', urdu: 'ٹیکسچر' },
    { id: 'wood-metal', label: 'Wood and metal', urdu: 'لکڑی اور لوہا' },
    { id: 'waterproofing', label: 'Waterproofing', urdu: 'واٹر پروفنگ' }
  ];

  // Points for each tin bought, by size (indicative).
  var SIZES = [
    { id: 'quarter', label: 'Quarter', points: 1 },
    { id: 'gallon', label: 'Gallon', points: 4 },
    { id: 'drum', label: 'Drum', points: 16 }
  ];

  // Lowest first. minPoints = points in the previous calendar year.
  // cashBack = rupees back per tin, by size. rewards = what this tier adds.
  var TIERS = [
    {
      id: 'bronze', name: 'Bronze', minPoints: 0,
      cashBack: { quarter: 5, gallon: 20, drum: 80 },
      rewards: ['Listed in the Amco painter directory', 'One free colour training day a year']
    },
    {
      id: 'silver', name: 'Silver', minPoints: 600,
      cashBack: { quarter: 10, gallon: 40, drum: 150 },
      rewards: ['An Amco tool kit each year', 'Listed above Bronze painters']
    },
    {
      id: 'gold', name: 'Gold', minPoints: 2000,
      cashBack: { quarter: 15, gallon: 60, drum: 240 },
      rewards: ['An Amco ID card your customers can verify', 'Accident insurance while you work']
    },
    {
      id: 'platinum', name: 'Platinum', minPoints: 5000,
      cashBack: { quarter: 20, gallon: 80, drum: 320 },
      rewards: ['Top place in the directory', 'Advanced texture and waterproofing training', 'Higher insurance cover']
    }
  ];

  var REFERRAL = { bonusPoints: 250 };

  function painter(code, name, city, areas, years, specialities, tier, jobs, verified) {
    return {
      id: code, code: code, name: name, city: city, areas: areas, years: years,
      specialities: specialities, tier: tier, jobs: jobs, verified: verified,
      photo: null, sample: true
    };
  }

  var PAINTERS = [
    painter('USTAD-LHR-014', 'Akram B.', 'Lahore', ['DHA', 'Cantt'], 18, ['interior', 'texture'], 'platinum', 212, true),
    painter('USTAD-LHR-022', 'Shahid M.', 'Lahore', ['Johar Town', 'Model Town'], 11, ['interior', 'exterior'], 'gold', 96, true),
    painter('USTAD-LHR-040', 'Imran K.', 'Lahore', ['Gulberg', 'Garden Town'], 4, ['wood-metal'], 'bronze', 12, false),
    painter('USTAD-KHI-007', 'Naveed A.', 'Karachi', ['Clifton', 'DHA'], 15, ['exterior', 'waterproofing'], 'gold', 141, true),
    painter('USTAD-KHI-031', 'Faisal R.', 'Karachi', ['Gulshan-e-Iqbal', 'North Nazimabad'], 7, ['interior', 'wood-metal'], 'silver', 38, true),
    painter('USTAD-ISB-003', 'Tariq H.', 'Islamabad', ['F-7', 'E-11', 'Bahria Town'], 20, ['texture', 'exterior'], 'platinum', 175, true),
    painter('USTAD-FSD-011', 'Asif J.', 'Faisalabad', ['Peoples Colony', 'Madina Town'], 9, ['interior', 'waterproofing'], 'silver', 44, true),
    painter('USTAD-MUL-005', 'Zahid N.', 'Multan', ['Gulgasht', 'Cantt'], 6, ['exterior', 'interior'], 'bronze', 19, false)
  ];

  window.AmcoPainters = {
    indicative: true,
    cities: CITIES,
    specialities: SPECIALITIES,
    sizes: SIZES,
    tiers: TIERS,
    referral: REFERRAL,
    painters: PAINTERS
  };
})();
