export const meta = {
  name: 'enrich-activities',
  description: 'Suggest things to do for every stay in the trip and return drop-in activities arrays for itineraries.json.',
  phases: [
    { title: 'Load', detail: 'read stays from itineraries.json' },
    { title: 'Suggest', detail: 'activity-planner per stay' },
  ],
}

const STAYS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    stays: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          location: { type: 'string' },
          days: { type: 'number' },
          existingActivities: { type: 'array', items: { type: 'string' } },
          highlight: { type: 'string' },
        },
        required: ['location'],
      },
    },
  },
  required: ['stays'],
}

const RESULT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    location: { type: 'string' },
    activities: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['location', 'activities'],
}

const tripId = (args && args.tripId) || 'mike'

phase('Load')
const loaded = await agent(
  `Read itineraries.json. It holds multiple trips under a "trips" array, each with an "id". Find the trip with id "${tripId}" (fall back to the "active" one if not found). Return every stay-type item in that trip's itinerary as {location, days (nights), existingActivities (its activities array or empty), highlight (if present)}.`,
  { agentType: 'general-purpose', phase: 'Load', schema: STAYS_SCHEMA }
)
if (!loaded || !loaded.stays) return { error: 'Could not load stays' }

phase('Suggest')
const results = await parallel(loaded.stays.map(s => () =>
  agent(
    `Suggest things to do in ${s.location} over ${s.days || 'a few'} days. Anchors already planned (build around, don't repeat): ${[s.highlight, ...(s.existingActivities || [])].filter(Boolean).join('; ') || 'none'}. Return a merged, de-duplicated "activities" array of short strings ready to drop into itineraries.json (keep the existing ones, add the best new ones, ~5–8 total), plus a one-line "notes".`,
    { agentType: 'activity-planner', phase: 'Suggest', label: `todo:${s.location}`, schema: RESULT_SCHEMA }
  ).catch(() => null)
))

return { stays: results.filter(Boolean) }
