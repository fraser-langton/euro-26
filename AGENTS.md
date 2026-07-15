# Euro '26 — trip itinerary viewer

Single-file, local, zero-build web app to view and organise one trip. No framework, no
bundler, no dependencies to install. Data lives in `itinerary.json`; the UI is one static
`itinerary.html`.

## What it is

A personal trip planner for one journey (Melbourne → Rome → Dolomites → Malta → Cairo →
home, Aug 2026). Three modes over the same data:

- **Journey** (default) — sticky map on the left, scrollable itinerary on the right. The two
  are linked: scrolling a place into view flies the map to it and highlights its pin. The
  route is drawn per travel-mode (see Design).
- **Calendar** — month grid; stays as colored bands, flights/drives as day events.
- **Budget** — cost table + totals + per-person split, any currency → base currency.

## Files

| File | Role |
|------|------|
| `itineraries.json` | **Manifest** of selectable itineraries (dropdown). Lists `{id, name, file}` + `active`. |
| `itinerary.json` | Default itinerary data ("Mike"). Source of truth for that trip. |
| `itinerary.html` | The whole app — HTML + CSS + JS inline. Reads the manifest then the selected file via `fetch`. |
| `AGENTS.md` / `CLAUDE.md` | This doc (CLAUDE.md points here). |
| `README.md` | Human quick-start. |

### Multiple itineraries

`itineraries.json` powers the dropdown in the header:

```jsonc
{
  "active": "mike",
  "options": [ { "id": "mike", "name": "Mike", "file": "itinerary.json" } ]
}
```

Each option's `file` is a standalone itinerary file using the exact schema below. **To add an
alternative:** create `itinerary.<id>.json` with the same shape, then append an option row.
The app loads `active` first (or the user's last pick, saved in `localStorage["trip"]`);
switching re-fetches the file and rebuilds the map + all views. Planning agents/workflows
still target `itinerary.json` unless told otherwise.

## Run

`fetch` of a local file fails over `file://` (browser CORS), so serve the folder:

```
python3 -m http.server 8000
```

Open http://localhost:8000/itinerary.html . Any static server works.

## Data model (`itinerary.json`)

Top level:

```jsonc
{
  "trip": "Euro '26",
  "departDate": "2026-08-03",              // drives the countdown
  "home": { "name": "Melbourne", "coords": [lat, lng] },
  "people": ["Me"],                        // budget split roster
  "currencies": { "base": "AUD", "rates": { "EUR": 1.65, "EGP": 0.033, "AUD": 1 } },
  "itinerary": [ ...items ]                // ordered; order = the route
}
```

Each `itinerary` item is either a **stay** or a **movement**. `type` decides which:

**Stay** (`"type": "stay"`) — a place you sleep. Rendered as a rich card + map pin.
```jsonc
{
  "dateRange": "2026-08-04 to 2026-08-06",   // start to end; nights = end - start
  "location": "Rome",
  "activity": "Stay in Rome",                 // one-line summary
  "type": "stay",
  "coords": [41.9028, 12.4964],               // map pin
  "activities": ["Colosseum", "Vatican"],     // CHILDREN — things to do here (a list)
  "highlight": "Tre Cime di Lavaredo",        // optional headline sight
  "highlightCoords": [lat, lng],              // optional; drawn as a gold dot
  "driveTo": true,                            // optional; you drove here (see route logic)
  "cost": { "amount": 1200, "currency": "EUR", "paid": true, "split": "all" }
}
```

**Movement** (`"type": "flight"` or `"type": "transport"`) — a hop between places.
```jsonc
{ "date": "2026-08-06", "activity": "Fly to Venice", "type": "flight", "coords": [45.44, 12.31] }
```
- `coords` on a movement = its **destination**. The map builds the route from the ordered
  chain of coord-bearing items and picks the path style from each segment's `type`.
- Split multi-mode legs into separate items (e.g. "drive to Venice" + "fly to Malta"), so
  each segment draws its own mode.

Dates: `date` (single day) or `dateRange` (`"A to B"`). The parser tolerates messy ranges
like `"2026-08-16/17 to 2026-08-19"` (takes the part before `/`). See `span()` in the JS.

`cost.split`: `"all"` (everyone in `people`), a number (first N people), or a name list
`["Me","Sam"]`. Amounts convert to `currencies.base` via `rates`.

## Design

**One living canvas, not flat tabs.** The core idea: map and itinerary are a single synced
view, and the trip reads as a story you scroll. Earlier flat/tabbed layouts were rejected.

- **Scroll-linked map.** `IntersectionObserver` on each place card (`observe()`); the card
  nearest center becomes active → `map.flyTo` its coords, opens the pin, marks the top
  progress dot. Root is the feed, `rootMargin` shrinks the trigger band to mid-screen.
- **Per-mode route paths** (`drawRoute()`):
  - **Flight → curved geodesic arc.** `drawFlight()` slerps between the two points on a unit
    sphere (64 steps); rendered on web-mercator it bows like a real flight path. Dashed
    purple, ✈ at the midpoint.
  - **Drive → real roads.** `drawRoad()` calls the **OSRM public router**
    (`router.project-osrm.org`) for driving geometry and draws the actual road polyline.
    Solid gold. **Falls back to a dashed straight line** if the request fails (offline).
  - Segment mode = the arriving item's `type`; a `stay` with `driveTo:true` counts as a
    drive, otherwise a stay is reached by flight. Zero-length hops (arrive→stay, same
    coords) are skipped via `same()`.
- **Color identity per stay.** Each stay gets a color from `PLACE_COLORS`, reused across its
  map pin, card top bar, progress dot, and calendar band — so the eye ties them together.
- **Glanceable header.** Journey progress ribbon (stops as a line; done/current/active
  states), live countdown, and a budget donut (paid %) in the hero.
- **Theme-aware.** CSS variables with a `prefers-color-scheme: light` override. Map uses
  CartoDB dark tiles.

## Architecture of `itinerary.html`

Plain JS, no build. Flow: `boot()` fetches JSON → assigns stay colors → renders ribbon,
countdown, map → `setMode("journey")`. Mode switch swaps what the `#feed` shows
(`renderFeed` / `renderCal` / `renderFin`) and hides/shows the map via a body class.

Key functions: `span()` (date parsing), `renderFeed()` + `placeCard()` + `connector()` +
`hero()` (journey feed & gap detection), `observe()` (scroll↔map link), `initMap()` +
`drawRoute()` + `drawFlight()` + `drawRoad()` (map), `renderCal()`, `renderFin()`.

## Gotchas

- **Network:** map tiles (CartoDB), OSRM routing, and Leaflet (unpkg CDN) all need internet.
  Feed/calendar/budget structure works offline; only the map degrades.
- **OSRM public demo** is rate-limited and sometimes slow; the straight-line fallback keeps
  routes visible regardless.
- Keep `itinerary` items in **travel order** — order defines the drawn route and the ribbon.
- `people` empty or costs absent → Budget shows an empty-state with the schema; that's normal.

## Extending

- **New stop:** add a `stay` item (with `coords`, `activities`) at the right position, plus a
  movement item before it (`type` + destination `coords`) if the mode should show on the map.
- **New activity in a stay:** append a string to that stay's `activities`.
- **Costs/split:** add `cost` to any item; adjust `people` and `currencies.rates`.
- Ideas not yet built: per-leg distance/duration labels (OSRM returns them), animated plane
  along the arc, per-day scheduling inside a stay, `.ics`/print export, destination photos,
  weather per stop.
