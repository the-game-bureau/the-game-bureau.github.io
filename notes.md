# Tour / Game Builder Notes

**Project note:** TGB Builder writes data that is read later by the game engine.

epcot leave a legacy - do a virtual version
participation like wwii museum stickers on street signs
have players find a specific brick at WWII Museum

## Builder Files

- **builder/index.html**
- Supabase

---

# Live Intro Script & Talking Points

“Hi. I’m Kevin Kolb. You get to kick back and relax now as I take you on a walking tour around the neighborhood. You’re done thinking for the day.

Now, after many years of being a computer trainer, I know I’m in a bad spot. I’m the only thing standing between you and food and drink. So — we don’t have an open container law here. As long as you’re not carrying glass, feel free to grab some snacks and drinks for our walk.

We’re on the cusp of the French Quarter, but this neighborhood is still pretty interesting. At least, I think it’s pretty interesting. Those of you from other countries might not be too impressed. As Eddie Izzard says, ‘I grew up in Europe — that’s where the history comes from.’ So Civil War-era stuff might not blow your minds. We’ll see. Eddie Izzard is one of Kelley’s favorites too. ‘Do you have a flag?’

Go ahead and get your phones out — I’ll have you scan a QR code so I can send you some historical photos along the way.”

**Tip:** Say keywords during the intro that are throwbacks in the game.

---

# Team Setup

## Team Rosters & Locations

