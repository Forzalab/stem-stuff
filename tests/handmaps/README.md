# Hand map

`auto.tsv` is generated on every `run-all.sh --affected` call by `gen-auto.mjs`; it is gitignored, never edit it.
`hand.tsv` is add-only: same format, only the edges auto cannot see. `<full repo path>\t<unit> [unit ...]`.
`ALL` means every unit of the file's pipe (layout = all `.pw` units, logic = `unittest npm`).

Boot/head files reach the whole app, so the seed is `index.html` and `sw.js` -> `ALL` layout.
`app.js` is not seeded: auto maps it; a boot hunk -> ALL is ticket 09.
Test refs are found by basename text match; files reached only via computed paths are missed -> add them to hand.tsv.

Upkeep (04 point 9): update the map in the same PR that adds or moves a spec or a file.
A later lint flags a key that matches nothing, an unmapped code file, and an unlisted spec.
