# Refactoring UI audit of the drill page

Tony: "read Refactoring UI to see what's wrong with the site too, but aim for extreme simplicity." Every fix below leans toward removing something. The page numbers are from the book (Wathan and Schoger, *Refactoring UI*).

| rule | what was wrong | fix |
|---|---|---|
| Labels are a last resort (p. 41) | The problem code showed twice: in the code bar and as a heading on the card. | Removed the card heading. It stays screen-reader-only as the section name. |
| Labels are a last resort | Cluck's hint carried an error-type tag ("sign"). That's for Tony, not the student, and it is already in the Copy payload. | Removed the tag. |
| Labels are a last resort; don't design too much (p. 13) | The empty page had an illustration and "Enter a problem code." | Removed both. The empty page is just the entry box. |
| Limit your choices (p. 24) | The subject dropdown duplicated the code prefix. It added a menu, icons, a cookie and a second way to get the code wrong. | Removed it. The code is typed in full. |
| Use fewer borders (p. 206) | The problem card had a 2px border on top of its sheet background, and the top bar had a bottom rule. | Removed both. The background change is enough. |
| Emphasize by de-emphasizing (p. 39) | The download button sat in the top bar next to the primary action, and showed on the empty page. | Removed (Tony: plain http, the bundle carries no problems, YAGNI). `tools/bundle.py` and `/stem-stuff.html` stay for after HTTPS. |
| Hierarchy is everything (p. 29): one primary action | Fine as is. The submit arrow is the only filled control; everything else is an outline `.btn`. | Kept. |
| Don't design too much | After a correct answer, the math preview under the field repeated the answer. | The preview clears once an answer is submitted. |
| Establish a spacing system (p. 60) | The gap from the question to the scratchpad was 32px plus the freeze padding. It read as a hole under short problems. | 16px (`--s4`). Rhythm: 12px inside the frozen layer, 16px between layers. |
| You don't have to fill the whole screen (p. 65) | On desktop the entry box was narrower than the column, so it floated left. | The box spans the content column (52rem). |
| Creating depth (p. 158) | — | Added one shadow, above the phone entry box. It is the only element floating over content there, and it needs to read as a layer. Justified by the fixed position. |

## Kept on purpose

- The "Scratchpad" label (Tony asked for it) and the A–E letter badges (the Copy payload records letters).
- The freeform placeholder "e.g. 9/2, sqrt(3), dne". It is the only place that shows the answer syntax. Candidate to drop if Tony wants zero text.
- The "Not quite. One more try." and "Correct" words next to their icons. They are candidates to become icon-only; I'm asking Tony first.
