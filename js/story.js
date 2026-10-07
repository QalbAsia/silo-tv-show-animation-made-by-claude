// SILO — the story of season 1 in one minute. No narration and no subtitles: pictures, sound effects and music only.
// The film is cut into "beats". d = seconds. Change a d here and every shot, sound and seek-bar mark re-times itself.
window.STORY = {
  title: { en: 'SILO' },             // English only: the user asked for no Farsi in this film
  beats: [
    { id: 'shaft',    d: 3.4, label: 'The silo' },
    { id: 'levels',   d: 2.8, label: 'Ten thousand people' },
    { id: 'cafe',     d: 2.8, label: 'The screen' },
    { id: 'airlock1', d: 2.8, label: 'The sheriff goes out' },
    { id: 'clean',    d: 3.0, label: 'He cleans' },
    { id: 'fall',     d: 2.8, label: 'He falls' },
    { id: 'gen',      d: 3.0, label: 'The generator' },
    { id: 'star',     d: 3.0, label: 'The new sheriff' },
    { id: 'relic',    d: 2.8, label: 'The hard drive' },
    { id: 'server',   d: 3.0, label: 'The man who watches' },
    { id: 'chase',    d: 3.0, label: 'The chase' },
    { id: 'tape',     d: 2.0, label: 'The good tape' },
    { id: 'airlock2', d: 3.0, label: 'She goes out' },
    { id: 'green',    d: 3.2, label: 'She does not clean', glitch: [[0.20, 0.26], [0.36, 0.44], [0.62, 0.68]] },
    { id: 'climb',    d: 3.4, label: 'Up the hill' },
    { id: 'ridge',    d: 3.2, label: 'The lie ends', glitch: [[0.20, 0.25], [0.33, 0.41], [0.46, 0.56]], truth: 0.56 },
    { id: 'reveal',   d: 4.4, label: 'The truth' },
    { id: 'aerial',   d: 3.4, label: 'Not alone' }
  ],
  titleFrom: 0.25, titleTo: 2.8,   // the title sits over the first shot between these seconds
  endCard: 2.5,                    // seconds of end card after the last beat
  brandCard: 2.5,                  // seconds of brand card after the end card
  brand: { name_en: 'Qalb Asia', tagline_en: 'Production', logo: null },
  sound: true                      // sound effects and music are made in the browser (js/sound.js)
};
