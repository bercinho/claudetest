package com.familyhq.companion.usage

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import com.familyhq.companion.data.AppUsage
import com.familyhq.companion.data.DayUsage
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToInt

/**
 * Turns Android's usage statistics into "he spent 84 minutes on his phone
 * yesterday, mostly in these three apps".
 *
 * Two deliberate choices worth knowing about:
 *
 *  * **Days are the server's days.** The phone might be in a different
 *    timezone, or travelling; a day has to mean the same thing on both sides or
 *    the allowance stops making sense. The server tells us its timezone and we
 *    cut the day up accordingly.
 *
 *  * **Only apps with a launcher icon are counted.** That is the set a person
 *    would call "apps" — it leaves out the system UI, the keyboard, the
 *    launcher's own wallpaper service and the dozens of other packages that are
 *    technically in the foreground. It also means package names can be turned
 *    into real names without asking for QUERY_ALL_PACKAGES, which Google Play
 *    treats as a sensitive permission.
 */
class UsageReader(private val context: Context) {

    private val manager =
        context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager

    /**
     * Reads the last [days] days, ending with today in [timezone]. Today is
     * always included and is always partial — it gets re-reported on the next
     * run, and the server overwrites rather than adds up, so that is fine.
     */
    fun read(timezone: String, days: Int, now: Long = System.currentTimeMillis()): List<DayUsage> {
        val zone = zoneOrDefault(timezone)
        val today = java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        val labels = launchableApps()

        return (days - 1 downTo 0).map { back ->
            val date = today.minusDays(back.toLong())
            readDay(date, zone, labels, now)
        }
    }

    private fun readDay(
        date: LocalDate,
        zone: ZoneId,
        labels: Map<String, String>,
        now: Long,
    ): DayUsage {
        val begin = date.atStartOfDay(zone).toInstant().toEpochMilli()
        val end = minOf(date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli(), now)

        val perPackage = if (end > begin) foregroundMillis(begin, end) else emptyMap()

        val apps = perPackage
            .filterKeys { it in labels && it != context.packageName }
            .map { (pkg, millis) -> AppUsage(labels.getValue(pkg), minutes(millis)) }
            .filter { it.minutes > 0 }
            .sortedByDescending { it.minutes }

        // The total is the sum of what we are willing to name, so that the
        // number and the breakdown always agree with each other.
        val total = apps.sumOf { it.minutes }.coerceIn(0, MINUTES_IN_A_DAY)

        return DayUsage(date = date.toString(), minutes = total, apps = apps.take(TOP_APPS))
    }

    /**
     * Foreground milliseconds per package between [begin] and [end], from the
     * event stream. Events are the accurate source — the daily buckets Android
     * also keeps are aligned to its own idea of a day, not ours.
     */
    private fun foregroundMillis(begin: Long, end: Long): Map<String, Long> {
        val manager = manager ?: return emptyMap()

        val totals = mutableMapOf<String, Long>()
        val openedAt = mutableMapOf<String, Long>()

        val stream = try {
            manager.queryEvents(begin, end)
        } catch (e: SecurityException) {
            return emptyMap() // usage access was switched off underneath us
        }

        val event = UsageEvents.Event()
        var sawAnything = false

        while (stream.hasNextEvent()) {
            stream.getNextEvent(event)
            val pkg = event.packageName ?: continue
            sawAnything = true

            when (event.eventType) {
                EVENT_FOREGROUND ->
                    // Several activities of one app can resume in a row; the
                    // first one starts the clock.
                    openedAt.putIfAbsent(pkg, event.timeStamp.coerceAtLeast(begin))

                EVENT_BACKGROUND, EVENT_STOPPED -> {
                    val from = openedAt.remove(pkg) ?: continue
                    val until = event.timeStamp.coerceIn(begin, end)
                    if (until > from) totals[pkg] = (totals[pkg] ?: 0L) + (until - from)
                }
            }
        }

        // Anything still open when the window closed — the app he is holding
        // right now, on today's window — counts up to the window's edge.
        openedAt.forEach { (pkg, from) ->
            if (end > from) totals[pkg] = (totals[pkg] ?: 0L) + (end - from)
        }

        if (!sawAnything) return aggregateFallback(begin, end)
        return totals
    }

    /**
     * Android keeps the detailed event stream for a limited window — roughly a
     * week — so a backfill after a long gap finds nothing there. The rolled-up
     * statistics survive much longer. They are less precise about where a day
     * begins, which is why they are only a fallback.
     */
    private fun aggregateFallback(begin: Long, end: Long): Map<String, Long> {
        val manager = manager ?: return emptyMap()
        return try {
            manager.queryAndAggregateUsageStats(begin, end)
                .mapValues { (_, stats) -> stats.totalTimeInForeground }
                .filterValues { it > 0 }
        } catch (e: SecurityException) {
            emptyMap()
        }
    }

    /** Package name to display name, for every app with a launcher icon. */
    private fun launchableApps(): Map<String, String> {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val packageManager = context.packageManager

        @Suppress("DEPRECATION")
        val resolved = try {
            packageManager.queryIntentActivities(intent, 0)
        } catch (e: Exception) {
            emptyList()
        }

        val labels = mutableMapOf<String, String>()
        for (info in resolved) {
            val pkg = info.activityInfo?.packageName ?: continue
            if (labels.containsKey(pkg)) continue
            val label = runCatching { info.loadLabel(packageManager).toString() }
                .getOrNull()
                ?.takeIf { it.isNotBlank() }
                ?: pkg
            labels[pkg] = label
        }
        return labels
    }

    companion object {
        /**
         * Event type codes. Spelled out rather than referenced so that one file
         * does not need three `Build.VERSION` branches: 1 and 2 have been
         * MOVE_TO_FOREGROUND and MOVE_TO_BACKGROUND since API 21 and are the
         * same values as ACTIVITY_RESUMED and ACTIVITY_PAUSED; 23 is
         * ACTIVITY_STOPPED, which only exists as a constant from API 29 but is
         * reported by older releases too.
         */
        private const val EVENT_FOREGROUND = 1
        private const val EVENT_BACKGROUND = 2
        private const val EVENT_STOPPED = 23

        private const val MINUTES_IN_A_DAY = 1440
        private const val TOP_APPS = 12

        /**
         * Nearest whole minute. Glances of under half a minute round away to
         * nothing, on purpose: a day contains a lot of them, and counting each
         * one as a minute would quietly inflate the total.
         */
        internal fun minutes(millis: Long): Int =
            if (millis <= 0L) 0 else (millis / 60_000.0).roundToInt()

        internal fun zoneOrDefault(timezone: String): ZoneId =
            runCatching { ZoneId.of(timezone) }.getOrElse { ZoneId.systemDefault() }
    }
}
