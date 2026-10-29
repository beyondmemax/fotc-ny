# FOTC NY

**A mentorship tracking app built for Friends of the Children New York.**

FOTC NY helps mentors, the youth they work with (Achievers), parents and caregivers, and supervisors stay connected around the same goals. Mentors log outings, assign and confirm goals, and track progress across the four Friends of the Children focus areas. Achievers see their own progress in a game-style dashboard. Supervisors get an overview of everything happening across their mentors.

🔗 **Live app:** [fotc-ny.web.app](https://fotc-ny.web.app)

---

## Who it's for

| Role | What they can do |
|---|---|
| **Mentor** | Log outing sessions, assign goals and season goals, confirm proof submitted by Achievers, chat with Achievers, view progress reports |
| **Achiever** (mentee) | See XP, level and goal progress, submit photo proof for goals, chat with their mentor |
| **Parent / Caregiver** | Confirm outings and stay informed about their child's sessions |
| **Supervisor** | Post announcements to mentors and view program-wide stats |

---

## Features

### Session journal
- Session date, time and Achiever are filled in automatically
- **Individual** or **Group** outings, with a roster picker for group sessions
- Log **external attendees** (siblings, family, friends) and **multiple locations**
- Session mood, summary, focus area tags and notes for parents
- Journal cards show who joined, where you went and which focus areas were covered

### Goals and season goals
- Mentors assign goals with due dates through a custom calendar picker
- Achievers submit **photo proof**, which mentors review and confirm
- **Season goals** (Summer, Fall, Spring) set targets for each focus area. Progress updates automatically from logged sessions and goals.
- When a season goal ends, the mentor chooses whether to **keep it for their records** or **remove it and start fresh**

### Four focus areas
Everything is tagged by the Friends of the Children focus areas:
- 🔵 **LE**: Learning & Education
- 🔴 **HWB**: Health & Well-Being
- 🟢 **CIB**: Community & Identity Building
- 🟣 **SEL**: Social-Emotional Learning

### Progress reports
- Circular progress rings for each focus area on every Achiever's card
- Tap into any area to see the sessions and goals behind it
- Achiever dashboard with XP, levels and goal completion

### Real-time chat
- One-on-one messaging between mentors and Achievers
- Double-tap to ❤️ a message, press and hold to reply
- Send photos from your camera or gallery, with a full-screen viewer that supports swipe-to-close
- Live **online / offline** status for each user

### Everything else
- Supervisor **announcements** that show up live on mentors' home screens
- Profile pictures (photos are compressed in the browser before they're saved)
- **Dark and light mode**
- Installable as a **Progressive Web App (PWA)** on iPhone and Android

---

## Tech stack

- **React**: the whole front end
- **Firebase Authentication**: role-based accounts with email verification
- **Cloud Firestore**: users, sessions, goals, messages, announcements, season goals
- **Firebase Realtime Database**: live online/offline presence
- **Firebase Hosting**: deployment

---

## Project history

This project was built **entirely on my MacBook**. For most of its development it lived only in a local folder: I edited it there and deployed straight to Firebase Hosting from my terminal, with no version control.

I recently **moved it over to GitHub** and now work on it in **GitHub Codespaces**. Because of that, the commit history here starts at the migration and doesn't show the months of work that came before it.

---

## Running it locally

```bash
git clone https://github.com/beyondmemax/fotc-ny.git
cd fotc-ny
npm install
npm start
```

You'll need your own Firebase project with **Authentication**, **Firestore** and **Realtime Database** turned on. Put your project's config in `src/firebase.js`.

### Deploying

```bash
npm install -g firebase-tools
firebase login
npm run build && firebase deploy
```

---

## Roadmap

- [ ] One-click quarterly report generation for mentors
- [ ] AI-suggested focus area tags from session notes
- [ ] Automated text confirmations for parents
- [ ] Audio reflections and workout logs for Achievers
- [ ] Activity streaks on the Achiever dashboard
- [ ] Onboarding walkthrough for new mentors
- [ ] Salesforce integration

---

## Author

**Maximus Bhuiyan**: design and development

Built for Friends of the Children New York.
