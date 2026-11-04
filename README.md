# Beat the Bot — event builder

Set up a conference game from a web page. You type the conference details, drop
in the logos, press publish, and about a minute later the game is live: the
hosted version, the offline file for the booth laptop, 20 share captions, the
scorecard image and the share page.

Several conferences run at once, each with its own branding, partner and
captions.

**Normal use needs no terminal.** Everything below the Studio section is for
when you want to script it or work offline.

---

# 1. The Studio

```
https://<your-deployment>/studio
```

Open it on anything, including a phone. Fill in the form. Press **Publish and go
live**.

### What the page does for you

**Works out the URL name.** Type "RSA Conference 2027" and it becomes
`rsa-conference-2027`, shown under the field so you can see where the game will
live. Override it if you want something shorter.

**Shows the captions as you type.** All 20, built by the same code the deploy
uses, so what you read in the form is exactly what ships. Words in blue, like
`{time}` and `{rank}`, fill in from each player's result.

**Checks the logos.** Drop one in and it measures the brightness right there in
the browser. The scorecard background is near-black, so dark artwork disappears,
and the page tells you before you publish rather than letting you find out at
the booth. Any format works: SVG, PNG, WebP, HEIC, JPEG.

**Partner is a switch.** Off means a solo booth. The captions switch to solo
wording so nothing reads "Thanks Strike48 and ." with a gap in it, and the
scorecard shows the Strike48 mark alone instead of a × with nothing after it.

**Giveaway is a switch.** Off removes the giveaway button, the draw screen and
the claim timer together. There is nothing else to turn off.

**Sound is three controls.** Arcade music on or off, the attract announcer on
or off, and a volume slider. Turn the volume down for a small hall or a stand
next to a speaking theatre.

**Lists what is already live**, so you can see which conferences are running
before you add another. This is the one part that needs the server, so opened
straight off disk it says so instead of showing a list.

The page carries everything it needs inside it, including the caption library,
so it works served, at `/studio` behind the rewrite, and opened from a file.

### What happens when you press publish

The event and its logos are written to the repo as one commit, and Vercel builds
from it. One commit per event, so there is a history and a bad event can be
undone with a revert. The deployment URL never changes, so printed QR codes keep
working.

### Setting it up, once

This is the only part that needs someone with access to the Vercel and GitHub
settings. Ten minutes, once. After it, nobody touches a command line again.

1. **Make a GitHub token.** github.com, Settings, Developer settings, Personal
   access tokens, Fine-grained tokens. Give it access to this repository only,
   and under Repository permissions set **Contents: Read and write**. Copy it.

2. **Add four environment variables.** Vercel, this project, Settings,
   Environment Variables:

   | Name | Value |
   |---|---|
   | `ADMIN_PASSWORD` | whatever you want the Studio to ask for |
   | `GITHUB_TOKEN` | the token from step 1 |
   | `GITHUB_REPO` | `owner/repo`, e.g. `strike48/beat-the-bot` |
   | `GITHUB_BRANCH` | `main`, or whatever your default branch is |

3. **Connect the repo** under Settings, Git, then redeploy once.

The build command is already in `vercel.json`, so Vercel runs
`node tools/build.mjs --all` on every push and rebuilds every event.

Anyone with the link sees the form, but nothing publishes without the password,
and the page gives away nothing about how the deployment is wired until the
password is right.

### If the Studio shows an error

It says what is wrong in plain words. The ones worth recognising:

| Message | What to do |
|---|---|
| That password is not right | Wrong `ADMIN_PASSWORD`, or it was never set |
| GitHub refused the token | Token expired, or missing Contents: Read and write |
| GitHub could not find owner/repo on branch main | Check `GITHUB_REPO` and `GITHUB_BRANCH` |
| GitHub rejected the commit | Someone pushed at the same moment. Press publish again |

---

# 2. Putting it in Git

The Studio publishes by committing to a repo, and Vercel builds from that repo,
so the project has to live there. This is a one-time upload and it needs no
terminal.

1. **Use the repo Vercel is already connected to.** Vercel, your project,
   Settings, Git shows it. Using that one keeps the deployment URL, so printed
   QR codes keep working.

