# Phase 4: build the map app

This phase builds a mobile web app that shows every mapped outlet and finds outlets near the visitor. It works in Safari on iOS and Chrome on Android.

The app reads only `public/data/krisplus-outlets.geojson`. You can start this phase with a partial export.

## Tasks

### 4.1 Load and type the data

1. Add a GeoJSON feature schema to `shared/schema.ts`, built from the outlet schema.
2. In `src/routes/index.tsx`, fetch `/data/krisplus-outlets.geojson` in the route loader and parse it with the schema. Show an error state with a retry button if the fetch or the parse fails.
3. Read `generated_at` from the file and show it in the footer as "Data collected <date>".

Done when the index route renders the feature count from the real file.

### 4.2 Put the search state in the URL

Define the index route's search params with a Zod schema: `q`, `category`, `minRate`, `milesPay`, `lat`, `lng`, `radius`, and `outlet`. Every filter control writes to the URL, and the view reads only from the URL.

Done when reloading the page or opening a copied link restores the same search, filters, origin, and selected outlet.

### 4.3 Show the map

1. Add `leaflet`, `react-leaflet`, and a marker clustering plugin. Pin releases at least two weeks old.
2. Render the map on the client only, with `ClientOnly` from `@tanstack/react-router` or a lazy import. Leaflet needs `window`.
3. Use OneMap's Default tiles, `https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png`. Set the zoom range and attribution that Phase 0 confirmed.
4. Cluster the pins. Tapping a pin selects that outlet. Tapping a cluster zooms in.
5. Centre on Singapore by default, at about `[1.3521, 103.8198]`.

Done when every feature appears as a pin or inside a cluster, and the map pans smoothly on a mid-range phone.

### 4.4 Lay out the page for phones

1. Fill the screen with the map, sized with `100dvh`.
2. Put a search bar and filter chips at the top. Put a results sheet at the bottom with three heights: collapsed, half, and full.
3. Pad fixed bars with `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
4. Make every tap target at least 44 by 44 CSS pixels.
5. On screens wider than 768 px, show the results as a side panel.

Done when the layout works at 375 by 812 and at 1280 by 800, with no horizontal scroll.

### 4.5 Search the outlets

Match the query against `merchant_name`, `outlet_name`, `geocode_building`, `geocode_matched_address`, and `geocode_postal_code`. Lowercase both sides, and remove punctuation and the spaces around `@`, so "313 somerset" finds "313@Somerset". Rank exact name matches first.

Done when tests show that "guoco" finds the Cedele Guoco Tower outlet and "078881" finds the same outlet.

### 4.6 Find outlets near the visitor

1. Add a **Near me** button. It calls `navigator.geolocation.getCurrentPosition` with a 10 second timeout and writes `lat` and `lng` to the URL.
2. If the visitor denies location, or the browser has none, open the manual location box. Explain that location needs HTTPS.
3. The manual box sends the text to OneMap search from the browser. Show up to 5 candidates and set the origin to the one the visitor picks.
4. Compute haversine distance from the origin to each outlet. Sort the results by distance and label each one as "1.2 km straight-line".
5. Add radius chips for 500 m, 1 km, 2 km, and 5 km. Draw the origin and the radius on the map.

Done when a test with a fixed origin returns outlets in a known order with literal distances, and "Near me" works on an HTTPS URL on a phone.

### 4.7 Filter the outlets

1. **Category.** One chip for each category in the data.
2. **Earn rate.** Chips such as "2+ miles per SGD", built from the distinct rates in the data. An outlet with a `null` rate shows "Rate unknown" and only leaves the list while a rate chip is on.
3. **Pay with miles.** One toggle. It keeps outlets with `accepts_miles_payment: true` only. `null` never counts as yes.

Done when each filter has a test that includes outlets with `null` values.

### 4.8 Show outlet details

Selecting an outlet opens a detail view in the sheet. It shows:

- The merchant name, the outlet name, and the category.
- The earn rate, from `earn_rate_raw`, and the pay-with-miles status, with "Unknown" for `null`.
- The location from OneMap, labelled "Location from OneMap, building level".
- The straight-line distance, when an origin is set.
- Links to the Kris+ partner page, Google Maps directions (`https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`), and Apple Maps directions (`https://maps.apple.com/?daddr=<lat>,<lng>`).
- The time the record was collected.

Done when every field with a `null` value shows "Unknown" or is hidden, and never shows `0`, `false`, or an empty string.

### 4.9 Add the notices

1. Footer: "Unofficial. Not affiliated with Singapore Airlines or Kris+." Add the data collection date.
2. Map attribution as OneMap requires.
3. Use no Kris+ logo or brand colours unless Phase 0 cleared them.

Done when the notices show on phone and desktop layouts.

### 4.10 Test on real browsers

1. Run `pnpm build` and serve the output over HTTPS. A tunnel to your laptop works.
2. Test on iOS Safari and Android Chrome. Cover a location prompt allowed and denied, a manual postal code, a filter combination, and opening a shared link.
3. Run a Lighthouse mobile audit.

Done when both browsers pass every case, and Lighthouse reports accessibility 90 or higher.
