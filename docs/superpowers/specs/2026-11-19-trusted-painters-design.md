# Trusted painters and Ustad Club rewards — design

Date: 2026-11-19. Status: draft for approval.

## Intent

Amco wants every painter to want to work with Amco. The site should (1) show homeowners
a directory of painters Amco trusts, and (2) show painters what they gain by joining the
Ustad Club: points, tiers and a referral bonus. Today `dealers.html#painters` has a short
"Book a painter Amco trusts" WhatsApp form and a short "Join the Amco Ustad Club" form,
and nothing else.

## Decisions taken with the owner

- Wanted: public painter directory, points and tier rewards, and a referral (lead) bonus.
- Not wanted for now: a bigger painter sign-up form.

## Goals

1. New page `painters.html`, "Trusted painters": filter by city and speciality (interior,
   exterior, texture, wood/metal, waterproofing), and painter cards (photo or initials, name,
   city and areas, years painting, specialities, Ustad tier badge, jobs done with Amco,
   "Verified by Amco" mark, WhatsApp and "Book" buttons). "Book" opens the existing booking
   form, pre-filled with that painter.
2. "Ustad Club" section on the same page: how points are earned (each Amco tin bought, by
   size, recorded via the batch code on the tin or the dealer bill), tiers (Bronze, Silver,
   Gold, Platinum), each tier's rewards (cash-back per tin, tool kits, training, insurance,
   a higher place in the directory), and a points-to-rewards calculator ("I use about N tins
   a month → tier and rewards per year").
3. Referral bonus: a painter who brings a homeowner who buys Amco gets bonus points, and
   booking requests that come from the directory are passed to that painter. The page
   explains this; the join form sends it on WhatsApp.
4. Navigation: "Painters" in the site header; `dealers.html#painters` links to the new page;
   the home trust band links to it.

## Non-goals

- No painter logins or live points balances (the site has no server). Amco records points
  and tiers itself and updates the painter list. The page says that points are checked
  on WhatsApp.
- No payments.

## Anti-goals

- Showing invented people as if they were real Amco painters. Until Amco supplies its list,
  the directory uses clearly labelled sample entries (`data-placeholder`, "Sample listing"),
  added to the README placeholders table, like the dealer rows.
- Promising specific cash amounts Amco hasn't agreed to: reward values live in one data file,
  marked indicative, and are listed in the README placeholders table.

## Approaches considered

- Static data file + page module (chosen): painters, tiers and point rules in
  `website/assets/js/painters-data.js` (same pattern as `data.js` dealers), and the page logic
  in a module. No server, deploys as today, and Amco edits one file to update the list.
- Supabase-backed directory with painter logins. Rejected for launch: adds a backend,
  auth and moderation the site doesn't have; can come later behind the same data shape.
- Folding everything into `dealers.html`. Rejected: the page is already long, and painters
  need a page they can share on WhatsApp.

## Design

- Data: `painters-data.js` defines `AmcoPainters = { tiers, pointRules, referral, painters }`.
  A painter has `id, name, city, areas[], years, specialities[], tier, jobs, verified,
  code, photo|null, sample:true` (no personal phone numbers).
- Page: hero, filters, the directory grid, Ustad Club (tiers table, how to earn, calculator),
  referral bonus, join form (the existing WhatsApp form pattern, `data-whatsapp-form`),
  and an FAQ. Uses `tokens.css`, the existing components and the shared site chrome. Urdu
  labels follow the site's existing bilingual pattern. Works at 360 px.
- Tests: data shape and tier/calculator logic in `tests/` with `node --test`.

## Calls made after the builder check (owner to confirm)

- Forms: the booking and join forms move to `painters.html`. `dealers.html#painters` shrinks
  to a short teaser that links to the new page. "Book" on a card scrolls to the booking form
  and pre-fills the painter, in the page. A `painters.html?painter=<id>` link pre-fills it too.
- Referral: each listed painter has a code (their `id`, e.g. `USTAD-LHR-014`) and a share link
  `painters.html?ref=<code>`. The booking form has an optional "Painter who sent you"
  field, filled automatically from `?ref`. Amco credits the bonus when the job's tins are bought.
- Tiers: points count per calendar year, and the tier is set on the previous year's points.
  A painter can drop one tier at most per year. Points depend on tin size (quarter, gallon,
  drum). The calculator asks for tins a month and the usual size.
- Old club copy on `dealers.html` ("Points on every drum you scan", "An ID card your
  customers can verify") is rewritten to match these rules. The ID card stays, listed as
  a Gold reward.

- Bookings (owner's decision): every card's WhatsApp and Book button messages Amco's number
  (`CONFIG.whatsapp`), naming the painter and their code. Amco passes the job on. Painters'
  own numbers are not stored on the page.

## Left to the builder

- Visual details within the existing design system; reward numbers (indicative,
  placeholder); sample painter count (about 8 across Lahore, Karachi, Islamabad,
  Faisalabad, Multan).