| Team                    | Members                                                      | Exact Spot (What3Words)                                                     |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Beignet**       | Abigail Beadle, Sanil Parambil, Rahim Bhimani, Chris Bingham | [tend.snipped.national](https://w3w.co/tend.snipped.national) (shumard)        |
| **Lagniappe**     | Matt Toms, Deji Oduntan, Aneesh Chakko, Arlene Radley        | [ideas.shorter.restore](https://w3w.co/ideas.shorter.restore) (poydras)        |
| **Tchoupitoulas** | Rory Sewell, Chuck Foster, Kamran Kamal, Sharon Maxfield     | [captures.sailor.clues](https://w3w.co/captures.sailor.clues) (gallier)        |
| **Rougarou**      | Tim Sewell, Jeremy Sharp, Mo Zaman, Jason Atkins             | [bearings.student.seats](https://w3w.co/bearings.student.seats) (ben franklin) |

## Team Interactions (Call / Response)

| Team                    | Calls Out To  | Gives      | Receives   |
| ----------------------- | ------------- | ---------- | ---------- |
| **Beignet**       | LAGNIAPPE     | JAMBALAYA  | gumbo      |
| **Lagniappe**     | BEIGNET       | GUMBO      | jambalaya  |
| **Tchoupitoulas** | ROUGAROU      | ETOUFFEE   | muffuletta |
| **Rougarou**      | TCHOUPITOULAS | MUFFULETTA | etouffee   |

---

# Game Flow

## Stop Order (Latin Square Design)

**Logic:** No two teams at the same stop at the same time. No Sculpture → Ladies adjacency.

- **Tchoupitoulas:** Ladies → Fed Reserve → Bush Tree → Sculpture
- **Beignet:** Fed Reserve → Ladies → Sculpture → Bush Tree
- **Lagniappe:** Bush Tree → Sculpture → Fed Reserve → Ladies
- **Rougarou:** Sculpture → Bush Tree → Ladies → Fed Reserve

## Project Navigation Flows

- **Public:** `index.html` → `library` → `game` → `play`
- **Admin:** `library` → `builder` → `game` → `play`
- **Team:** `teams.html` → `play.html`

---

# To-Do List

## Core Functionality

- [ ] fix map link without providing lat and long
- [ ] **Team Cipher:** Lock in team assignment. Don’t rely on player choice. Pull names from Game Specific.
- [ ] **Handshake:** Play code should expire. Base code on purchase date.
- [ ] **Variable Logic:** Make variables persistent across refresh and save to DB. Allow input, recall, and routing.
- [ ] **Scaling:** Ensure team formation works for any number of people.
- [ ] **Navigation:** Route based on answer, such as redirecting to correct/incorrect screens or specific URLs based on receipt number / PAY.
- [ ] Add a starting location map.
- [X] No bubble default text
- [ ] Make a Button Bubble
- [ ] Make it easy to insert links and variables in a text bubble
- [ ] Button Bubble
- [ ] Fix ID in BUILDER
- [ ] https://www.instagram.com/reels/DXI_V7xjuIF/ qr code on a bracelet gives you a disposible camera
- [ ] qr code on team jersey for fans to scan?
- [ ] https://www.instagram.com/reels/DXJVVJGjknI/ qr scavenger hunt card takes you to a private photo album
- [ ] gather email address for future sales

## UI / UX & Builder Fixes

- [ ] **Bubbles:** Fix click-and-drag wonkiness.
- [ ] **Bubbles:** Group bubbles for Latin Square design.
- [X] **Bubbles:** Switch gray and blue bubble colors.
- [X] **Bubbles:** Switch tail side.
- [ ] **New Elements:** Add image bubble, video bubble, and button bubble
- [ ] shadow box images, videos and websites when clicked.
- [ ] **Notifications:** Use game-specific notifications, not browser-level notifications.
- [ ] **Notifications:** Add text send / receive Sound FX.
- [X] **Styling:** Move color settings under guide settings in Game Details.
- [ ] **Styling:** All Caps shrink / grow in player messages. builder and game.
- [X] **Styling:** Links should be bold, white, and underlined.
- [ ] **Styling:** Put player message label under the bubble.
- [ ] **Styling:** Remove bubble shadow.
- [X] **Admin Features:** If `builder.html` has `?id=*` in the URL, load that specific game.
- [ ] QR codes not working on game page.
- [ ] Fix share setting. Just show URL and copy button and instruct user to send via text message.
- [ ] separate bubble for video and youtube video
- [ ] game share logo should be game logo
- [ ] whatswords in frame in rendezvous on game shows a blank ad and share is obstructed

## AI & Automation

- [ ] **AI Button:** suggest text and waypoints
- [ ] **Reporting:** Create a script to test all DB URLs daily and email a broken link report.

## Content, Story, and Final Polish

- [ ] **Content:** Find old tour stops and write new ones.
- [ ] **Team Agency:** Allow players to pick their own teams optionally.
- [ ] **Team Agency:** Allow teams to change names.
- [ ] **Social:** Add a “share with friends” button at the end.
- [ ] **Social:** Implement hashtag for photo posts.
- [ ] **Tutorial:** Build out builder tutorial.
- [X] Create standard “How to Play” verbiage.
- [ ] Go down different paths based on variables, not just Latin Square. Example: they’re Carolina fans, but not Gamecock fans. Maybe there’s a game where they choose their teams and the game is built from there. Check off 3 teams you hate and 3 teams you don't hate. - like a menu.
- [ ] fix header width to match game details box width

---

# Storytelling Notes

Set the scene.

I’m talking about the old dossier experience.

For example, with Oswald, link to all my research.

---

# Debrief / Post-Game Survey Prep

- **Experience:** Too long? Too short? How was the team gelling?
- **Collaboration:** How did it feel to rely on or wait for other teams?
- **Conflict:** Any disagreements on answers? How were they resolved?
- **Leadership:** Who stepped up? Did it surprise you?
- **Trust:** Did you trust the process with incomplete information?
- **Work Parallels:** Does the feeling of getting “unstuck” feel familiar at work?
- **Reflection:** What would you do differently next time?
- **Fun Factor:** How did you like screaming in public?

- [ ] Write the games.
- [ ] Do a time travel game.
- [ ] Include the church that used to be in Lafayette Square.
- [ ] Old Absinthe house has football helmets
- [ ] Share image from game page link
- [ ] introduce team leader concept that person not only shares location but meetup time. It adds adventure.
- [ ] Set a date and time to start and get sponsorship from a bar to end at their bar with away team fans.
- [ ] Streetcar puzzle of some sort
- [ ] add a sense of urgency by slotting people into different start times. that way away team games can end with a pep rally.
- [ ] each game has a notes section on builder so builders can make notes on the fly without having to track them down later.
- [ ] pay builders based on purchase reports
- [ ] look at other coop tour websites
- [ ] FULL BRANCHING, RIGHT NOW WE CAN'T EVEN GIVE A SPECIALTY REPLY TO A WRONG ANSWER
- [ ] Film from stop locations and show video. This could give the talking statues effect. Live tours could even project onto the statue to give the haunted mansion effect.

Previous Tour Stops:

Here is the human-readable breakdown of the mission, incorporating the specific flavor text and instructions found in the game files:

## **MISSION: New Orleans "Walking Tour"**

**Subtitle:** Mission Control

**The Reveal:** "This IS a team building exercise, but it's NOT a walking tour. Think Escape Room meets Scavenger Hunt."

---

### **1. The Team Cipher**

Before the hunt begins, players must unlock their identity.

* **The Prompt:** "Figure out which team you're on using the Team Cipher puzzle."
* **The Result:** Teams are assigned as **Beignet, Lagniappe, Rougarou,** or  **Tchoupitoulas** .
* **The Quiz:** Players must identify what their team name means (e.g., "A little something extra" or "A Cajun werewolf").

### **2. Deployment to Lafayette Square**

* **The Instruction:** "Are there any Hamilton fans on your team? The musical — not the Tiger-Cats. HEAD TO THE SQUARE NAMED FOR AMERICA'S FAVORITE FIGHTING FRENCHMAN."
* **Arrival Task:** "Welcome to Lafayette Square... I'm so glad you didn't go all the way to Jackson Square. Reply with **HERE!** when you get to the exact spot."
* **Photo Op:** "📸 Designate a team photographer. Take a team photo here... Type CLICK to continue."

### **3. The Password Exchange**

Teams must coordinate with their "Partner Team" in the square.

* **The Command:** "Stay where you are. Call out  **HEY TEAM [PARTNER_NAME]. YOUR PASSWORD IS [GIVE]. WHAT IS OUR PASSWORD?** "
* **Possible Answers:** A) Etouffee, B) Gumbo, C) Jambalaya, D) Muffuletta.

