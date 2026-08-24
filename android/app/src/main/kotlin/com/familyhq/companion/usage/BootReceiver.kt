package com.familyhq.companion.usage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.familyhq.companion.data.Settings

/**
 * WorkManager survives a reboot on its own, so this is a belt-and-braces
 * re-arm: it costs nothing and covers the cases where it does not — a force
 * stop, some manufacturers' aggressive task killers, or an app update that
 * changed the interval.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
                if (Settings(context).configured) Scheduler.ensure(context)
            }
        }
    }
}
