# Family HQ

A small self-hosted web app for running the practical side of bringing up a child: the tasks
he's agreed to do, the house rules that earn or cost something, what he can spend points and
pocket money on, and the things he wants to ask for.

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

**Requests** — he asks for permission, money, a purchase or extra screen time, and has to say
why. You answer with a note. Both of you can point back at what was agreed.

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
**Family** page, give him his own PIN, and you're going.

To explore with realistic data first:

```bash
npm run seed           # creates Dad (PIN 1234) and Márk (PIN 1111)
```

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
| `src/lib/ledger.ts` | Balances, goal reservations, penalty reversals.                           |
| `src/lib/scheduler.ts` | Creates task occurrences, closes overdue ones, pays allowances.        |
| `src/lib/queries.ts`| Every read the pages perform.                                             |
| `src/actions/`      | Server actions — one file per area, each doing its own permission check.  |
| `src/app/(app)/`    | The signed-in pages; `src/app/login/` is everything before that.          |
| `src/components/`   | Shared UI, including the shared task row and the one-tap house-rule bar.  |

Next.js (App Router) with server actions, SQLite via `better-sqlite3`, and Tailwind. There is no
API layer and no client-side store: pages read the database directly and actions write to it.

Two conventions worth knowing before you change anything:

- **Money is always integer minor units** (cents/fillér) end to end. It's only turned into a
  string at the edge, by `formatMoney`.
- **Balances are never stored.** They're `SUM(amount)` over the `ledger` table. If you add a way
  for points or money to move, post a ledger entry rather than updating a running total.

### Scheduled work without a scheduler

There's no cron job. `runMaintenance()` runs in the signed-in layout on page load and is
throttled to once every 20 seconds. It creates occurrences two weeks ahead, marks overdue ones
missed, and releases pocket money whose payday has arrived.

The consequence worth knowing: **things happen when someone opens the app**, not at midnight. If
nobody opens it for three days, those three days of misses are all recorded the moment someone
does. Allowances only ever pay the current period, so a long gap can't release a burst of
back-payments — a missed week stays missed rather than arriving late.

Occurrences are never created for dates before a task was added, so setting an old start date
can't generate a pile of retroactive misses.

---

## Things it deliberately doesn't do

No notifications or reminders — that's the parent's job, and a nagging app gets muted.
No photo proof for tasks; a note field is enough and keeps the database small.
No leaderboards between siblings.