2. **Upload the files.** On the repo page, Add file, Upload files, then drag in
   everything from the unzipped folder: `api`, `lib`, `tools`, `templates`,
   `public`, `events`, `vercel.json`, `package.json`, `package-lock.json` and
   `.gitignore`. Chrome and Safari both keep the folder structure when you drag
   folders. Commit.

   Files that already exist are replaced. Anything left over from the old
   layout is harmless and can be deleted later.

3. **Never upload `node_modules`.** It is not in the zip and `.gitignore`
   excludes it. Vercel installs dependencies itself.

4. **Check the build command is not overridden.** Vercel, Settings, Build and
   Deployment. If Build Command has been set by hand in the dashboard, it wins
   over `vercel.json` and the events never get built. Clear it so it falls back
   to `vercel.json`, which runs `node tools/build.mjs --all`.

5. **Redeploy once.** Deployments, then redeploy the latest.

After that, publishing from the Studio is a commit and a build, and you never
touch Git again.

### Checking it worked

Publish a throwaway event from the Studio, then look at the repo's commit list.
A commit named `Event: <name>` should appear within seconds, and a build should
start in Vercel's Deployments tab right after.

If the commit appears but no build starts, the repo is right and Vercel is
connected to a different one. That exact mismatch cost time at two events.


---

# 3. Before an event

Worth five minutes, whichever way you published.

1. **Open the offline file with wifi switched off** and play a full round. This
   is the only way to catch something that only breaks when the booth has no
   connection. Download it from `/e/<slug>` or take it from `dist/`.

2. **Check the title screen**: conference name, venue, booth, partner, and
   whether the giveaway button is there or not, as you intended.

3. **Check the scorecard** with real values:

   ```
   https://<your-deployment>/r?e=<slug>&n=Test&co=Strike48&t=9.4&r=SOC+Tier-2&c=3&b=3.5&cap=0
   ```

   The right logos, and a caption naming the right conference and partner.

4. **Try the Follow partner button.**

---

# 4. Which version to use at the booth

Every event produces both. Use whichever suits the room.

**The offline file** is one self-contained HTML. Logos, typefaces, the music,
the announcer audio and all 59 scenarios live inside it, and it makes no network
requests at all, so it runs behind a captive portal or with no wifi. Copy it to
the laptop and double-click it.

Download it from the deployment at `/e/<slug>/offline.html`, or press
**download** next to the conference in the Studio's live list. Publishing from
the Studio produces both versions, so you never need a terminal to get the
booth file.

**The hosted version** at `/e/<slug>` is the same game at a URL you can put on a
QR code. It needs a connection but updates when you republish and works on a
visitor's phone.

---

# 5. Without the Studio

For scripting a batch of events, or working on a plane.

```
unzip strike48-booth.zip
cd strike48-booth
npm install
```

Node 18 or newer. To deploy from here you also need the Vercel CLI signed in,
once per machine:

```
npm i -g vercel
vercel login
vercel link        # pick the existing beat_the_bot project
```

Write `events/<slug>.json` and put the logo files next to it in `events/`:

```json
{
  "eventName": "RSA Conference 2027",
  "venue": "Moscone Center, San Francisco",
  "booth": "N-4412",
  "language": "en",
  "logo": "rsa-logo.svg",
  "botTime": 3.5,
  "partner": {
    "name": "Optiv",
    "logo": "optiv-logo.png",
    "linkedIn": "https://www.linkedin.com/company/optiv"
  },
  "giveaway": {
    "enabled": true,
    "prize": "Nintendo Switch 2",
    "drawTime": "3:30 PM",
    "claimSeconds": 10
  }
}
```

Then:

```
npm run build rsa-conference-2027     # one event
npm run build:all                     # every event
npm run deploy                        # build everything, then push live
```

`npm run deploy` uploads local files straight to Vercel, so it does not matter
which Git repo the project is connected to. That is deliberate: two events lost
time to a deployment that was quietly serving a different repo, and this takes
Git out of the path. Note that it bypasses the Studio's commit history, so
prefer the Studio unless you have a reason not to.

