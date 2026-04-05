**PURPOSE:** Human planning/reference notes for tour script, teams, and prompts used by the scavenger hunt.

**PROJECT NOTE:** TGB Builder writes JSON data that is read later by the game engine.

* **OLD BUILDER:** `builder_archive.html` writes `play/data/games_archive.json` and `play/data/stops.json`.
* **NEW BUILDER:** `builder_new.html` writes `play/data/games_new.json`.

---

## 🎤 Intro Script & Talking Points (Live Introduction)

"Hi. I'm Kevin Kolb. You get to kick back and relax now as I take you on a walking tour around the neighborhood. You're done thinking for the day.

Now, after many years of being a computer trainer, I know I'm in a bad spot. I'm the only thing standing between you and food and drink. So — we don't have an open container law here. As long as you're not carrying glass, feel free to grab some snacks and drinks for our walk.

We're on the cusp of the French Quarter, but this neighborhood is still pretty interesting. At least, I think it's pretty interesting. Those of you from other countries might not be too impressed. As Eddie Izzard says, 'I grew up in Europe — that's where the history comes from.' So Civil War-era stuff might not blow your minds. We'll see. Eddie Izzard is one of Kelley's favorites too. 'Do you have a flag?'

Go ahead and get your phones out — I'll have you scan a QR code so I can send you some historical photos along the way."

* **Tip:** Say keywords during intro that are throwbacks in the game.

---

## 📋 Reference Section

### Team Rosters & Locations

| Team                    | Members                                                      | exact Spot (What3Words)                                                     |
| :---------------------- | :----------------------------------------------------------- | :-------------------------------------------------------------------------- |
| **Beignet**       | Abigail Beadle, Sanil Parambil, Rahim Bhimani, Chris Bingham | [tend.snipped.national](https://w3w.co/tend.snipped.national) (shumard)        |
| **Lagniappe**     | Matt Toms, Deji Oduntan, Aneesh Chakko, Arlene Radley        | [ideas.shorter.restore](https://w3w.co/ideas.shorter.restore) (poydras)        |
| **Tchoupitoulas** | Rory Sewell, Chuck Foster, Kamran Kamal, Sharon Maxfield     | [captures.sailor.clues](https://w3w.co/captures.sailor.clues) (gallier)        |
| **Rougarou**      | Tim Sewell, Jeremy Sharp, Mo Zaman, Jason Atkins             | [bearings.student.seats](https://w3w.co/bearings.student.seats) (ben franklin) |

### Team Interactions (Call/Response)

| Team                    | Calls Out To  | Gives      | Receives   |
| :---------------------- | :------------ | :--------- | :--------- |
| **Beignet**       | LAGNIAPPE     | JAMBALAYA  | gumbo      |
| **Lagniappe**     | BEIGNET       | GUMBO      | jambalaya  |
| **Tchoupitoulas** | ROUGAROU      | ETOUFFEE   | muffuletta |
| **Rougarou**      | TCHOUPITOULAS | MUFFULETTA | etouffee   |

### Stop Order (Latin Square Design)

*Logic: No two teams at same stop at same time; no Sculpture → Ladies adjacency.*

* **Tchoupitoulas:** Ladies → Fed Reserve → Bush Tree → Sculpture
* **Beignet:** Fed Reserve → Ladies → Sculpture → Bush Tree
* **Lagniappe:** Bush Tree → Sculpture → Fed Reserve → Ladies
* **Rougarou:** Sculpture → Bush Tree → Ladies → Fed Reserve

### Project Navigation Flows

* **PUBLIC:** `index.html` → `library` → `game` → `play`
* **ADMIN:** `library` → `builder` → `game` → `play`
* **TEAM:** `teams.html` → `play.html`

---

## ✅ To-Do List

### Core Functionality

- [ ] **Team Cipher:** Lock in team assignment (don't rely on player choice); pull names from Game Specific.
- [ ] **Handshake:** Play code should expire; base code on purchase date.
- [ ] **Variable Logic:** Make variables persistent across refresh/save to DB; allow input, recall, and routing.
- [ ] **Scaling:** Ensure team formation works for any number of people.
- [ ] **Navigation:** Route based on answer (e.g., redirect to "correct/incorrect" or specific URLs based on receipt number/PAY).

### UI/UX & Builder Fixes

- [ ] **Bubbles:** Fix "click and drag" wonkiness; grouping bubbles for Latin Square design.
- [ ] **New Elements:** Add image bubble, video bubble, and button bubble for shadow box URLs.
- [ ] **Notifications:** Use game-specific notifications (not browser-level); add text send/receive SFX.
- [ ] **Styling:** - Move color settings under guide settings in Game Details.
  - All Caps shrink/grow in player messages.
  - Links: Bold, white, and underlined.
  - Player msg label goes under bubble; remove bubble shadow.
- [ ] **Admin Features:** If `builder.html` has `?id=*` in URL, load that specific game.

### AI & Automation

- [ ] **AI Button:** Add to primary color text box. Use AI to find hex codes based on phrases (e.g., "NFL Saints" or "Beach sunrise").
- [ ] **Suggest Button:** Fix functionality.
- [ ] **Reporting:** Script to test all DB URLs daily and email a broken link report.

### Final Polish & Content

- [ ] **Content:** Find old tour stops and write new ones.
- [ ] **Team Agency:** Allow players to pick own teams (optional); allow teams to change names.
- [ ] **Social:** Add "share with friends" button at end; implement hashtag for photo posts.
- [ ] **Tutorial:** Build out builder tutorial and create "How to Play" standard verbiage.

---

## Debrief Prep/Survey Post Game}

* **Experience:** Too long? Too short? How was the team gelling?
* **Collaboration:** How did it feel to rely on/wait for other teams?
* **Conflict:** Any disagreements on answers? How were they resolved?
* **Leadership:** Who stepped up? Did it surprise you?
* **Trust:** Did you trust the process with incomplete information?
* **Work Parallels:** Does the feeling of getting "unstuck" feel familiar at work?
* **Reflection:** What would you do differently next time?
* **Fun Factor:** How did you like screaming in public?
