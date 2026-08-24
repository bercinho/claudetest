package com.familyhq.companion

import com.google.androidbrowserhelper.trusted.DelegationService

/**
 * Lets the web app's push notifications arrive as *this app's* notifications.
 *
 * Without this, a notification from the server is delivered by Chrome and shows
 * up wearing Chrome's icon and name, which is confusing on a family phone.
 * With it, the browser hands the notification to us and it appears as Family HQ
 * — same subscription, same Web Push, just presented properly.
 *
 * It is empty on purpose: the base class does all of it. It needs no code, only
 * the manifest entry that advertises it to the browser.
 */
class NotificationDelegationService : DelegationService()