### Every field

Only `eventName` is required.

| Field | What it does |
|---|---|
| `eventName` | Title screen, scorecard, every caption. Generates the event hashtag. |
| `venue` | Printed under the title. Leave out to not name it. |
| `booth` | Appended after the venue, as "BOOTH D18". |
| `language` | Defaults to `en`. Sets the page language. |
| `logo` | Any format. Without it the card prints the name as text. |
| `botTime` | Seconds the AI takes. Defaults to 3.5. The number players race. |
| `partner.name` | Omit the whole `partner` block for a solo booth. |
| `partner.logo` | Shown next to Strike48 on the card. |
| `partner.linkedIn` | Adds a Follow button to the share page. |
| `giveaway.enabled` | Defaults to false. |
| `giveaway.prize` | Required when enabled. Named on the winner screen. |
| `giveaway.drawTime` | Printed as the draw time. |
| `giveaway.claimSeconds` | How long a winner has to reach the stand. Defaults to 10. |
| `hashtags` | Extra tags, as `["#RSAC"]`. Event and Strike48 tags are automatic. |
| `audio` | Sound settings. See Sound below. Defaults to music and announcer at half volume. |
| `shareBase` | Override the deployment URL for this event. Rarely needed. |

### What a build writes

```
public/e/<slug>/index.html        hosted game, served at /e/<slug>
public/e/<slug>/offline.html      the self-contained file, downloadable
public/e/<slug>/event-logo.png    normalised logo the scorecard fetches
public/e/<slug>/partner-logo.png
public/admin/index.html           the Studio, caption library inlined
dist/beat-the-bot-<slug>.html     offline file for the booth laptop
lib/registry.js                   what the share page and scorecard read
```

---

# 6. How it works

```
the Studio form  ──┐
                   ├──>  events/<slug>.json  +  logo files
events/*.json ─────┘                │
                                    v
                            tools/build.mjs
                 ( templates/game.html, lib/captions.js, sharp )
                                    │
         ┌──────────────┬───────────┴────────┬──────────────────┐
         v              v                    v                  v
  public/e/<slug>/   dist/              lib/registry.js     public/admin/
   hosted game    offline file         one entry per event    the Studio
                                              │
                                   ┌──────────┴──────────┐
                                   v                     v
                              api/r.js              api/og.js
                            share page            scorecard image
```

**The game carries its whole configuration in one baked block** near the top of
the file. The builder replaces that block rather than editing the game, which is
why adding a conference never touches the game code.

**The registry is what lets conferences run side by side.** Every build writes
one entry per event: name, partner, logos, captions, bot time. The game sends
its slug to the share page, which looks the event up and serves that event's
captions and logos. Two conferences on the same day never see each other's
content, and building one leaves the others untouched. Links made before slugs
existed still resolve, because the share page falls back to matching on name.

**Every build issues a fresh stamp.** The game caches its configuration in the
browser and ignores a new one unless the stamp changed. Without this, a laptop
that ran the last conference would keep showing the old branding.

**Captions are generated, never written per event.** The templates live in
`lib/captions.js` with the conference name, partner and hashtags as tokens. Edit
that file to change the writing, and it changes for every conference at once.
The Studio imports the very same file, which is why its preview is accurate.

---

# 7. Logos

Hand it whatever the partner sends. SVG, PNG, WebP, HEIC and JPEG all work and
come out as PNG at the right size for each place they appear.

Two things it does on purpose:

**Everything becomes PNG.** satori, which renders the scorecard, throws a hard
error on WebP and takes the endpoint down with it. That cost us time at c0c0n.
It cannot happen now.

**Dark artwork is flagged**, in the Studio as you drop it in and again in the
build output:

```
note      event logo: mean brightness 46/255 on a dark background.
          It will be hard to see. Supply a white or light version.
```

Do not wave this through. It is the failure that hit both IndoSec and CyberCon.
Ask for a white version.

If a logo is missing or fails to load at render time, the card falls back to
printing the name as text. It never breaks.

---

# 8. Sound

