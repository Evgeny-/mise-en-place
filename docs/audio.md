# Mise en Place — audio

Everything you hear is synthesized in the browser (Web Audio API). There are no audio files.

## The identity

**Kitchen foley played like an instrument, and a house band in every restaurant.**

- The sound effects are the kitchen itself: knocks on a wooden counter, ingredients settling on a
  ceramic saucer, a pan sizzle, a spoon tapping a wine glass, a wooden crate lid creaking open, a
  cork popping, coins dropping into the tip jar, and a real steel desk bell on the pass. They are
  physically modelled instead of being beeps: wood is a short noise burst ringing a few broad
  resonances, glass, ceramic and the bell are sets of inharmonic partials that beat slowly (as
  real struck objects do), and the sizzle and fizz are sparse crackle. They are warm and soft by
  design: no square waves and no FM blips, highs rolled off, every sound in its own small room.
- Melodic sounds (prep tings, stars, the hint, unlock) are tuned glasses. Tunes that climb (a
  burger stacked layer by layer, preps chained in one move) climb a major pentatonic scale, so
  they are always sweet together.
- The guests have voices. A tiny formant synthesizer gives each animal its own happy noise after
  eating ("mm-HMM!" bear, "mrrp!" cat, "yip-yip!" fox, "eep!" bunny, contented "mmm~" panda,
  "rib-bit!" frog, "oink!" pig, chittery raccoon), and its bites are sized to the animal. When the
  kitchen gets stuck, the guests murmur "uh-oh".
- The music is a band that belongs to the restaurant: a mandolin-and-accordion waltz in the
  trattoria, a 50s doo-wop ballad on the diner jukebox, a son in the taquería, a Paris musette in
  the boulangerie, and so on. Plucked and struck instruments are physically modelled
  (Karplus–Strong strings, additive piano), the rest are a handful of oscillators. When you win,
  the band of the kitchen you are in plays a short flourish after the cork and the bell.
- Nothing is shared with Pixel Picnic: its marimba/kalimba/bell themes and blip SFX are gone.

## Files

| file | what it does |
| --- | --- |
| `src/audio/audio.ts` | the engine: graph, `audio.play`, music start/stop/fades, ducking, volumes, idle-time baking |
| `src/audio/sfx.ts` | every sound effect's recipe (baked once per variant into a stereo buffer) |
| `src/audio/dsp.ts` | sample-level synthesis: Karplus–Strong strings, modal (struck) objects, filtered noise, formant voice, room reverb |
| `src/audio/band.ts` | instruments: baked plucks/percussion, live reeds, voices, bowed and blown lines |
| `src/audio/theory.ts` | melody/chord notation, voicings, scale steps, melodic variation |
| `src/audio/song.ts` | the song runner: form, sections, passes, humanised timing |
| `src/audio/songs.ts` | the eight kitchen bands (tunes and arrangements) |
| `src/audio/render.ts` | offline rendering, loudness measurement (BS.1770), WAV encoding |
| `review/audio.html` | the audition page |
| `scripts/render-audio.mjs` | renders WAV previews and a metrics report |

API used by the game (unchanged): `audio.unlock()`, `audio.play(name, { pitch, volume, pan, voice })`,
`audio.startMusic(index)`, `stopMusic`, `setSfxVolume`, `setMusicVolume`, `duck`, `level()`.

## Sound effects

