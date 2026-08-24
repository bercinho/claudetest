import Link from "next/link";
import { addDevice, removeDevice, sendTestNotification, toggleDevice } from "@/actions/notifications";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { NotificationToggle } from "@/components/pwa";
import { Disclosure, EmptyState, PageHeader, Pill, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { formatTimestamp, nowIn } from "@/lib/dates";
import { listDevices } from "@/lib/devices";
import { publicKey, subscriptionCount } from "@/lib/push";
import { listChildren } from "@/lib/queries";
import { formatMinutes, recentGrants } from "@/lib/screens";
import { recordedMinutes, topApps } from "@/lib/devices";

const PARENT_EVENTS = [
  ["📋", "A task is ticked off and needs reviewing"],
  ["🎮", "Screen time is asked for"],
  ["🎁", "A reward is requested"],
  ["🙋", "A request comes in"],
  ["🎓", "A school mark is entered and needs confirming"],
];

const CHILD_EVENTS = [
  ["🎮", "A screen-time claim is approved, reduced or declined"],
  ["📋", "A task is approved or sent back"],
  ["🙋", "A request is answered"],
  ["🎁", "A reward is approved or declined"],
  ["🎓", "A mark is confirmed, and what it was worth"],
  ["⚖️", "A house rule is applied, and why"],
  ["⏱️", "Screen time is added to or taken off today"],
];

export default async function NotificationsPage() {
  const user = await requireUser();
  const settings = getSettings();
  const isParent = user.role === "PARENT";
  const devices = isParent ? listDevices() : [];
  const children = isParent ? listChildren() : [];
  const subscribed = subscriptionCount(user.id);
  const events = isParent ? PARENT_EVENTS : CHILD_EVENTS;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Turn them on for each phone you use — the setting belongs to the device, not to you."
      />

      <Section title="This device">
        <div className="card">
          <NotificationToggle publicKey={publicKey()} installed={false} />
          <p className="mt-3 text-xs text-ink-muted">
            {subscribed === 0
              ? "No devices are set up for notifications yet."
              : `${subscribed} device${subscribed === 1 ? "" : "s"} currently set up for you.`}
          </p>

          {subscribed > 0 && (
            <ActionForm action={sendTestNotification} className="mt-3">
              <SubmitButton variant="quiet" size="sm" pendingLabel="Sending…">
                Send a test notification
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      </Section>

      <Section title="What you will be told about">
        <ul className="grid gap-1.5">
          {events.map(([icon, text]) => (
            <li key={text} className="card-tight flex items-center gap-3 px-3.5 py-2.5 text-sm">
              <span aria-hidden>{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-muted">
          Notifications go to every device you have turned on, and they replace one another rather than piling up.
        </p>
      </Section>

      <Section title="Getting it onto an Android phone">
        <div className="card text-sm">
          <ol className="grid list-decimal gap-2 pl-5">
            <li>Open the app in Chrome on the phone.</li>
            <li>
              Tap <strong>Install</strong> when the card at the top offers it — or Chrome&apos;s menu →{" "}
              <em>Add to Home screen</em>.
            </li>
            <li>Open it from the new icon. It runs in its own window, with no browser bars.</li>
            <li>Come back here and turn notifications on.</li>
          </ol>
          <p className="mt-3 text-xs text-ink-muted">
            Chrome only delivers notifications over HTTPS, so a home server needs a certificate for this step —
            see the deployment notes in the README. Everything else works over plain HTTP on the home network.
          </p>
        </div>
      </Section>

      {isParent && (
        <Section title="Companion devices" count={devices.filter((device) => device.active).length}>
          <p className="mb-3 text-sm text-ink-muted">
            The app cannot see what a phone is actually used for on its own. A small companion running on your
            son&apos;s phone can report Android&apos;s own usage figures here, so what he claimed can be compared with
            what the phone recorded. Each device gets its own token, which can do nothing except report usage for that
            one child.
          </p>

          {devices.length === 0 ? (
            <EmptyState icon="📱">No companion devices yet.</EmptyState>
          ) : (
            <ul className="mb-3 grid gap-2">
              {devices.map((device) => {
                const today = nowIn(settings.timezone).date;
                const recorded = recordedMinutes(device.child_id, today);
                const apps = topApps(device.child_id, today, 3);
                return (
                  <li key={device.id} className={`card ${device.active ? "" : "opacity-60"}`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span aria-hidden>📱</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{device.name}</span>
                        <span className="block text-xs text-ink-muted">
                          {device.child_emoji} {device.child_name} ·{" "}
                          {device.last_seen_at
                            ? `last reported ${formatTimestamp(device.last_seen_at, settings.timezone)}`
                            : "never reported"}
                        </span>
                      </span>
                      {!device.active && <Pill tone="warn">off</Pill>}
                      {recorded !== null && <Pill>{formatMinutes(recorded)} today</Pill>}

                      <form action={toggleDevice}>
                        <input type="hidden" name="id" value={device.id} />
                        <input type="hidden" name="active" value={device.active ? "0" : "1"} />
                        <SubmitButton variant="quiet" size="sm">
                          {device.active ? "Disable" : "Enable"}
                        </SubmitButton>
                      </form>
                      <form action={removeDevice}>
                        <input type="hidden" name="id" value={device.id} />
                        <ConfirmSubmit message={`Remove ${device.name}? Its token stops working immediately.`}>
                          Remove
                        </ConfirmSubmit>
                      </form>
                    </div>
                    {apps.length > 0 && (
                      <p className="mt-2 text-xs text-ink-muted">
                        Today: {apps.map((app) => `${app.name} ${formatMinutes(app.minutes)}`).join(" · ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {children.length > 0 && (
            <Disclosure label="+ Add a companion device" tone="primary">
              <ActionForm action={addDevice} className="card grid gap-3">
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                  <div>
                    <label className="label" htmlFor="device-name">
                      What is it
                    </label>
                    <input
                      id="device-name"
                      name="name"
                      className="field"
                      placeholder="Márk's phone"
                      maxLength={60}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="device-child">
                      Whose
                    </label>
                    <select id="device-child" name="childId" className="field" defaultValue={children[0]?.id}>
                      {children.map((child) => (
                        <option key={child.id} value={child.id}>
                          {child.emoji} {child.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-ink-muted">
                  The token is shown once when you create it and stored only as a hash, so it cannot be looked up
                  later. If you lose it, remove the device and add it again.
                </p>
                <div>
                  <SubmitButton pendingLabel="Creating…">Create a token</SubmitButton>
                </div>
              </ActionForm>
            </Disclosure>
          )}

          <p className="mt-3 text-xs text-ink-muted">
            The endpoint a companion talks to is documented in the README, under{" "}
            <em>Reporting real device usage</em>. There is no companion app in this repository yet — the server side
            is ready for one.
          </p>
        </Section>
      )}

      {isParent && (
        <Section title="Recent screen-time adjustments">
          <RecentAdjustments />
        </Section>
      )}

      {!isParent && (
        <p className="text-xs text-ink-muted">
          Notifications are the only thing on this page you control. What you get told about is set by the list
          above — you can turn the lot on or off, per phone.{" "}
          <Link href="/" className="font-semibold text-accent">
            Back home
          </Link>
        </p>
      )}
    </>
  );
}

function RecentAdjustments() {
  const settings = getSettings();
  const children = listChildren();
  const rows = children.flatMap((child) =>
    recentGrants(child.id, 4).map((grant) => ({ ...grant, child: child.name, emoji: child.emoji })),
  );
  if (rows.length === 0) return <EmptyState icon="⏱️">Nothing adjusted yet.</EmptyState>;

  return (
    <ul className="grid gap-1.5">
      {rows.slice(0, 8).map((row) => (
        <li key={`${row.child}-${row.id}`} className="card-tight flex items-center gap-3 px-3.5 py-2 text-sm">
          <span className={`font-semibold tabular-nums ${row.minutes < 0 ? "text-bad" : "text-good"}`}>
            {row.minutes > 0 ? "+" : "−"}
            {formatMinutes(Math.abs(row.minutes))}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
            {row.emoji} {row.child} · {row.date}
            {row.reason && ` · ${row.reason}`}
          </span>
          <span className="text-xs text-ink-muted">{formatTimestamp(row.created_at, settings.timezone)}</span>
        </li>
      ))}
    </ul>
  );
}