The game plays continuously, like an arcade cabinet.

**The music never stops.** It is synthesised in the browser, so it adds no
files and the offline build still makes zero network requests. It follows the
screen: a mid-tempo loop on the title screen, faster and darker during a round
with a clock pulse underneath, and calmer on the result.

**The attract announcer** calls out on the title screen every 14 seconds until
someone plays, cycling through lines like "Beat the Bot", "One alert, three
calls, sixty seconds" and "Can you out-think an Agentic SOC?". It stops the
moment a round begins, so it never talks over a player, and resumes when the
game returns to the title screen between visitors. Each line also appears as a
marquee across the top.

**The voice ships with the game.** It is not the browser's built-in speech.
Nine lines are pre-rendered to audio and embedded in the file, about 90 KB, so
the stand sounds the same on every laptop, works with no network, and does not
depend on the machine having a speech engine installed. The voice is eSpeak, a
formant synthesiser, put through a speech-chip treatment: band-limited to
300 to 3400 Hz, bit-crushed and lightly ring-modulated, which is how arcade
cabinets of that era actually sounded. The music ducks underneath while it
speaks.

### Editing a conference you already published

In the Studio's live list, press **edit** next to it. The whole conference
loads back into the form: name, venue, partner, giveaway, sound, captions,
logo sizes, everything. Change what you need and publish again.

Publishing with the same URL name replaces that conference. A different URL
name creates a second one, so take care not to change it by accident when you
only meant to rename the conference.

**The logos are kept unless you replace them.** They are not re-uploaded when
you edit; the published versions show in the form and stay put. Click a logo
box only if you actually want to change it.

### Logo size and placement

The **Logo size and placement** card controls both places a logo appears, with
a live preview of each.

**The LinkedIn scorecard** preview is the real 1200 by 630 layout scaled down,
using the same paddings, font sizes and positions the renderer uses, so what
you see is what gets posted. Two sliders set the box for the conference logo
and two for the partner logo. Artwork is fitted inside its box without
distortion, so the box is a maximum rather than a stretch.

**The game title screen** preview shows the header as the game draws it. A
slider sets each logo's height and a dropdown puts it on the left or the right.

Both previews update as you drag, before anything is published.

### The sound panel (Ctrl+Shift+S)

Everything about the sound is adjustable inside the game, at the stand, with no
rebuild. Press **Ctrl+Shift+S**.

| Control | What it does |
|---|---|
| Arcade music | On or off |
| Announcer | On or off |
| Show the lines on screen | The marquee, independent of the voice |
| Announcer voice | Switches voice live, when the file carries more than one |
| Overall volume | Everything together, up to 150% |
| Music level | The bed on its own |
| Announcer level | The voice on its own |
| Game sounds | Right and wrong answers on their own |
| Announcer every | 5 to 60 seconds |
| What it says | The lines, one per row |

**Hear it** plays the first line, then a wrong-answer and a right-answer sound,
so the three levels can be balanced against each other rather than guessed at.

Changes are saved on that laptop and survive a reload. **Back to published**
clears them. **Copy for the event file** puts the exact JSON on the clipboard
to paste into the Studio or the event file, so a setting you liked at one
conference becomes permanent.

### Game sounds

The answer blips used to go straight to the speakers, outside the mixer
entirely: the volume slider could not touch them and they could not be balanced
against the music. They now run through their own bus on the same audio
context, sitting 2.4x above the music by default so a wrong answer cuts through
a busy hall. The Game sounds slider moves that independently.

### Carrying every voice

A file normally ships only the voice it was built with, and the panel shows the
name rather than a dropdown. Turn on **Carry every voice** in the Studio, or
`"allVoices": true` in the event file, and all eight ship so the voice can be
changed at the stand. It costs about 600 KB.

### Changing what it says

Three places, depending on how permanent you want it.

**At the stand, right now.** Press **Ctrl+Shift+S** in the game. A panel opens
with the music, announcer, on-screen text, volume, how often it speaks, and the
lines themselves. Changes apply immediately and are kept on that laptop, so you
can adjust it on the morning of the event without rebuilding anything. "Back to
published" undoes the lot. A line typed here is read by that laptop's own voice
until you publish it properly, and the panel says so.

