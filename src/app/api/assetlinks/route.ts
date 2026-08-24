import { NextResponse } from "next/server";

/**
 * Digital Asset Links, served at /.well-known/assetlinks.json by a rewrite in
 * next.config.ts.
 *
 * This file is how the server says "that Android app is mine". Chrome fetches
 * it when the app starts and, if it finds the app's package name and signing
 * certificate here, hands over the whole window: no address bar, no browser
 * interface. Without it the app still works, but as a Custom Tab with the
 * address bar visible — which is the honest fallback, because an unverified app
 * has no business hiding whose page it is showing.
 *
 * Two environment variables fill it in:
 *
 *   ANDROID_PACKAGE_NAME=com.yourname.familyhq
 *   ANDROID_CERT_FINGERPRINTS=AB:CD:...:EF
 *
 * The fingerprint is the SHA-256 of the signing certificate, uppercase hex with
 * colons. Give it more than one — separated by commas — when you need to accept
 * both your upload key and the key Google Play re-signs with, which you will if
 * you use Play App Signing. android/README.md says where to find both.
 */

const FINGERPRINT = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/;

export const dynamic = "force-dynamic";

export async function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim() ?? "";
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value !== "");

  // An empty list is a valid answer: it means "no Android app is mine", which
  // is true until you have built and signed one. Returning nonsense instead
  // would leave Chrome retrying a broken relationship.
  if (packageName === "" || fingerprints.length === 0) {
    return json([]);
  }

  const bad = fingerprints.filter((value) => !FINGERPRINT.test(value));
  if (bad.length > 0) {
    // Loud, because a typo here fails silently as "the app opens with an
    // address bar and nobody knows why".
    console.warn(
      `[assetlinks] ignoring ${bad.length} malformed certificate fingerprint(s). ` +
        "Expected 32 uppercase hex pairs separated by colons.",
    );
  }

  // Deduplicated, because the same key written twice — easy to do when adding
  // the Play signing key next to the upload key — would be published twice.
  const usable = [...new Set(fingerprints.filter((value) => FINGERPRINT.test(value)))];
  if (usable.length === 0) return json([]);

  return json([
    {
      // The one relation a Trusted Web Activity needs. It is also what lets the
      // app present this origin's push notifications as its own.
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: usable,
      },
    },
  ]);
}

function json(body: unknown) {
  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      // Chrome caches this itself; a day is long enough to avoid a fetch on
      // every launch and short enough that adding a fingerprint takes effect.
      "Cache-Control": "public, max-age=86400",
    },
  });
}
