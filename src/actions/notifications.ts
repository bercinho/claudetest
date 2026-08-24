"use server";

import { revalidatePath } from "next/cache";
import { requireParent, requireUser } from "@/lib/auth";
import { createDevice, deleteDevice, setDeviceActive } from "@/lib/devices";
import { newDeviceToken, removeSubscription, saveSubscription, sendTest } from "@/lib/push";
import { type ActionState, guard, int, ok, str, ValidationError } from "@/lib/form";

function refresh(): void {
  revalidatePath("/", "layout");
  revalidatePath("/family");
}

// ---------------------------------------------------------------------------
// Push subscriptions
// ---------------------------------------------------------------------------

/**
 * Stores the subscription the browser handed back after the person granted
 * permission. One row per browser, so a parent with a phone and a laptop gets
 * both.
 */
export async function subscribeToPush(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  label?: string;
}): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();

  const endpoint = String(subscription?.endpoint ?? "");
  const p256dh = String(subscription?.keys?.p256dh ?? "");
  const auth = String(subscription?.keys?.auth ?? "");
  if (!endpoint.startsWith("https://") || p256dh === "" || auth === "") {
    return { ok: false, message: "That subscription looks wrong" };
  }

  saveSubscription({
    userId: user.id,
    endpoint,
    p256dh,
    auth,
    label: String(subscription.label ?? "").slice(0, 60),
  });
  refresh();
  return { ok: true, message: "Notifications are on for this device" };
}

export async function unsubscribeFromPush(endpoint: string): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  removeSubscription(String(endpoint));
  refresh();
  return { ok: true, message: "Notifications are off for this device" };
}

export async function sendTestNotification(_prev: ActionState, _form: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const delivered = await sendTest(user.id);
    if (delivered === 0) {
      throw new ValidationError("Nothing was delivered — turn notifications on for this device first");
    }
    return ok(`Sent to ${delivered} device${delivered === 1 ? "" : "s"}`);
  });
}

// ---------------------------------------------------------------------------
// Companion devices
// ---------------------------------------------------------------------------

/**
 * Issues a device token. The token is shown once, in the result message —
 * only its hash is stored, so it cannot be recovered later.
 */
export async function addDevice(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const parent = await requireParent();
    const childId = int(form, "childId", { min: 1 });
    const name = str(form, "name", { required: true, max: 60 });

    const { token, hash } = newDeviceToken();
    createDevice({ childId, name, tokenHash: hash, createdBy: parent.id });

    refresh();
    return ok(`Token for ${name} — copy it now, it is not shown again: ${token}`);
  });
}

export async function toggleDevice(form: FormData): Promise<void> {
  await requireParent();
  setDeviceActive(Number(form.get("id")), form.get("active") === "1");
  refresh();
}

export async function removeDevice(form: FormData): Promise<void> {
  await requireParent();
  deleteDevice(Number(form.get("id")));
  refresh();
}
