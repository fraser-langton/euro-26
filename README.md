# Euro '26

Local, single-file trip itinerary viewer. Map + timeline + calendar + budget over one
`itineraries.json`. No install, no build.

## Run

```
python3 -m http.server 8000
```

Open http://localhost:8000/itinerary.html

## Edit the trip

Everything lives in `itineraries.json`. Add a place = add a `stay` item; add things to do =
append to that stay's `activities`; track cost = add a `cost` block.

Full data model, design notes, and extension points: **[AGENTS.md](./AGENTS.md)**.
