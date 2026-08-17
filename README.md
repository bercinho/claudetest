# Family HQ

A small self-hosted web app for running the practical side of bringing up a child: the tasks
he's agreed to do, the house rules that earn or cost something, what he can spend points and
pocket money on, how much screen time he has left, the things he wants to ask for, how school is
going, how sport is going, and what his week actually looks like.

Everything lives in one SQLite file on your own machine. No accounts, no cloud, no third party
holding your family's data.

---

## What it does

**Tasks** — one-off or repeating (daily, school days, chosen weekdays), each with a due time,
a points value, an optional money value and an optional penalty if it's missed. Your son ticks
one off, you approve it, and the points land. Tasks you trust can be set to pay out on the spot
with no review. Occurrences that pass their due time without being touched are marked missed
automatically, and the penalty applies — but if he does it late and you approve it anyway, the
penalty is handed back.

**House rules** — standing agreements ("homework before screens", "rude answer costs 10") that
you apply with one tap from the dashboard, optionally with a note about what actually happened.
Every application is logged and can be undone.

**Rewards** — a shop of things points and pocket money buy: extra screen time, choosing dinner,
a sleepover. He asks, you approve, the balance is charged. Rewards can be limited in stock or
restricted to one child.

**Pocket money** — an allowance paid automatically each week or month, with two optional twists:
a bonus per point earned in the period, and a minimum number of points before the base amount is
paid at all. Money can be moved into savings goals, which takes it out of the spendable balance
until the goal is bought or cancelled.

**Screen and play time** — a daily allowance that differs between school days and the weekend.
He claims against it — "45 minutes, Fortnite with Máté" — and you approve it, **grant less than
he asked for**, or decline with a reason. Small claims can be set to go through without asking at
all, and you can require today's tasks to be done first, which puts every claim in front of you
until they are. Approved time comes off that day's allowance; nothing carries over to tomorrow.
A day can be topped up or docked one-off ("helped clear the garage, +30") without touching the
standing allowance, and a reward in the shop can hand over extra minutes when it's redeemed. If
you decide mid-session that's enough, ending a granted claim returns the minutes.

**Requests** — he asks for permission, money, a purchase or something else, and has to say why.
You answer with a note. Both of you can point back at what was agreed.

**School** — set up a term, add the subjects he takes in it, and record marks against them.
A mark stores what he got *and* what it was out of, so a 4/5 and an 87/100 sit side by side and
still average correctly, with a weight for the ones that count double. He can enter his own
marks; they wait in your approvals queue until you confirm them, which is also where you decide
whether the mark is worth points. Subject and term averages are shown on the school's own scale
and as a percentage.

**Sport** — a profile for the sport, club, coach and season, then every training session and
match. Regular training lives in the weekly timetable; matches and tournaments are added as
one-offs. After each one, record whether he turned up and write it up: score, goals, assists,
minutes, a coach rating out of five, the coach's feedback in their own words, and his own note.
The season header keeps the running totals — attendance rate, win/draw/loss, goals, average
coach rating. Sessions that have finished without being written up are listed at the top so
nothing is quietly forgotten.

**The week** — one page showing school and sport together, day by day, with arrows to move
between weeks. Lessons and regular training repeat every week; exams, matches and one-off
sessions are added to a date. Once something has finished, its attendance can be recorded
straight from the day it sits on.

**Activity** — every point and every cent, with the reason it moved. Balances are derived from
this log rather than stored, so the history and the numbers can never disagree.

---

## Running it

Requires Node 20.9 or newer.

```bash
npm install
npm run dev            # http://localhost:3000
```

The first page you see asks you to create a family and a parent PIN. Add your son from the
**Family** page, give him his own PIN, and you're going. The **Family** page is also where the
grading scale lives — it defaults to the Hungarian 1–5, and handles scales where a lower number
is the better mark.

To explore with realistic data first:

```bash
npm run seed           # creates Dad (PIN 1234) and Márk (PIN 1111)
```

That gives you a fortnight of ticked-off chores and screen-time claims, a term of school marks, a
full school and waterpolo timetable, a couple of written-up training sessions and a match, and a
few things waiting for a decision.

`npm run seed -- --force` wipes and reseeds. `npm run reset` deletes the database entirely so the
setup screen comes back.

### For real use at home

```bash
npm run build
npm start
```

Put it on a machine that stays on — a spare laptop, a Raspberry Pi, a small VPS — and reach it
from the phones on your home network. It's a plain web app, so "add to home screen" gives each of
you an icon that behaves like a native one.

| Variable        | Default             | What it's for                                                   |
| --------------- | ------------------- | --------------------------------------------------------------- |
| `DATABASE_PATH` | `data/family.db`    | Where the SQLite file lives. Point it at a backed-up directory.  |
| `APP_SECRET`    | generated on demand | Signs session cookies. Set it explicitly in production.          |
| `PORT`          | `3000`              | Port for `npm start`.                                            |

If `APP_SECRET` isn't set, a random one is generated once and kept in `data/.session-secret`, so
sessions survive restarts without any configuration.

**Back up `data/`.** That single directory is the whole application state.

Sessions are cookies signed with HMAC-SHA256 and PINs are hashed with scrypt, but this is built
for a home network. If you expose it to the internet, put it behind HTTPS — the session cookie is
only marked `Secure` when `NODE_ENV=production`, and a PIN is a PIN.

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

- **Money is always integer minor units** (cents/fillér) end to end. It's only turned into a
  string at the edge, by `formatMoney`.
- **Balances are never stored.** They're `SUM(amount)` over the `ledger` table. If you add a way
  for points or money to move, post a ledger entry rather than updating a running total.
- **Recurring things are a definition plus dated occurrences.** `tasks` → `task_instances` and
  `schedule_slots` → `schedule_events` follow the same shape: the definition holds the rule, the
  occurrence holds what actually happened on the day. Anything you can tick, miss or write up
  hangs off the occurrence.

### Scheduled work without a scheduler

There's no cron job. `runMaintenance()` runs in the signed-in layout on page load and is
throttled to once every 20 seconds. It creates occurrences two weeks ahead, marks overdue ones
missed, and releases pocket money whose payday has arrived.

The consequence worth knowing: **things happen when someone opens the app**, not at midnight. If
nobody opens it for three days, those three days of misses are all recorded the moment someone
does. Allowances only ever pay the current period, so a long gap can't release a burst of
back-payments — a missed week stays missed rather than arriving late.

Occurrences are never created for dates before a task or timetable slot was added, so setting an
old start date can't generate a pile of retroactive misses — or a month of training sessions
asking to be written up. Lessons and training are generated eight weeks ahead so the week view
can be browsed forward.

### Changing the database

`schema.sql` is always the current shape and is applied whole to a new database; it carries its
own `PRAGMA user_version`. An existing database is brought forward by the numbered files in
`src/lib/migrations/`, run once each on startup inside a transaction, with a foreign-key check
afterwards. When you change the schema: edit `schema.sql`, bump its `user_version`, add the
matching migration, and add it to the list in `db.ts`. The app refuses to start if those drift
apart.

`npm run seed` and `npm run reset` replace the database file, so restart the app afterwards —
a running server still holds the old file open.

---

## Things it deliberately doesn't do

No notifications or reminders — that's the parent's job, and a nagging app gets muted.
No photo proof for tasks; a note field is enough and keeps the database small.
No enforcement of screen time on the actual devices — the app is the agreement and the record,
not a network filter. It works because you both look at the same number.
No leaderboards between siblings.
No importing from the school's own system — marks are typed in, which takes seconds and means
the two of you look at them together.
