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

## Installing

At the prompt of a Claude Code terminal session:

```
/plugin install lingo --marketplace rileybusche/lingo
```

Answer `y` to add the marketplace, then choose the **user** scope so it loads in every session,
and set "Show on turn" (on by default). Installed from a terminal, it also loads in the desktop
app's Code tab, which cannot run the command itself.

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
| `/lingo-export [file]` | Saves your progress, every language's, to a file (`~/lingo-progress-<date>.json` by default) |
| `/lingo-import <file>` | Loads progress from a file, merged with what is saved |

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

## Credits and licences

- The code is MIT: [LICENSE](LICENSE).
- The decks (`plugin/data/*/deck.ts`) are **CC BY-SA 4.0**: [plugin/data/LICENSE](plugin/data/LICENSE). They are adapted
  from [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by Hermit Dave (content
  CC BY-SA 4.0). Changes: forms grouped into dictionary words, re-ranked, cut to the top 1,000;
  meanings, gender, articles and example sentences added, written fresh.
- FrequencyWords is counted from the OpenSubtitles 2018 corpus
  ([opensubtitles.org](http://www.opensubtitles.org/)): P. Lison and J. Tiedemann, 2016,
  "OpenSubtitles2016: Extracting Large Parallel Corpora from Movie and TV Subtitles", in
  *Proceedings of the 10th International Conference on Language Resources and Evaluation
  (LREC 2016)*. No subtitle text is included.
