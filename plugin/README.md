# Lingo

A Claude Code mod that drills vocabulary while Claude works. When Claude starts a turn, a
multiple-choice card comes up in a band above the prompt or in a side pane; you answer with a
click or 1–4. Learn Spanish, French, Italian or Brazilian Portuguese: the 1,000 most common words
of each, in chunks of 50.

Words come back by spaced repetition (FSRS, the scheduler Anki uses): missed words within minutes,
known ones after days, then weeks. Up to 10 new words a day; with nothing due, an extra-practice card.
A tag after the word says why it is there (`new`, `↻ again`, `practice`). A new word is purple and
underlined; "show meaning" shows it, and that card then counts toward nothing (no streak,
score or answer counts) and comes back a minute later to be tried unaided. 🔊 says the word.

Each answer earns XP (a level shows in the pane's footer, `×1.5` while you're five right in a row);
10 cards a day keep a daily streak, shown as `🔥 3` in the pane's footer (and the terminal's status
line), with a freeze earned each week. XP, level, the streak and badges are shared across languages;
each language keeps its own words and chunks.

The mod never calls a model. The decks are files in this folder, built once.

## Languages

| Language | Voice that says the word | |
| --- | --- | --- |
| Spanish | Paulina (Mexico) or Mónica (Spain) | available |
| French | Thomas or Jacques (France), or Amélie (Canada) | available |
| Italian | Alice | available |
| Portuguese (Brazil) | Luciana (Brazil) or Joana (Portugal) | available |
| German | | planned |
| Japanese | | planned |
| Korean | | planned |
| Norwegian | | planned |

Switch between them from the ⚙️ Menu (**Language: …**). Each keeps its own words and chunks; XP,
level, the streak and badges are shared. The voices are macOS's own; if one is not installed, your
system's voice says the word instead.

## Installing

In Claude Code (the desktop app's Code tab, or a terminal session), type this at the prompt,
starting with `!`:

```
! claude plugin install lingo --marketplace https://github.com/rileybusche/lingo.git --config showOnTurn=true
```

The `!` runs it as a shell command. It adds the lingo marketplace and installs Lingo for every
session; start a new session and it is there.

It needs the `claude` command. If the reply is "command not found", install it once from a
terminal (Terminal.app on a Mac):

```
curl -fsSL https://claude.ai/install.sh | bash
```

Then restart Claude Code and run the line above again.

## Updating

At the Claude Code prompt, one line at a time:

```
! claude plugin marketplace update lingo
```

```
! claude plugin update lingo@lingo
```

```
/reload-plugins
```

The first fetches the latest release, the second installs it, and `/reload-plugins` loads it into
the session you are in. Your progress is kept.

The first time it opens, it asks which language you want to learn, then whether to start from the
beginning or take a 20-question placement test that finds where to start.

## Commands

| Command | What it does |
| --- | --- |
| `/lingo` | Opens the card in your chosen view and shows it on every turn |
| `/lingo off`, `/lingo on` | Stops or restarts the card on every turn (an hourly reminder while it is off) |
| `/lingo-stats` | Your daily streak, level, the last 30 days, accuracy and the words you miss most; opens the Stats page |
| `/lingo-chunk` | Which chunk of 50 words you are on and how many you have learned; opens Word Chunks |
| `/lingo-view pane`, `/lingo-view band` | Chooses the side pane or the band above the prompt |
| `/lingo-export` | Saves your progress, every language's, to `lingo-progress.json` in the folder the session runs in (always that name; move it from there) |
| `/lingo-import [file]` | Loads progress, merged with what is saved: `lingo-progress.json` in the session's folder, or the file you name by its full path |

## The ⚙️ Menu

At the top right of the pane:

| Item | What it is |
| --- | --- |
| **Language: …** | The language you are learning; switch to another here |
| **Word Chunks** | Every chunk's progress (learned, seen, total); open one to see its words, or practice it alone |
| **Flashcards** | Study only: a card that turns to its English on a click, at random or by chunk |
| **Placement test** | 20 questions that find which chunk to start at |
| **Stats** | Streak, level, the last 30 days, a 13-week heatmap, badges, and **drill these** for the words you miss most |
| **Settings** | Your own limits (new words a day, the daily goal, what opens the next chunk, target recall), sounds, the voice that says the word, and whole-deck mode |
| **Switch to band view** | Moves the card to the band above the prompt |

## Examples

1. **Learn while Claude works.** Ask Claude anything, say "explain this function". A card comes up
   while it works: click an answer, or press 1–4. Press 🔊 to hear the word.
2. **Check your progress.** Type `/lingo-stats`: your daily streak, level and accuracy, and the
   Stats page with the last 30 days and the words you miss most. Press **drill these** to practise them.
3. **Study a chunk with flashcards.** ⚙️ Menu → **Flashcards**, pick a chunk from the dropdown, and
   click the card to turn it to its English.
4. **Move to another computer.** Type `/lingo-export`, copy `lingo-progress.json` across, and on
   the other computer type `/lingo-import /full/path/to/lingo-progress.json`.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `command not found` when installing | The `claude` command is not installed: see [Installing](#installing). |
| No card comes up | Run `/lingo`. The switch at the top left of the pane (in the band, the one before **move to pane**) must be **● on** for a card on every turn. |
| A new version did nothing | Run `/reload-plugins`, or start a new session. |
| A toast says a voice isn't installed | Your system's own voice says the word instead. To get the named voice on a Mac: System Settings → Accessibility → Spoken Content → System voice → Manage Voices. |
| No 🔊 | Speech isn't available on this computer, so 🔊 and the voice switch are hidden. |
| Plain buttons instead of cards | VS Code and the mobile app draw no card grid; the answers are buttons there, and work the same. |
| `/lingo-import` says it could not read the file | Give the file's full path, without `~`. |

## Privacy

Lingo keeps your progress on your computer, in Claude Code's own storage for plugins. It makes no
network requests, sends nothing anywhere, and never reads your conversation: it only notices when
Claude starts and stops working. The one file it writes is `lingo-progress.json`, when you run
`/lingo-export`.

## Support

Report a problem or ask a question in this repository's
[Issues](https://github.com/rileybusche/lingo/issues).

## Credits and licences

- The code is MIT: [LICENSE](LICENSE).
- The decks (`data/*/deck.ts`) are **CC BY-SA 4.0**: [data/LICENSE](data/LICENSE). They are adapted
  from [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by Hermit Dave (content
  CC BY-SA 4.0). Changes: forms grouped into dictionary words, re-ranked, cut to the top 1,000;
  meanings, gender, articles and example sentences added, written fresh.
- FrequencyWords is counted from the OpenSubtitles 2018 corpus
  ([opensubtitles.org](http://www.opensubtitles.org/)): P. Lison and J. Tiedemann, 2016,
  "OpenSubtitles2016: Extracting Large Parallel Corpora from Movie and TV Subtitles", in
  *Proceedings of the 10th International Conference on Language Resources and Evaluation
  (LREC 2016)*. No subtitle text is included.
