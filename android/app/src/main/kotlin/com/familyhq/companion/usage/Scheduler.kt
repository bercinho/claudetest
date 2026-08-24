package com.familyhq.companion.usage

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * When the reporting happens.
 *
 * Every six hours, which is four reports a day: enough that the screen-time
 * page is never badly out of date, few enough that nobody notices the battery.
 * WorkManager will slide those around to suit the device, and will not run at
 * all while the phone is in a deep doze — that is the deal, and it is the right
 * one for a number that only has to be roughly current.
 */
object Scheduler {

    private const val PERIODIC = "usage-report-periodic"
    private const val ONE_OFF = "usage-report-now"

    private val onlyWhenOnline = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    /**
     * Makes sure the repeating report exists. Safe to call as often as you
     * like — UPDATE replaces the previous schedule in place, so the interval
     * changing in a later version of the app actually takes effect rather than
     * being ignored in favour of what was enqueued at install time.
     */
    fun ensure(context: Context) {
        val request = PeriodicWorkRequestBuilder<ReportWorker>(6, TimeUnit.HOURS)
            .setConstraints(onlyWhenOnline)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
            // Don't fire the moment the app is opened; the first run happens
            // from the setup screen anyway.
            .setInitialDelay(30, TimeUnit.MINUTES)
            .build()

        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    /** "Report now". Replaces any queued one-off so pressing twice does one report. */
    fun reportNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<ReportWorker>()
            .setConstraints(onlyWhenOnline)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context)
            .enqueueUniqueWork(ONE_OFF, ExistingWorkPolicy.REPLACE, request)
    }

    /** Stops reporting entirely, for when a device is handed on to someone else. */
    fun stop(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        WorkManager.getInstance(context).cancelUniqueWork(ONE_OFF)
    }
}
