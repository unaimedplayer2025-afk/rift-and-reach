# THE RIFT & THE REACH

A 3D pinball portal game starring **Rowlex**. The table is a portal between worlds: drop into **The Rift** (a Rygar-style floating-isle action game) or **The Reach** (an F-Zero-style neon race). Rowlex throws a spinning chained blade in both.

Play: **https://unaimedplayer2025-afk.github.io/rift-and-reach/**  
or open `index.html` from any static web server (ES modules need http, not `file://`). `python3 -m http.server 8767` works locally.

Title screen: first tap or key unlocks the title theme; the second starts the game.

## Controls

- **Pinball:** Z / ← and / / → (or Shifts) flip. Space or ↓ charges and releases the plunger. Phone: tap left or right half to flip, PLUNGE button to launch.
- **The Rift:** WASD move, Space jump, Shift roll, F / J / click throw the disc.
- **The Reach:** W accel, S brake, A D steer, Shift boost, F throw the disc.
- **Mute:** M or the speaker button.

3 balls. Lighting bumpers and targets opens the two portals. Finishing or failing a portal game returns you to the table with a score bonus.

## Music

Replace these pairs (OGG + MP3 fallback) whenever you have new tracks:

- `audio/title-theme.{ogg,mp3}` — title / backglass
- `audio/pinball.{ogg,mp3}` — table play
- `audio/rift.{ogg,mp3}` — Portal A
- `audio/reach.{ogg,mp3}` — Portal B

The game picks the format with `canPlayType`.

## Demo

`index.html?demo` autoplays table → The Rift → table → The Reach → table.

URL flags: `?demo` autopilot, `?capture` (autopilot + externally stepped frames for recording), `?lowfx` (no bloom, lower res), `?hifx` (never auto-downgrade), `?seed=` (reproducible runs).
