package com.familyhq.companion

import android.app.Application
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.familyhq.companion.data.Settings
import com.familyhq.companion.usage.Scheduler

class FamilyHqApp : Application() {

    override fun onCreate() {
        super.onCreate()

        // Re-arms the periodic report on every cold start. Cheap, idempotent,
        // and it means a device that somehow lost its schedule recovers the
        // next time anybody opens the app.
        if (Settings(this).configured) Scheduler.ensure(this)

        publishSetupShortcut()
    }

    /**
     * Once a server address is saved, the launcher icon goes straight into the
     * app — so this is how the setup screen stays reachable, by long-pressing
     * the icon. Registered in code rather than declared in XML because a static
     * shortcut has to name its target package literally, and that differs
     * between the debug and release builds.
     */
    private fun publishSetupShortcut() {
        val shortcut = ShortcutInfoCompat.Builder(this, "setup")
            .setShortLabel(getString(R.string.shortcut_setup_short))
            .setLongLabel(getString(R.string.shortcut_setup_long))
            .setIcon(IconCompat.createWithResource(this, R.drawable.ic_shortcut_setup))
            .setIntent(
                Intent(this, SetupActivity::class.java).setAction(Intent.ACTION_VIEW),
            )
            .build()

        runCatching { ShortcutManagerCompat.setDynamicShortcuts(this, listOf(shortcut)) }
    }
}
