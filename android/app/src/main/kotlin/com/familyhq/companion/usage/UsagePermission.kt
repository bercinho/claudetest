package com.familyhq.companion.usage

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings

/**
 * Usage access is not a runtime permission. There is no dialog to show: the
 * person has to find the app in a Settings list and switch it on. All the app
 * can do is check the app-op and take them to the right screen.
 */
object UsagePermission {

    fun granted(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false

        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        }

        // MODE_DEFAULT means "no explicit answer", which for this op is decided
        // by the PACKAGE_USAGE_STATS permission — which ordinary apps are never
        // granted. Treat it as off.
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /**
     * Opens the usage-access list. Some manufacturers do not ship that screen;
     * if it is missing, fall back to this app's own settings page, from which
     * the list is usually reachable. Returns false if neither opens.
     */
    fun openSettings(context: Context): Boolean {
        val candidates = listOf(
            Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                // Deep-links straight to our row where the OEM supports it.
                data = Uri.fromParts("package", context.packageName, null)
            },
            Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS),
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
            },
        )

        for (intent in candidates) {
            try {
                context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            } catch (e: Exception) {
                // Try the next one.
            }
        }
        return false
    }
}