### **4. Landmarks & Legends**

* **Gallier Hall:** "A president's funeral was held here — just not a United States president. The Confederate States of America had a president too. What was his last name?" ( **Answer: Davis** )
* **The Ladies:** "Look up! Atop the roof of the John Minor Wisdom U.S. Court of Appeals Building... are four sets of bronze sculptures known as 'The Ladies'... Daniel Chester French also designed another famous U.S. memorial. Do you know which one?" ( **Answer: Lincoln Memorial** )
* **Federal Reserve:** "Tell me how many dollars a day they're talking about in the video... A) $42.50, B) 1 Million, C) 6 Million, D) 1 Trillion." ( **Answer: 6 Million** )

### **5. The Scavenger Hunt**

* **The Bush Tree:** "Let's wander around the square for a minute. FIND A TREE PLANTED BY A BUSH AND TELL ME WHAT TYPE OF TREE IT IS." ( **Answer: Shumard Oak** )
* **The Rotating Sculpture:** "TAKE A SHORT VIDEO OF YOUR TEAM ROTATING THE SCULPTURE AND HAVE IT POINT TO THE NAME OF A FOUNDING FATHER... He was the first Chief Justice of the United States." ( **Answer: Jay** )
* **Narciso López Monument:** "In 1850, Venezuelan-born general Narciso López... sailed from New Orleans with hundreds of soldiers, carrying [the Cuban flag] there for the very first time in history."

### **6. The Vanishing Act & The Finish**

* **Hale Boggs:** "He investigated a murder. He questioned the answer. He boarded a plane and vanished. The building next to you bears his name. Who was he?" ( **Answer: Hale Boggs** )
* **The Beacon:** "TAKE A PIC OF THE BEACON OF LIGHT STANDING BETWEEN JULIA AND HER BROTHER GIROD. Send me the name of the restaurant we're going to." ( **Answer: Junebug** )
* **The Final Sprint:** "🎉 You've completed the game! But wait! Quick! 🏃 Text **[TEAM_NAME]** to **504.581.5652** right now... The first team to do so wins a prize! 🏆"

create a collection of materials to review before hand from game page and a share button after so they can send themselves the game information after.

---

### **Mission Control Contact**

If players get stuck, the game repeatedly directs them:

> "Ooh, not quite! 🤔 Text **504-581-5652** and Mission Control will get you sorted."
