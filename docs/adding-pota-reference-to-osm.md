# Add a POTA reference to OpenStreetMap

Connect an existing OpenStreetMap (OSM) park feature to its Parks on the Air (POTA) reference by adding the tag `communication:amateur_radio:pota`. The map reads this exact key.

> **In short:** choose the correct whole-park feature, add one POTA tag, review the upload, confirm it, and verify the published result.

## Choose a language

- [Español — Parque Natural Sierra de Hornachuelos (ES-0016)](adding-pota-reference-to-osm-es.md)
- [English — Tamar Valley National Landscape (GB-0150)](adding-pota-reference-to-osm-en.md)
- [Deutsch — Nationalpark Harz (DE-0069)](adding-pota-reference-to-osm-de.md)
- [Italiano — Campobrun Natura 2000 (IT-0459)](adding-pota-reference-to-osm-it.md)
- [Français — Parc naturel régional de Camargue (FR-2497)](adding-pota-reference-to-osm-fr.md)

## Before editing

You need an active OpenStreetMap account to upload changes. If you do not have one, [register for an OSM account first](https://www.openstreetmap.org/user/new), then sign in. The guides below use the browser-based iD editor.

Edit the existing OSM feature that represents the whole park. Check its name, extent, existing tags, and local mapping before changing anything. Protected areas may be mapped as a multipolygon relation or as a way. Add the tag to the park feature itself—not to every boundary member—and do not draw a new point or boundary just to represent a POTA reference. If the right feature is unclear, ask the local OSM community before editing.

The tag format is:

`communication:amateur_radio:pota=COUNTRY-CODE`

Keep all existing tags and geometry unchanged. Review the edit and changeset comment before uploading; an OSM upload is a public map edit.

## Screenshots

Each language guide includes a real, full-resolution OSM editor screenshot of the park used in that language. The captures show the whole feature selected with its published POTA tag visible; no unrelated examples, synthetic images, SVG mock-ups, or Overpass screenshots are used.