| name | the sound | where |
| --- | --- | --- |
| `button` | a wooden spoon on a small board, round and hollow | every menu button |
| `tap` | a fingertip on the counter | SFX volume slider |
| `whoosh` | a tea towel flick | a dialog opens |
| `invalid` | two muffled knocks, the second lower: a gentle "nuh-uh" | a column can't be taken, locked helpers, not enough coins |
| `take` | a light tick and an airy upward "fwip" | an ingredient lifts from its column |
| `land` | a soft pat on the board and a quiet clink of the saucer (`pitch` = pentatonic step) | an ingredient lands on the counter |
| `tile` | little wooden tiles dropping into trays (panned by column) | level start |
| `plop` | a soft "bup" that climbs a step per layer (`pitch`) | burger layers stacking, taco fillings |
| `prep` | a toss, a pan sizzle and two glass tings (`pitch` 0–3 climbs) | two items combine into a prep |
| `fold` | a tortilla flap and a glint | a taco folds |
| `lid` | a creak, a hollow wooden clack, two soft glints | a crate lid opens |
| `bell` | a steel desk bell: inharmonic beating partials, clapper tick, plunger thunk | a dish comes together at the pass |
| `nom` | a little crunch and the mouth closing, sized to the guest (`voice`) | each bite |
| `yum` | the guest's own happy noise (`voice` = guest kind) | after eating, with the hearts |
| `undo` | the take, backwards: air rushing in, then a soft tock | undo |
| `hint` | a spoon taps a glass twice | hint |
| `booster` | a board slides in, a plate lands, three tings | extra counter spot |
| `stuck` | the guests murmur "uh-oh", doubled softly on two clay bowls | the kitchen is stuck |
| `win` | a cork pops, bubbles fizz, the bell rings twice, then the kitchen's band plays a flourish | level won |
| `star` | a struck glass, higher for each star (`pitch` 0–2) with a wisp of sparkle | win dialog stars |
| `coin` | coins into the tip jar | coins awarded / spent |
| `unlock` | glasses chiming upward over a warm swell | new dish/rule, helper unlocked, hard level |
| `pop` | a small cork (spare) | — |
| `lose` | four descending glasses (spare: the game has no losing) | — |

