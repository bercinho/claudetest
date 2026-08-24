package com.familyhq.companion.usage

import android.content.Context
import com.familyhq.companion.data.ApiClient
import com.familyhq.companion.data.ApiException
import com.familyhq.companion.data.Settings
import com.familyhq.companion.data.Snapshot
import java.io.IOException
import java.time.Instant
import java.time.temporal.ChronoUnit

/** How a single report attempt went. */
sealed interface ReportOutcome {

    /** The server took the numbers. [snapshot] is today as the server now sees it. */
    data class Sent(val days: List<String>, val minutesToday: Int, val snapshot: Snapshot?) : ReportOutcome

    /** No server address or no device token yet. */
    data object NotConfigured : ReportOutcome

    /** Usage access is switched off, so there is nothing to read. */
    data object NoPermission : ReportOutcome

    /** [retryable] is false for anything trying again would not fix, like a rejected token. */
    data class Failed(val message: String, val retryable: Boolean) : ReportOutcome
}

/**
 * One report: ask the server what day it is, read the phone, send the numbers.
 *
 * The background worker and the "Report now" button both call this, so what a
 * parent sees when they press the button is exactly what happens on its own.
 */
object UsageReporter {

    /** Enough history on a first run to make the screen-time page look alive. */
    private const val FIRST_RUN_DAYS = 7

    /**
     * Yesterday is always re-sent, because the last run of the day happened
     * before the day ended and its total was therefore short.
     */
    private const val MIN_DAYS = 2

    /** The event stream does not go back much further than this anyway. */
    private const val MAX_DAYS = 14

    fun runOnce(context: Context, now: Long = System.currentTimeMillis()): ReportOutcome {
        val settings = Settings(context)
        if (!settings.configured) return remember(settings, ReportOutcome.NotConfigured)
        if (!UsagePermission.granted(context)) return remember(settings, ReportOutcome.NoPermission)

        val client = ApiClient(settings.host, settings.token)

        val snapshot = try {
            client.snapshot()
        } catch (e: ApiException) {
            return remember(settings, ReportOutcome.Failed(e.message.orEmpty(), retryable = e.status !in 400..499))
        } catch (e: IOException) {
            return remember(settings, ReportOutcome.Failed(offline(settings.host), retryable = true))
        }

        if (snapshot.timezone.isNotBlank()) settings.timezone = snapshot.timezone

        val days = UsageReader(context).read(
            timezone = settings.timezone,
            days = daysToSend(settings.lastSuccessAt, now, settings.timezone),
            now = now,
        )

        val accepted = try {
            client.report(days)
        } catch (e: ApiException) {
            return remember(settings, ReportOutcome.Failed(e.message.orEmpty(), retryable = e.status !in 400..499))
        } catch (e: IOException) {
            return remember(settings, ReportOutcome.Failed(offline(settings.host), retryable = true))
        }

        settings.lastSuccessAt = now

        val today = days.lastOrNull()?.minutes ?: 0
        // Read it back so the setup screen shows the server's own arithmetic
        // rather than ours. Not worth failing the report over.
        val after = runCatching { client.snapshot() }.getOrNull() ?: snapshot

        return remember(settings, ReportOutcome.Sent(accepted, today, after))
    }

    /**
     * How many days to send, ending with today. Normally two; more after the
     * phone has been off, out of signal, or newly set up.
     */
    internal fun daysToSend(lastSuccessAt: Long, now: Long, timezone: String): Int {
        if (lastSuccessAt <= 0L) return FIRST_RUN_DAYS

        val zone = UsageReader.zoneOrDefault(timezone)
        val since = ChronoUnit.DAYS.between(
            Instant.ofEpochMilli(lastSuccessAt).atZone(zone).toLocalDate(),
            Instant.ofEpochMilli(now).atZone(zone).toLocalDate(),
        )

        return (since + 1).coerceIn(MIN_DAYS.toLong(), MAX_DAYS.toLong()).toInt()
    }

    private fun offline(host: String) = "Could not reach $host. Is the phone online, and on the right network?"

    /** Keeps the last outcome so the setup screen can explain itself later. */
    private fun remember(settings: Settings, outcome: ReportOutcome): ReportOutcome {
        settings.lastStatus = when (outcome) {
            is ReportOutcome.Sent ->
                "Sent ${outcome.days.size} ${if (outcome.days.size == 1) "day" else "days"}, " +
                    "${outcome.minutesToday} min today."
            ReportOutcome.NotConfigured -> "Waiting for the server address and a device token."
            ReportOutcome.NoPermission -> "Usage access is off, so there is nothing to read."
            is ReportOutcome.Failed -> outcome.message
        }
        return outcome
    }
}