**For the event, permanently.** The Studio's Sound card: voice, lines, volume,
and whether the lines appear on screen. Each line is rendered into the arcade
voice when you publish. The panel's "Copy for the event file" button hands you
the exact JSON if you would rather paste it in.

**For every conference.** Edit `DEFAULT_LINES` in `tools/make-voice.mjs` and run
`npm run voice`.

In an event file:

```json
"audio": {
  "style": "announcer",
  "showText": true,
  "lines": [
    "Beat the Bot!",
    "Netpoleon and Strike48 challenge you."
  ]
}
```

### Picking a voice

Two ways, and the second is the one that actually decides it.

**On their own.** Open **voice-styles.html** for the same three lines in all six
treatments, back to back. Quick, but it tells you nothing about how a voice sits
over the music.

**In the game, over the music.** Build the voice-test file:

```
npm run voicetest
```

That writes `dist/beat-the-bot-cybercon-2026-voicetest.html`, which carries
every voice at once. Open it, press TAP FOR SOUND, then Ctrl+Shift+S and use the
**Announcer voice** dropdown. Switching plays that voice immediately with the
arcade bed underneath, which is the only honest way to judge it. The file is
about 1.6 MB because it holds six sets of audio, so it is for choosing only,
never for the stand.

Once you have picked, set it in the Studio or in the event file and rebuild
normally.

| Style | What it sounds like |
|---|---|
| `mk` | Fighting-game announcer. Pitched and formant-shifted down, an octave underneath, driven, widened and thrown into a big room. The deepest of the set. |
| `mkLite` | The same idea with less grit, if the full one is too muddy in a hall. |
| `announcer` | Deep, doubled with a detuned copy, like a big cabinet speaker. |
| `chip` | A 1980s speech chip. Gritty and narrow. |
| `robot` | Full robot, heavy ring modulation. |
| `pa` | A tannoy in a large hall. Narrow, driven, roomy. |
| `clear` | Barely processed. Easiest to understand across a noisy floor. |
| `deep` | Low, slow and wide. The movie-trailer read. |

Regenerate the side-by-side page any time with `npm run voices`.

To tune one yourself, the `STYLES` table at the top of `tools/make-voice.mjs`
holds every parameter: which eSpeak voice, pitch and speed, band limits, bit
depth, ring modulation, doubling and room.

**On the fighting-game sound specifically.** The `mk` style goes as far as a
formant synthesiser can: it is measurably the deepest of the set, with roughly
three times the energy below 300 Hz of the next one. But that sound in the real
games is a *human* voice pitched down and processed, and the body of a human
voice is the part a synthesiser cannot fake. It will read as a big processed
robot rather than a person growling.

If you want the real thing, record the lines on a phone in a quiet room, send
me the file, and the exact same processing goes on top: the pitch and formant
shift, the sub-octave, the drive, the chorus and the room. A human voice under
this chain genuinely does sound like a fighting-game announcer, and it is about
five minutes of recording.

A note on wording: the famous lines from those games are trademarks of their
publisher. Write your own in the same spirit rather than quoting them, since
this is a commercial stand.

### Volume

Ctrl+Shift+S, volume slider. 50% is the default.

The scale was rebuilt because the old one topped out too quiet for a hall. The
slider now drives up to 2.6x through a limiter, so pushing it does not distort
the music when the announcer speaks over it. The announcer itself sits a further
1.7x above the bed, so it cuts through rather than sitting inside it.

In practice: the default is already twice as loud as it was, and 100% is about
five times. If it is still not enough, the laptop's own output volume and the
hall PA are the next places to look, not this slider.

To set it for an event rather than one laptop, use the Studio's Sound card, or
`"audio": { "volume": 0.8 }` in the event file.

### Acronyms

The synthesiser reads some acronyms as words, which is why "SOC" used to come
out as "society". `tools/make-voice.mjs` holds a pronunciation list that is
applied to the spoken audio only, never to what appears on screen:

