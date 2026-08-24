package com.familyhq.companion

import android.net.Uri
import com.familyhq.companion.data.Settings
import com.google.androidbrowserhelper.trusted.LauncherActivity

/**
 * The app's screens, which are the web app's screens, rendered by a Trusted Web
 * Activity: Chrome's engine with no browser interface around it.
 *
 * Why not a WebView? A TWA shares the browser's cookie jar and its push
 * subscription, so signing in and enabling notifications work exactly as they
 * already do — and Google Play is markedly less hostile to a TWA than to a
 * WebView wrapper. The trade is that the origin has to be verified: the server
 * must serve /.well-known/assetlinks.json naming this app's package and signing
 * certificate. Without that, this still opens, but as a Custom Tab with the
 * address bar showing.
 */
class TwaActivity : LauncherActivity() {

    override fun getLaunchingUrl(): Uri {
        // A tapped link wins, so notifications and shared links land on the
        // page they name.
        intent?.data?.let { if (it.scheme == "https") return it }

        val host = Settings(this).host
        if (host.isBlank()) return super.getLaunchingUrl()

        // `source` matches what the installed web app sends, so the server can
        // tell app traffic from browser traffic if it ever wants to.
        return Uri.parse("https://$host/?source=android")
    }
}
