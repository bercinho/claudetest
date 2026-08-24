import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db";
import { nowIn } from "@/lib/dates";
import { deviceFromToken, recordUsage, recordedMinutes } from "@/lib/devices";
import { screenDay } from "@/lib/screens";

/**
 * The only endpoint a companion app needs.
 *
 *   GET  /api/usage   — what the server thinks of today: allowance, used, left
 *   POST /api/usage   — report what the device actually recorded for a day
 *
 * Both authenticate with `Authorization: Bearer <device token>`. A token is
 * created by a parent on the Family page and shown once; it identifies one
 * device belonging to one child, and can do nothing else.
 */

const MAX_BODY_BYTES = 16 * 1024;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export async function GET(request: Request) {
  const token = bearer(request);
  if (!token) return unauthorized();
  const device = deviceFromToken(token);
  if (!device) return unauthorized();

  const { timezone } = getSettings();
  const today = nowIn(timezone).date;
  const day = screenDay(device.child_id, today);

  return NextResponse.json({
    device: { id: device.id, name: device.name },
    timezone,
    date: today,
    tracking: day.active,
    allowanceMinutes: day.allowance,
    usedMinutes: day.used,
    remainingMinutes: day.remaining,
    awaitingMinutes: day.awaiting,
    recordedMinutes: recordedMinutes(device.child_id, today),
  });
}

export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return unauthorized();
  const device = deviceFromToken(token);
  if (!device) return unauthorized();

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "body too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  // A single day, or a batch of them after the phone has been offline.
  const entries = Array.isArray((body as { days?: unknown })?.days)
    ? ((body as { days: unknown[] }).days as unknown[])
    : [body];
  if (entries.length === 0 || entries.length > 60) {
    return NextResponse.json({ error: "send between 1 and 60 days" }, { status: 400 });
  }

  const { timezone } = getSettings();
  const today = nowIn(timezone).date;
  const accepted: string[] = [];

  for (const entry of entries) {
    const record = entry as { date?: unknown; minutes?: unknown; apps?: unknown };
    const date = typeof record.date === "string" ? record.date : today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: `bad date: ${String(record.date)}` }, { status: 400 });
    }
    if (date > today) {
      return NextResponse.json({ error: "cannot report a future day" }, { status: 400 });
    }

    const minutes = Number(record.minutes);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
      return NextResponse.json({ error: "minutes must be between 0 and 1440" }, { status: 400 });
    }

    // Keep only the shape we use, so a companion cannot store arbitrary blobs.
    const apps = Array.isArray(record.apps)
      ? JSON.stringify(
          (record.apps as { name?: unknown; minutes?: unknown }[])
            .map((app) => ({
              name: String(app?.name ?? "").slice(0, 60),
              minutes: Math.max(0, Math.min(1440, Math.round(Number(app?.minutes) || 0))),
            }))
            .filter((app) => app.name !== "" && app.minutes > 0)
            .sort((a, b) => b.minutes - a.minutes)
            .slice(0, 20),
        )
      : "";

    recordUsage({
      childId: device.child_id,
      deviceId: device.id,
      date,
      minutes: Math.round(minutes),
      apps: apps === "[]" ? "" : apps,
    });
    accepted.push(date);
  }

  return NextResponse.json({ ok: true, accepted });
}