| Written | Spoken |
|---|---|
| SOC | sock |
| AI, IR, MFA, EDR, IOC | spelled out |
| SIEM | seem |
| Strike48 | Strike forty eight |

Add to that list if a new line reads oddly, then run `npm run voice`.

**The SOUND button controls everything**, music and announcer together.

### The music

A supplied track replaces the synthesised bed. It loops continuously and a
lowpass filter opens during a round, so one piece of music still has two moods:
softer while the stand is idle, bright and present while someone is playing.

The track that ships is `events/arcade-loop.mp3`, a 125 BPM retro arcade loop
trimmed to 38 whole bars with the tail crossfaded onto the head, so it repeats
with no audible seam.

Swap it in the Studio's Sound card, or in an event file:

```json
"audio": { "track": "arcade-loop.mp3" }
```

Set it to `""` for the synthesised bed instead.

**Adding your own.** Drop an MP3 in `events/` and name it in `track`. Two
things happen automatically: if the track ends on a fade, the loop point is
measured and set before the fade begins, so it never dips into silence on the
turnaround; and a `-hifi.mp3` sibling, if present, is used for the hosted copy
while the smaller file is embedded in the offline one.

For the best result a track should be trimmed to whole bars with the tail
crossfaded, which is what was done to the supplied one. Send me a track and I
will prepare it the same way.

**Size.** Music is the largest thing in the file. The supplied loop adds about
760 KB to the offline build, taking it to roughly 1.7 MB. The hosted copy
references a separate 1 MB file instead, so the page itself stays small and the
browser caches the music.

**Licensing.** Check the licence of any track before a conference. Royalty-free
is not the same as unrestricted, and some licences require attribution even for
a stand. That check is on you; I cannot verify it from the file.

### Starting it

Browsers refuse to play audio until someone interacts with the page, so the
title screen shows a gold **TAP FOR SOUND** button. Press it once when setting
up the stand and it disappears for good.

That button exists for a specific reason. Any first click or key press unlocks
the audio, but on the title screen most keys also start a round, so the gesture
that turned the sound on would skip straight past the attract loop and nobody
would ever hear it. This button swallows its own click and leaves the game
where it is.

### Turning it down

In the Studio, the Sound card. In an event file:

```json
"audio": {
  "music": true,
  "voice": true,
  "volume": 0.35,
  "attractSeconds": 20
}
```

Leave it out and you get music and announcer at half volume.

---

# 9. When something is wrong

| What you see | What it is |
|---|---|
| The card shows the wrong conference | The link has no slug or the wrong one. Rebuild, which resets it. |
| Text where a logo should be | The logo failed to load. Check `public/e/<slug>/event-logo.png` shipped. |
| The logo is invisible | Dark artwork on a dark card. You were warned. Get a white version. |
| The game shows the last conference's branding | Cached config on that laptop. Rebuild for a new stamp and recopy the file. |
| LinkedIn shows an old preview image | LinkedIn caches hard. Run the URL through linkedin.com/post-inspector once. |
| The scorecard returns a 500 | Almost always a logo satori cannot read. Check nothing was added to `public/` by hand. |

---

# 10. Where things are

| Path | What it is |
|---|---|
| `templates/admin.html` | **the Studio page** (source) |
| `public/admin/index.html` | the Studio, generated by the build |
| `api/publish.js` | takes the form, commits to the repo |
| `api/events.js` | lists live conferences for the Studio |
| `api/r.js` | the share page a player's QR opens |
| `api/og.js` | the scorecard image |
| `tools/build.mjs` | the builder |
| `lib/captions.js` | the 20 caption templates, inlined into the Studio at build |
| `lib/arcade-audio.js` | the music, the announcer and the attract loop |
| `tools/make-voice.mjs` | renders the announcer lines to arcade-voice audio |
| `lib/voice-clips.json` | the rendered clips, rebuilt with `npm run voice` |
| `lib/registry.js` | generated, one entry per event |
| `templates/game.html` | the game itself |
| `events/` | one JSON per conference, plus logos. Files starting with `_` are skipped |
| `vercel.json` | routes and the build command |