Each sound has up to three baked takes and every play adds a small random pitch and level wobble,
so repeated sounds never machine-gun. Frequent sounds have a minimum gap between plays (`RATE`).
The bell keeps its exact pitch (it's the same bell on the pass every time); only its strike varies.

## The kitchen bands

Each band has an intro, an A section (the tune), a B section (the bridge), and a quiet "break"
with only the rhythm section and a few improvised notes, a breathing space for thinking. The form
loops (`intro A B A break`, then from A again, or similar). On every repeat the arrangement changes:
who plays the tune rotates, harmony lines and doublings come and go, percussion is added on some
passes, and the tune itself is varied a little (passing notes, turns, dropped notes) so it never
repeats exactly. Fills come where the tune rests at the end of phrases (scale runs, piano answers,
bass walk-ups, drum rolls, zither glissandi into the next section). Timing (a few ms) and velocity
are humanised on every note.

| # | kitchen | the band |
| --- | --- | --- |
| 0 | **Trattoria** · *Sunday sauce* | F major waltz, 132 bpm. Bass "oom", accordion "pah-pah", mandolin tune with tremolo on long notes. B in D minor sung by the accordion while the guitar takes the pah-pahs. Repeats: accordion lead with mandolin a third below; classical guitar lead; tambourine shimmer. Break: guitar arpeggios and stray mandolin phrases. |
| 1 | **Burger Joint** · *jukebox ballad* | Bb doo-wop ballad in 12/8, 74 bpm: I–vi–IV–V. Soft triplet piano chords, upright bass with pickups, "ooh" singers (they open to "aah" in the bridge), brushes, finger snaps on 2 and 4 on repeats. Tune on a 50s lap steel with slides, vibrato and slapback; the piano takes it on some passes and answers in the gaps. |
| 2 | **Taquería** · *sol y cilantro* | D major son in 6/8 with 3/4 bars (sesquiáltera): strummed guitar, guitarrón, shaker, palmas. Tune on a requinto with a second guitar a third below (the Mexican way), or on the harp doubled in octaves; a jarana's bright up-strokes on repeats. |
| 3 | **Boulangerie** · *croissant swing* | G major Paris swing, 112 bpm: gypsy guitar "la pompe", bass in two (walking in the bridge), brushes. Tune on a three-reed musette accordion (the wet, shimmering Paris sound); a gypsy guitar takes it on some passes over a soft musette pad. |
| 4 | **Wok Station** · *jade wok* | D major pentatonic, 96 bpm: pipa (tremolo on long notes) and erhu (slides) share the tune, guzheng off-beat dyads or flowing arpeggios and low strings for bass, woodblock, a small drum, a soft gong at section starts, glissandi into each section. |
| 5 | **Spice Market** · *saffron steps* | D hijaz on a maqsum groove (DUM tek - tek DUM - tek -), 92 bpm: darbuka, harmonium drone, bass on the doums. Tune on the oud (tremolo) and ney (breathy, sliding); qanun runs into each phrase, riq in the bridge. Intro is a little oud taqsim. |
| 6 | **Cafeteria** · *lunch-break bossa* | C major bossa nova, 118 bpm: nylon guitar comping and cross-stick on the bossa pattern, bass on 1 and the "and" of 2, shaker, soft kick, electric piano chords. Tune on flute or electric piano (they swap and harmonise). |
| 7 | **Dim Sum House** · *steam & jasmine* | G pentatonic teahouse, 72 bpm: sheng holding soft chords, guzheng flowing arpeggios, a wooden clapper on the bar, finger cymbals every eight bars. Tune on the dizi (bamboo flute with membrane buzz) or the guzheng. |

`KitchenTheme.music` in `src/render/themes.ts` is the index in this table (`MUSIC` in
`songs.ts` maps kitchen ids to it). Kitchens 3–7 are ready for the future worlds.

### Win flourishes

Trattoria: a mandolin run into a tremolo F chord over the accordion. Burger Joint: a triplet piano
run, a Bb6 chord, the singers' "ooh-aah" and a steel slide. Taquería: a rasgueado and the two
guitars in thirds. Boulangerie: a musette run and a shaken G6 chord. Wok Station: a guzheng
glissando and pipa tremolo over a soft gong. Spice Market: a qanun run up the hijaz scale and an
oud tremolo. Cafeteria: a Cmaj9 electric-piano arpeggio and a flute run. Dim Sum House: a guzheng
glissando, a dizi trill and the sheng.

## Levels

Calibrated with `scripts/render-audio.mjs` at the game's default volumes (SFX 80 %, music 50 %),
through the real output chain. Music: integrated loudness (BS.1770, gated) over 120 s; every
kitchen has a `trim` so they match.

| kitchen | integrated LUFS (120 s) | first 30 s | loudest 400 ms | peak, default volume | peak, music at 100 % | trim |
| --- | --- | --- | --- | --- | --- | --- |
| Trattoria | −28.1 | −28.3 | −22.9 | −12.2 dBFS | −7.4 | +2.1 dB |
| Burger Joint | −28.0 | −27.0 | −24.0 | −14.3 | −9.6 | −1.0 |
| Taquería | −28.0 | −28.2 | −23.4 | −11.3 | −5.2 | −1.1 |
| Boulangerie | −28.0 | −27.9 | −24.4 | −10.9 | −7.5 | +0.7 |
| Wok Station | −28.0 | −28.4 | −22.1 | −9.9 | −3.9 | +1.8 |
| Spice Market | −28.0 | −28.4 | −23.2 | −11.1 | −5.6 | +1.2 |
| Cafeteria | −28.0 | −28.1 | −24.6 | −13.5 | −7.4 | −2.9 |
| Dim Sum House | −28.0 | −27.7 | −22.6 | −12.0 | −7.4 | +0.3 |

At music volume 100 % everything is 6 dB louder (−22 LUFS). Inside each band (`--stems`, LUFS of
each instrument's channel): the lead sits 1–3 dB under the whole mix, the bass 2–7 dB under the
lead, percussion 6 dB under (the darbuka groove in the Spice Market) to 9–14 dB under elsewhere.

SFX at the default volume (loudest 50 ms RMS / sample peak, dBFS):

| group | sounds | L50 | peak |
| --- | --- | --- | --- |
| ambient ticks | `tap` −30.2, `tile` −31.7, `whoosh` −33.3 | −30…−33 | −14…−22 |
| gameplay | `take` −26.9, `land` −23.8, `plop` −23.6…−24.4, `nom` −25.4…−26.0, `button` −25.5, `undo` −25.6, `fold` −23.8, `pop` −23.2 | −23…−27 | −11…−18 |
| moments | `invalid` −21.9, `lid` −22.1, `prep` −18.4…−19.4, `bell` −18.5, `yum` −18.3…−19.6, `hint` −18.9, `booster` −18.6, `stuck` −20.2, `coin` −19.7, `lose` −20.0 | −18…−22 | −6…−14 |
| rewards | `star` −16.9…−17.3, `unlock` −17.0, `win` −15.7…−16.3 (all eight kitchens' flourishes within 0.6 dB) | −16…−17 | −6…−10 |

Nothing clips; whole-file DC offset is at most 3·10⁻⁴ (−70 dBFS, `fold`).

SFX levels are set in their recipes (`finish(levelDb, …)` in `sfx.ts`) by the loudest 50 ms,
which is what the ear notices on short sounds. The output has a soft safety limiter (exactly
linear below −3 dBFS) instead of a DynamicsCompressor: the Web Audio compressor adds makeup gain
and settles over the first second, which made short and long sounds land up to 4 dB off target.

## Performance

- SFX are baked once (a few ms each) in idle time after the first tap, then each play is one
  buffer source and one gain (plus a panner if panned).
- Plucked/struck notes are baked once per pitch (24–32 kHz mono, at most 140 kept); when a kitchen
  starts, its notes are found with a silent dry run of the song and baked in idle time.
- Live voices: reeds, "oohs", lines. A band averages 7–17 concurrent voices (peaks 17–37).
  The music room reverb is one convolver (1.1 s); the SFX one is idle except for the win flourish.
- Offline, a 30 s excerpt renders in about 1–2.5 s on an M-series Mac (4–8 % of real time,
  including node churn); expect a few times that on a mid-range phone.

## Auditioning

- **Listen:** run the dev server and open `/review/audio.html` (e.g.
  `http://localhost:5180/review/audio.html`). Every SFX (with all guest voices, star and plop
  steps), a few moves of a level, the win sequence, and play/stop for each kitchen band with the
  current section/pass shown. Mute toggle and volume sliders start at the game's defaults.
  "Measure" renders offline and shows the numbers.
- **Render previews:** `node scripts/render-audio.mjs` writes `.cache/audio/<sound>.wav` for every
  SFX (all guest voices, star/prep/plop steps), `.cache/audio/win-<kitchen>.wav` (the win jingle with
  each band's flourish), `.cache/audio/music-<n>-<kitchen>.wav` (first 30 s of each band) and `report.json`.
  `--long 120` also measures 120 s of each band; `--stems` measures each instrument group's
  loudness inside each band; `--only bell,yum-cat` and `--themes 0,2` narrow it down;
  `--seconds 60` changes the excerpt length. It starts its own Vite on 127.0.0.1:5185.
- **Tests:** `src/audio/audio.test.ts` checks that every tune parses with full bars, every band
  plays 200 bars, plucked strings are in tune, and every SFX bakes cleanly at its level.

## Adding a kitchen's music

Add a `SongDef` to `SONGS` in `src/audio/songs.ts` (sections with chords and a tune in the
notation described in `theory.ts`, a form, an `arrange(bar, band)` and a `tag`), run
`node scripts/render-audio.mjs --themes <n> --long 120` and set `trim` so its LUFS matches the
others, then point the kitchen's `music` at it.
