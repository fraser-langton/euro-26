export const meta = {
  name: 'plan-trip',
  description: 'Research a trip end-to-end — flights, accommodation, things to do, and alternatives — then synthesize a planning report.',
  phases: [
    { title: 'Load', detail: 'read itinerary.json' },
    { title: 'Flights', detail: 'one flight-finder per flight leg' },
    { title: 'Stays', detail: 'accommodation-finder per stay' },
    { title: 'Activities', detail: 'activity-planner per stay' },
    { title: 'Alternatives', detail: 'pressure-test the whole plan' },
    { title: 'Synthesize', detail: 'compile the report' },
  ],
}

const LOAD_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    trip: { type: 'string' },
    people: { type: 'array', items: { type: 'string' } },
    stays: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          location: { type: 'string' },
          dateRange: { type: 'string' },
          days: { type: 'number' },
          coords: { type: 'array', items: { type: 'number' } },
          existingActivities: { type: 'array', items: { type: 'string' } },
          cost: { type: 'string' },
        },
        required: ['location'],
      },
    },
    flights: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          from: { type: 'string' }, to: { type: 'string' }, date: { type: 'string' },
        },
        required: ['from', 'to', 'date'],
      },
    },
  },
  required: ['trip', 'stays', 'flights'],
}

phase('Load')
const trip = await agent(
  `Read itinerary.json and AGENTS.md in this repo. Return the trip structured per the schema.
   - flights: walk the itinerary in travel order and emit one entry per flight-type movement as {from, to, date}. "from" = the place departed (the previous location, or home for the first). "to" = the flight's destination. Skip any zero-distance hop.
   - stays: for each stay item return location, dateRange, days (= nights), coords, existingActivities (its activities array if present, else empty), and a short cost string if a cost is present.
   - people: the people array (travellers).`,
  { agentType: 'general-purpose', phase: 'Load', schema: LOAD_SCHEMA }
)
if (!trip) return { error: 'Could not load itinerary.json' }

const party = (trip.people && trip.people.length) ? `${trip.people.length} traveller(s): ${trip.people.join(', ')}` : 'party size unknown — assume 2 adults'

phase('Flights')
const flights = await parallel((trip.flights || []).map(f => () =>
  agent(
    `Find flight options for this leg. Origin: ${f.from}. Destination: ${f.to}. Date: ${f.date}. Party: ${party}. Consider nearby airports and note them.`,
    { agentType: 'flight-finder', phase: 'Flights', label: `flight:${f.from}→${f.to}` }
  ).then(report => ({ leg: f, report })).catch(() => null)
))

// accommodation + activities per stay, run together
const stayResults = await parallel((trip.stays || []).map(s => () =>
  Promise.all([
    agent(
      `Find accommodation in ${s.location} for ${s.dateRange || 'the planned dates'} (${s.days || '?'} nights). Party: ${party}. Fit it to the trip context (e.g. near trailheads, festival venue, or a walkable centre as appropriate).`,
      { agentType: 'accommodation-finder', phase: 'Stays', label: `accom:${s.location}` }
    ).catch(() => null),
    agent(
      `Suggest things to do in ${s.location} over ${s.days || 'a few'} days. Anchors already planned (build around these, don't repeat): ${(s.existingActivities || []).join('; ') || 'none'}. Party: ${party}.`,
      { agentType: 'activity-planner', phase: 'Activities', label: `todo:${s.location}` }
    ).catch(() => null),
  ]).then(([accom, todo]) => ({ stay: s, accom, todo }))
))

phase('Alternatives')
const alternatives = await agent(
  `Pressure-test this whole trip and propose alternatives where warranted. Read itinerary.json and AGENTS.md for context. Trip summary: ${JSON.stringify({ trip: trip.trip, stays: (trip.stays || []).map(s => ({ location: s.location, dateRange: s.dateRange, days: s.days })), flights: trip.flights })}.`,
  { agentType: 'alternatives-scout', phase: 'Alternatives' }
)

phase('Synthesize')
const report = await agent(
  `Write a clear trip-planning report in Markdown for "${trip.trip}". Organise it as:
   1. **Overview** — the route and dates in one paragraph.
   2. **Flights** — per leg, the top 1–2 options and a pick, with the price caveat.
   3. **Where to stay** — per stay, the top pick + one runner-up.
   4. **What to do** — per stay, a tight bulleted shortlist (mark don't-miss).
   5. **Alternatives worth considering** — the strongest swaps, or "plan is solid" if so.
   6. **Open questions / to book now** — anything urgent (festivals, peak-August accom).
   Be concise and scannable. Preserve price/date caveats. Here is the research to synthesize:

   FLIGHTS:
   ${JSON.stringify(flights)}

   STAYS (accommodation + activities):
   ${JSON.stringify(stayResults)}

   ALTERNATIVES:
   ${alternatives}`,
  { phase: 'Synthesize' }
)

return { report, research: { flights, stayResults, alternatives } }
