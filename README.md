# Family HQ

A small self-hosted web app for running the practical side of bringing up a child: the tasks he's
agreed to do, the house rules that earn or cost something, how much screen time he has left, what
he can spend points and pocket money on, the things he wants to ask for, how school is going, how
sport is going, and what his week actually looks like.

Everything lives in one SQLite file on your own machine. No accounts, no cloud, no third party
holding your family's data.

![The parent dashboard](docs/screenshots/04-parent-home.png)

---

## Contents

- [What it covers](#what-it-covers)
- [Running it](#running-it)
- [Guide for parents](#guide-for-parents)
  — [Signing in](#signing-in) · [Setting up your family](#setting-up-your-family) ·
  [The dashboard](#the-dashboard) · [Approvals](#approvals-the-one-page-to-check) ·
  [Tasks](#tasks) · [House rules](#house-rules) · [Screen and play time](#screen-and-play-time) ·
  [School](#school) · [Sport](#sport) · [The week](#the-week) ·
  [Pocket money](#pocket-money) · [Rewards](#rewards) · [Activity](#activity)
- [Guide for your son](#guide-for-your-son)
- [How it's put together](#how-its-put-together) (for developers)

---

## What it covers

| Section | What it's for |
| ------- | ------------- |
| **Tasks** | Chores, homework and habits — one-off or repeating, worth points and/or money |
| **House rules** | Standing agreements you apply with one tap, for good and for bad |
| **Screen time** | A daily allowance he claims against and you decide on |
| **School** | Subjects per term, marks with weighted averages, upcoming exams |
| **Sport** | Training and matches: attendance, results, coach feedback, season totals |
| **The week** | School and sport on one timetable, browsable week by week |
| **Pocket money** | Automatic allowance, performance bonus, savings goals |
| **Rewards** | A shop priced in points, money, or both — some of it screen time |
| **Requests** | He asks for something and has to say why; you answer with a note |
| **Activity** | Every point and every cent, with the reason it moved |

---

## Running it

Requires Node 20.9 or newer.

```bash
npm install
npm run dev            # http://localhost:3000
```

To explore with realistic data first:

```bash
npm run seed           # creates Dad (PIN 1234) and Márk (PIN 1111)
```

That gives you a fortnight of ticked-off chores and screen-time claims, a term of school marks, a
full school and waterpolo timetable, written-up training sessions and a match, and a few things
waiting for a decision. `npm run seed -- --force` wipes and reseeds; `npm run reset` deletes the
database so the setup screen comes back. Both replace the database file, so restart the app
afterwards.

### For real use at home

```bash
npm run build
npm start
```

Put it on a machine that stays on — a spare laptop, a Raspberry Pi, a small VPS — and reach it from
the phones on your home network. It's a plain web app, so "add to home screen" gives each of you an
icon that behaves like a native one.

| Variable        | Default             | What it's for                                                   |
| --------------- | ------------------- | --------------------------------------------------------------- |
| `DATABASE_PATH` | `data/family.db`    | Where the SQLite file lives. Point it at a backed-up directory.  |
| `APP_SECRET`    | generated on demand | Signs session cookies. Set it explicitly in production.          |
| `PORT`          | `3000`              | Port for `npm start`.                                            |

If `APP_SECRET` isn't set, a random one is generated once and kept in `data/.session-secret`, so
sessions survive restarts without any configuration.

**Back up `data/`.** That single directory is the whole application state.

Sessions are cookies signed with HMAC-SHA256 and PINs are hashed with scrypt, but this is built for
a home network. If you expose it to the internet, put it behind HTTPS — the session cookie is only
marked `Secure` when `NODE_ENV=production`, and a PIN is a PIN.

The whole app follows your phone's light or dark setting:

![Dark mode](docs/screenshots/40-dark-mode.png)

---

# Guide for parents

## Signing in

The very first time you open the app, there is nothing in it. It asks you to name the family and
pick your own PIN — that account becomes the first parent.

![First run](docs/screenshots/01-first-run.png)

After that, signing in is two taps: pick your face, type your PIN. Everyone in the family gets
their own profile and their own PIN, and what you see depends on which one you signed in as.

| Pick a profile | Enter the PIN |
| --- | --- |
| ![Profile picker](docs/screenshots/02-pick-profile.png) | ![PIN entry](docs/screenshots/03-enter-pin.png) |

A session lasts 30 days, so on your own phone you sign in roughly once a month.

## Setting up your family

**Family** (under *More*) is where you add people. Give each child a name, an emoji they'll
recognise, a colour, and a PIN. You can set their weekly pocket money here too, or leave it for
later.

![Family page](docs/screenshots/28-family.png)

![Adding a family member](docs/screenshots/29-add-member.png)

The same page holds the settings that change how the app talks:

- **What to call points** — "points", "stars", "credits", whatever works in your house.
- **Currency symbol** and whether it goes before or after the amount.
- **Timezone** — this decides when a day ends, so it controls when tasks count as missed and when
  pocket money is released.
- **The grading scale** — defaults to the Hungarian 1–5. Set the worst and best mark, and say which
  end is better, so German-style 1–6 scales work too.

Archiving a member keeps all their history but stops them signing in. There must always be at least
one parent, so the app won't let you archive or demote the last one.

## The dashboard

Home is the day at a glance. If anything is waiting on you, it says so at the top and links
straight through.

![Parent dashboard](docs/screenshots/04-parent-home.png)

Each child gets a card, and it's worth knowing what's on it:

![A child's card](docs/screenshots/05-child-card.png)

- Points balance and spendable pocket money, top right.
- Today's task progress, and how many were missed.
- The little bars are points per day over the last fortnight — red days are ones that cost points.
- Screen time left today, with a link if he's asked for more.
- **Next:** the next thing on his calendar, school or sport.
- Two collapsed lists: today's timetable and today's outstanding tasks — you can tick tasks off
  from here without leaving the page.
- The house-rule buttons, for one-tap enforcement (see below).

Underneath the cards is a one-line form for adding a one-off task for today, for when something
comes up.

## Approvals: the one page to check

If you only look at one page a day, look at this one. Everything waiting on a decision is here, in
one queue, with a badge on the nav showing the count.

![The approvals queue](docs/screenshots/06-approvals.png)

Five kinds of thing turn up, in this order:

**1. Completed tasks.** He says he's done it; you approve, send it back, or skip it. You can change
the points before approving — a job done properly can be worth more than the standing rate.

![Approving a task](docs/screenshots/07-approve-task.png)

**2. Screen time.** He's asked for minutes. Lower the number to grant less than he asked for, or
decline with a reason.

**3. School marks he entered himself.** These don't count towards any average until you confirm
them, and confirming is where you decide whether the mark is worth points. The suggested figure is a
starting point, not a rule.

**4. Reward requests.** He wants to spend points or money on something from the shop. The cost is
checked again at this moment, so he can't spend the same points twice.

**5. Requests.** Permission, money, a purchase, or anything else. You answer with a note, and both
of you can point back at it later.

## Tasks

A task is a definition — what, who, how often, worth how much — and the app turns it into a dated
occurrence he can tick off each day it's due.

![Tasks](docs/screenshots/08-tasks.png)

![Creating a task](docs/screenshots/09-new-task.png)

The fields that matter:

- **Repeats** — one-off, every day, school days, or specific weekdays.
- **Due by** — the time after which an untouched task counts as missed.
- **Points** and **Money** — either, both, or neither.
- **Missed penalty** — points docked if the day passes without it being done. Leave it at zero for
  anything you'd rather not make a battle.
- **Trust it** — pays out the moment he ticks it off, with no review from you. Good for the small
  daily things; keeps your approvals queue for the things that need judgement.

Tasks can be **paused** rather than deleted, which stops new occurrences without losing the
history. Deleting removes the task and its occurrences, but the points he already earned stay on
his balance — the ledger is never rewritten.

If a task is missed and the penalty applies, but he does it late and you approve it anyway, **the
penalty is handed back automatically.**

Below the list is the next seven days, so you can see what's coming and tick things off for any
child. Future days show "not yet" instead of a button — nobody can bank tomorrow's chores today.

## House rules

These are the standing agreements: the things that reliably earn something and the things that
reliably cost something. Write them down once, together, and then applying one is a single tap.

![House rules](docs/screenshots/10-house-rules.png)

![Applying a rule](docs/screenshots/11-apply-rule.png)

Each rule has a size in points and/or money, and can apply to everyone or to one child. Add a note
when you apply it — "before school" — and it shows up in the history so the *why* survives.

Every application is listed under **Recently applied** with an **Undo** button, which posts the
mirror-image entries and gives the points back. Rules can be turned off without being deleted.

The point of doing it this way: he can read the list. The consequence for a rude answer isn't your
mood that day, it's the number next to the rule.

## Screen and play time

A daily allowance, different on school days and at the weekend. He claims against it; you decide.

![Screen time](docs/screenshots/12-parent-screens.png)

The four tiles are **left today**, **used**, today's **allowance** (and how it was adjusted), and
how much is **waiting** on you.

When he asks, you get three options rather than two — approve, **grant less than he asked for**, or
decline with a reason:

![Deciding a claim](docs/screenshots/13-decide-claim.png)

**Adjust today** changes a single day without touching the standing allowance: `+30` for helping
with the garage, `-15` for leaving the tablet on the stairs. Each adjustment is listed and can be
undone.

If a session is already running and you decide that's enough, **That's enough** ends it and returns
the unused minutes to the day.

The settings are where the policy lives:

![Screen time settings](docs/screenshots/14-screen-settings.png)

- **School day / weekend day minutes** — Saturday and Sunday use the weekend figure.
- **Goes through without asking, up to** — set this to 30 and a quick half hour needs no
  permission. Set it to 0 and everything comes to you.
- **Today's tasks first** — while any of today's tasks are outstanding, *every* claim comes to you
  regardless of size. He can see this on his own screen, so it isn't a surprise.

Approved minutes come off the day they were claimed on, and nothing carries over to tomorrow.

> **This does not enforce anything on the devices themselves.** It is the agreement and the record,
> not a network filter. It works because you're both looking at the same number.

## School

Set up a term, add the subjects he takes in it, and record marks against them.

![School](docs/screenshots/15-school.png)

Each subject shows its weighted average — on your own grading scale and as a percentage — with a
colour so a subject that's slipping is obvious.

![A subject](docs/screenshots/16-subject-card.png)

Recording a mark takes a few seconds:

![Recording a mark](docs/screenshots/17-record-mark.png)

- **Mark** and **Out of** — a mark stores both, so a 4/5 and an 87/100 sit in the same list and
  still average correctly. Leave "out of" at your scale's maximum for ordinary marks.
- **Counts** — the weight. A big end-of-topic test can count double or triple.
- **Points to award** — optional. A good mark can be worth points, which feed his pocket-money
  bonus.

He can enter his own marks. Those arrive unconfirmed, don't count towards any average, and wait in
your approvals queue — which keeps the record honest without making you the only one who types.

**Exams** aren't recorded here; they live on the week's timetable, and the four-week list of what's
coming appears at the top of this page.

## Sport

A profile for the sport, club, coach and season, then a write-up per session.

![Sport](docs/screenshots/18-sport.png)

The header carries the season totals: attendance rate, win/draw/loss, goals, average coach rating.

Sessions that have **finished** without being written up are listed at the top, expanded and ready,
so nothing quietly disappears. One form closes a session off:

![Writing up a session](docs/screenshots/19-session-writeup.png)

Attendance, score, goals, assists, minutes, a coach rating out of five, the coach's feedback in
their own words, and his own note. A parent can attach points.

The result reads back as a record you can look through at the end of a season:

![A written-up session](docs/screenshots/20-session-record.png)

Regular training belongs in the weekly timetable; matches and tournaments are added there as
one-offs.

## The week

School and sport on one page, day by day, with arrows to move between weeks.

![The week](docs/screenshots/21-week.png)

Colours down the left edge separate lessons, exams, training, matches and tournaments. Today's
column is highlighted.

![One day](docs/screenshots/22-week-day.png)

Once something has finished, its attendance can be recorded from the day it sits on — "Were you
there?" with Yes / No / Excused, and a link through to write a sport session up properly. It only
asks once the session has actually ended, so this morning it won't ask about tonight's training.

**Repeats every week** is the timetable itself. Add a lesson or a regular training session with a
day, a time and a place:

![A weekly slot](docs/screenshots/23-weekly-slot.png)

Linking a lesson to a subject ties it to that subject's marks. Slots are bounded by dates (they
default to the term you're in), and can be paused. Occurrences are generated eight weeks ahead, so
you can look forward.

**Add something one-off** covers exams, matches, tournaments and extra sessions — anything on a
specific date rather than every week.

## Pocket money

![Pocket money](docs/screenshots/24-pocket-money.png)

The allowance runs itself:

![Allowance settings](docs/screenshots/25-allowance.png)

- **Base amount** and **how often** — weekly or monthly.
- **Payday** — 1–7 for Monday–Sunday, or a day of the month.
- **Bonus per point** — an extra amount for every point earned in the period. This is what ties
  chores, house rules, school marks and sport back to real money.
- **Minimum points for the base** — below this, the base is withheld for that period. The bonus
  still applies. Use it sparingly.

Money paid is money paid: allowances only ever pay the *current* period, so if the app sits unused
for three weeks it won't suddenly release three weeks of back-pay.

**Savings goals** take money out of his spendable balance until the goal is bought or cancelled, so
the number he sees as "to spend" is honest. **One-off adjustment** hands out or takes back points
and money outside any rule, with a reason he can read.

**Where it came from** is the ledger for that child — every movement with its cause.

## Rewards

The shop. Price things in points, money, or both.

![Rewards](docs/screenshots/26-rewards.png)

- **Stock** limits how many times something can be redeemed. Leave it blank for unlimited.
- **For** restricts a reward to one child.
- **Adds screen time** hands over extra minutes when the reward is redeemed — which is how "an
  extra hour of screen time" actually becomes an extra hour.

He asks, you approve, the balance is charged. Rewards can be hidden without being deleted.

## Activity

Every point and every cent, newest first, with the reason and the source: task, house rule, reward,
request, pocket money, savings goal, school mark, sport, or a manual adjustment.

![Activity](docs/screenshots/27-activity.png)

Balances are calculated from this log rather than stored, so the history and the numbers can never
disagree.

---

# Guide for your son

*This half is written to be read by the child, or read out to them.*

## Signing in

Tap your face, type your PIN. That's it. If you get the PIN wrong it just says so — nothing
happens, try again.

![Pick your profile](docs/screenshots/02-pick-profile.png)

Ask a parent if you want to change your PIN — it's on the Family page, and you'll need to know your
current one.

## Home

Everything you need for today, in the order you'll want it.

![Your home screen](docs/screenshots/30-child-home.png)

At the top: your points, how much money you have to spend, how many of today's tasks are done, and
how much screen time you've got left. Then a big tap-through for screen time, today's timetable,
today's tasks, anything you're waiting on a parent for, and your last two weeks of points.

## Your screen time

![Screen time](docs/screenshots/31-child-screens.png)

**Left today** is the number that matters. Ask for time by typing how long and what for, or tap one
of the quick buttons:

![Asking for time](docs/screenshots/32-child-claim.png)

Some things are worth knowing:

- **Green quick buttons go through on their own.** If a button is green, that amount doesn't need
  anyone's permission — tap it and it's yours.
- If your parents have switched on **tasks first**, you'll see a note saying so. While today's
  tasks aren't done, every request has to be asked for, however small.
- You can't ask for more than you have left. The app will tell you what's actually available.
- A parent can say yes, say no, or **give you less than you asked for** — 40 minutes instead of 60.
  If they leave a reason, you'll see it.
- **Withdraw** takes back a request you've changed your mind about.
- It resets every day. Nothing carries over, so there's no point hoarding it.

The chart shows what you actually used over the last fortnight.

## Your tasks

![Your tasks](docs/screenshots/33-child-tasks.png)

Today's jobs are at the top. Tap **I did it** and it either lands straight away or goes to a parent
to check — depends on the task.

- **Waiting for review** means a parent hasn't looked yet. **Undo** takes it back if you tapped by
  mistake.
- **Missed** means the time passed. If there was a penalty, you lost those points — but you can
  still tap **Done late**, and if a parent approves it **you get the penalty back**. Late is much
  better than never.
- **Not accepted** means a parent sent it back. There's usually a note saying why. Fix it and tap
  again.
- Tasks further down the week say **not yet** instead of a button. You can't do Thursday's job on
  Monday.

## Your week

![Your week](docs/screenshots/34-child-week.png)

Lessons, training, exams and matches, all in one place. Use the arrows to look ahead.

After a training session or a match, the app asks **"Were you there?"** — answer honestly. It only
asks once the session has actually finished.

You can add a one-off yourself: an exam a teacher just announced, or an extra session. You can
remove things you added, but not lessons or training a parent set up.

## Your school marks

![Your marks](docs/screenshots/35-child-school.png)

Every subject with its average, and every mark that went into it. A mark counting **2×** pulls the
average twice as hard.

You can add marks yourself as soon as you get them — tap **+ Record a mark**, put in what you got
and what it was out of. It'll say **to confirm** until a parent checks it, and it doesn't move your
average until then. Adding it yourself is still worth doing: it's how the good ones get noticed.

## Your sport

![Your season](docs/screenshots/36-child-sport.png)

Your attendance, your record, your goals, your average coach rating, and what's coming up. Sessions
that need writing up are at the top — you can fill in your own note, and the coach's feedback ends
up here too, so you can look back at what they actually said.

## The reward shop

![The shop](docs/screenshots/37-child-rewards.png)

Things you can spend points and money on. If a button says **Not enough yet**, you can see exactly
how far off you are. **Ask to redeem** sends it to a parent — you can add a note to make your case.

Some rewards give you screen time. Those say so.

## Asking for something

![Asking](docs/screenshots/38-child-ask.png)

For anything that isn't in the shop: permission to go somewhere, money for a school trip, something
you want to buy, extra screen time.

**Say why.** The "why" box is the part that actually works. Who, where, until when, how you'll get
home. A request with a real answer in it gets a yes far more often than "can I go out".

Your parent's answer is saved next to your question, so neither of you has to remember what was
agreed.

## Your money

![Your money](docs/screenshots/39-child-money.png)

**To spend** is what you can actually use right now. **In goals** is money you've put aside for
something — it's still yours, it just isn't spendable until you take it out again or buy the thing.

Set up a savings goal for something big, then move money into it as you earn. **Where it came from**
lists every single amount and why you got it.

---

## How it's put together

| Path                | What's in it                                                              |
| ------------------- | ------------------------------------------------------------------------- |
| `src/lib/schema.sql`| The whole data model, commented. Start here.                              |
| `src/lib/migrations/` | Numbered SQL files that bring an older database up to that shape.       |
| `src/lib/ledger.ts` | Balances, goal reservations, penalty reversals.                           |
| `src/lib/grades.ts` | Turning marks on any scale into comparable numbers and averages.          |
| `src/lib/screens.ts` | The day's screen-time arithmetic: allowance, adjustments, what's left.   |
| `src/lib/scheduler.ts` | Creates task and timetable occurrences, closes overdue ones, pays allowances. |
| `src/lib/queries.ts`| Every read the pages perform.                                             |
| `src/actions/`      | Server actions — one file per area, each doing its own permission check.  |
| `src/app/(app)/`    | The signed-in pages; `src/app/login/` is everything before that.          |
| `src/components/`   | Shared UI, including the shared task row and the one-tap house-rule bar.  |

Next.js (App Router) with server actions, SQLite via `better-sqlite3`, and Tailwind. There is no
API layer and no client-side store: pages read the database directly and actions write to it.

Three conventions worth knowing before you change anything:

- **Money is always integer minor units** (cents/fillér) end to end. It's only turned into a string
  at the edge, by `formatMoney`.
- **Balances are never stored.** They're `SUM(amount)` over the `ledger` table. If you add a way for
  points or money to move, post a ledger entry rather than updating a running total.
- **Recurring things are a definition plus dated occurrences.** `tasks` → `task_instances` and
  `schedule_slots` → `schedule_events` follow the same shape: the definition holds the rule, the
  occurrence holds what actually happened on the day. Anything you can tick, miss or write up hangs
  off the occurrence.

### Who may do what

Every server action does its own check rather than trusting the page that called it. The shape of
it: a parent may do anything; a child may act on their own records only.

Children can tick off tasks, claim screen time, enter marks, record attendance, ask for things, and
move their own money between goals. They cannot award points, confirm marks, decide claims, change
any allowance or budget, edit the timetable, or delete anything they didn't create. Marks a child
enters stay unconfirmed and uncounted until a parent confirms them.

### Scheduled work without a scheduler

There's no cron job. `runMaintenance()` runs in the signed-in layout on page load and is throttled
to once every 20 seconds. It creates occurrences ahead of time, marks overdue ones missed, and
releases pocket money whose payday has arrived.

The consequence worth knowing: **things happen when someone opens the app**, not at midnight. If
nobody opens it for three days, those three days of misses are all recorded the moment someone does.
Allowances only ever pay the current period, so a long gap can't release a burst of back-payments —
a missed week stays missed rather than arriving late.

Occurrences are never created for dates before a task or timetable slot was added, so setting an old
start date can't generate a pile of retroactive misses — or a month of training sessions asking to be
written up. Lessons and training are generated eight weeks ahead so the week view can be browsed
forward.

### Changing the database

`schema.sql` is always the current shape and is applied whole to a new database; it carries its own
`PRAGMA user_version`. An existing database is brought forward by the numbered files in
`src/lib/migrations/`, run once each on startup inside a transaction, with a foreign-key check
afterwards. When you change the schema: edit `schema.sql`, bump its `user_version`, add the matching
migration, and add it to the list in `db.ts`. The app refuses to start if those drift apart.

---

## Things it deliberately doesn't do

No notifications or reminders — that's the parent's job, and a nagging app gets muted.
No photo proof for tasks; a note field is enough and keeps the database small.
No leaderboards between siblings.
No importing from the school's own system — marks are typed in, which takes seconds and means the
two of you look at them together.
No enforcement of screen time on the actual devices — the app is the agreement and the record, not a
network filter.
