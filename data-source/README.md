# Data Source

This folder is the preparation layer for the future admin page.

Current workflow:
- `data.js` remains the runtime file used by the app.
- `models.json` is the editable source for model records.
- `tools/extract-models.ps1` exports the current `models` array from `data.js` into `models.json`.
- `tools/build-data.ps1` rebuilds a full data file by injecting `models.json` back into the existing `data.js` template.

Important:
- every model in `models.json` should have a stable `id`
- this `id` is for admin editing, imports/exports, and avoiding collisions between models with the same visible name such as `Robin`, `Batman`, or `Joker`
- `tools/extract-models.ps1` automatically generates missing ids in the form `name-realname-base`

Recommended workflow:
1. Update `data-source/models.json`
2. Run `tools/build-data.ps1`
3. Review the generated file
4. Replace `data.js` only after validation

This keeps the live app stable while we prepare a cleaner data pipeline for the admin UI.
