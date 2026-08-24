package com.familyhq.companion.usage

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The background half of the app. WorkManager decides when this runs; all it
 * has to do is be honest about whether trying again would help, so a phone in a
 * tunnel is retried and a rejected token is not.
 */
class ReportWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        when (val outcome = UsageReporter.runOnce(applicationContext)) {
            is ReportOutcome.Sent -> Result.success()

            // Nothing to do until someone finishes setup or grants access.
            // Failing would spend the backoff budget on a problem no amount of
            // retrying can solve; the next periodic run will pick it up.
            ReportOutcome.NotConfigured, ReportOutcome.NoPermission -> Result.success()

            is ReportOutcome.Failed -> if (outcome.retryable) Result.retry() else Result.failure()
        }
    }
}
