"use client";

import { useEffect, useState } from "react";
import { subscribeToPush, unsubscribeFromPush } from "@/actions/notifications";

/** Registers the service worker once, on every page. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // A failed registration only costs the offline page and notifications.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * The "add to home screen" card. Chrome on Android fires `beforeinstallprompt`
 * when the app qualifies; we hold onto it so the offer appears in the page
 * rather than as a banner the browser may or may not show.
 */
export function InstallCard() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    try {
      setDismissed(localStorage.getItem("hideInstallCard") === "1");
    } catch {
      /* private mode: just show it */
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed || !event) return null;

  return (
    <div className="card mb-5 flex flex-wrap items-center gap-3 border-accent/40 bg-accent-soft">
      <span aria-hidden className="text-2xl">
        📲
      </span>
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">Add Family HQ to your home screen</span>
        <span className="block text-ink-muted">
          It gets its own icon and opens without browser bars — and it&apos;s needed for notifications.
        </span>
      </p>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={async () => {
          await event.prompt();
          const choice = await event.userChoice;
          if (choice.outcome === "accepted") setInstalled(true);
          setEvent(null);
        }}
      >
        Install
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem("hideInstallCard", "1");
          } catch {
            /* nothing to remember it with; it will offer again */
          }
        }}
      >
        Not now
      </button>
    </div>
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

type State = "checking" | "unsupported" | "blocked" | "off" | "on" | "working";

/**
 * The notification switch. Browsers only allow asking for permission from a
 * real tap, so this has to be a button rather than something automatic.
 */
export function NotificationToggle({ publicKey, installed }: { publicKey: string; installed: boolean }) {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }

    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setState(subscription ? "on" : "off");
      })
      .catch(() => {
        if (!cancelled) setState("off");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setState("working");
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));

      const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const result = await subscribeToPush({
        endpoint: json.endpoint ?? "",
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        label: navigator.userAgent.includes("Android") ? "Android" : "This browser",
      });
      setMessage(result.message);
      setState(result.ok ? "on" : "off");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not turn notifications on");
      setState("off");
    }
  }

  async function turnOff() {
    setState("working");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeFromPush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setMessage("Notifications are off for this device");
      setState("off");
    } catch {
      setState("on");
    }
  }

  if (state === "unsupported") {
    return (
      <p className="text-sm text-ink-muted">
        This browser cannot do notifications. On Android, use Chrome and install the app first.
      </p>
    );
  }

  if (state === "blocked") {
    return (
      <p className="text-sm text-bad">
        Notifications are blocked for this site. Turn them back on in the browser&apos;s site settings, then reload.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={state === "checking" || state === "working"}
          onClick={state === "on" ? turnOff : turnOn}
          className={`btn btn-sm ${state === "on" ? "btn-quiet" : "btn-primary"}`}
        >
          {state === "working"
            ? "Just a second…"
            : state === "on"
              ? "Turn off on this device"
              : "Turn on for this device"}
        </button>
        {state === "on" && <span className="pill pill-good">on for this device</span>}
      </div>

      {!installed && state !== "on" && (
        <p className="mt-2 text-xs text-ink-muted">
          On Android, add the app to your home screen first — Chrome only delivers notifications to installed apps.
        </p>
      )}
      {message && <p className="mt-2 text-sm text-ink-muted">{message}</p>}
    </div>
  );
}

/** Reports whether the page is running as an installed app, for copy that depends on it. */
export function useStandalone(): boolean {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => setStandalone(isStandalone()), []);
  return standalone;
}
