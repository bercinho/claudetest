package com.familyhq.companion

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.familyhq.companion.data.ApiClient
import com.familyhq.companion.data.ApiException
import com.familyhq.companion.data.Settings
import com.familyhq.companion.ui.FamilyHqTheme
import com.familyhq.companion.ui.SetupActions
import com.familyhq.companion.ui.SetupScreen
import com.familyhq.companion.ui.SetupState
import com.familyhq.companion.usage.ReportOutcome
import com.familyhq.companion.usage.Scheduler
import com.familyhq.companion.usage.UsagePermission
import com.familyhq.companion.usage.UsageReporter
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The only native screen. It exists because two things cannot be done from a web
 * page: telling the app which server is yours, and switching on usage access.
 *
 * State lives in the activity rather than a ViewModel because usage access can
 * be granted in Settings and has to be re-checked in `onResume` — which is an
 * activity concern, and the whole screen is small enough not to need more.
 */
class SetupActivity : ComponentActivity() {

    private lateinit var settings: Settings
    private var state by mutableStateOf(SetupState())

    private val askNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            state = state.copy(notificationsGranted = granted)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = Settings(this)

        state = SetupState(
            host = settings.host,
            token = settings.token,
            lastStatus = settings.lastStatus,
            lastSuccessAt = settings.lastSuccessAt,
            notificationsAskable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU,
        )

        setContent {
            FamilyHqTheme {
                SetupScreen(
                    state = state,
                    actions = SetupActions(
                        onHostChange = { state = state.copy(host = it, message = null) },
                        onTokenChange = { state = state.copy(token = it.trim(), message = null) },
                        onCheck = ::check,
                        onGrantUsage = ::grantUsage,
                        onGrantNotifications = ::grantNotifications,
                        onReportNow = ::reportNow,
                        onOpenApp = ::openApp,
                        onForget = ::forget,
                    ),
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Both of these can change while we are in the background — one in
        // Settings, one in the notification permission dialog.
        state = state.copy(
            usageGranted = UsagePermission.granted(this),
            notificationsGranted = notificationsAllowed(),
            lastStatus = settings.lastStatus,
            lastSuccessAt = settings.lastSuccessAt,
        )
    }

    /** Saves what has been typed, then proves it works by asking the server. */
    private fun check() {
        val host = Settings.normaliseHost(state.host)
        settings.host = host
        settings.token = state.token
        state = state.copy(host = host, busy = true, message = null, snapshot = null)

        if (host.isBlank()) {
            state = state.copy(busy = false, message = "Fill in the address first.", messageIsProblem = true)
            return
        }

        lifecycleScope.launch {
            if (state.token.isBlank()) {
                // Without a token there is nothing to authenticate with, so
                // there is nothing to check — but the address alone is enough
                // to use the app, which is the normal case on a parent's phone.
                state = state.copy(
                    busy = false,
                    message = "Saved. This phone can open Family HQ. Add a device token if it is the " +
                        "phone whose screen time should be counted.",
                    messageIsProblem = false,
                )
                return@launch
            }

            val result = withContext(Dispatchers.IO) {
                runCatching { ApiClient(host, state.token).snapshot() }
            }

            result.fold(
                onSuccess = { snapshot ->
                    if (snapshot.timezone.isNotBlank()) settings.timezone = snapshot.timezone
                    Scheduler.ensure(this@SetupActivity)
                    state = state.copy(
                        busy = false,
                        snapshot = snapshot,
                        message = if (state.usageGranted) {
                            "All set. Reports will be sent a few times a day."
                        } else {
                            "The server knows this device. Switch on usage access to start counting."
                        },
                        messageIsProblem = false,
                    )
                },
                onFailure = { error ->
                    state = state.copy(busy = false, message = describe(error), messageIsProblem = true)
                },
            )
        }
    }

    private fun grantUsage() {
        if (!UsagePermission.openSettings(this)) {
            state = state.copy(
                message = "This phone has no usage-access screen I can open. Look for " +
                    "\"Special app access\" or \"Usage access\" in Settings and find Family HQ there.",
                messageIsProblem = true,
            )
        }
    }

    private fun grantNotifications() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    /** Runs a real report, on the spot, so a parent can watch it work. */
    private fun reportNow() {
        state = state.copy(busy = true, message = null)
        lifecycleScope.launch {
            val outcome = withContext(Dispatchers.IO) { UsageReporter.runOnce(this@SetupActivity) }

            val (message, problem) = when (outcome) {
                is ReportOutcome.Sent -> {
                    val days = outcome.days.size
                    "Sent ${outcome.minutesToday} min for today, and ${if (days == 1) "1 day" else "$days days"} " +
                        "in total." to false
                }
                ReportOutcome.NotConfigured -> "Fill in the address and the device token first." to true
                ReportOutcome.NoPermission -> "Usage access is still switched off." to true
                is ReportOutcome.Failed -> outcome.message to true
            }

            state = state.copy(
                busy = false,
                message = message,
                messageIsProblem = problem,
                snapshot = (outcome as? ReportOutcome.Sent)?.snapshot ?: state.snapshot,
                lastStatus = settings.lastStatus,
                lastSuccessAt = settings.lastSuccessAt,
            )
        }
    }

    private fun openApp() {
        settings.host = Settings.normaliseHost(state.host)
        settings.token = state.token
        startActivity(Intent(this, TwaActivity::class.java))
    }

    private fun forget() {
        Scheduler.stop(this)
        settings.forget()
        state = SetupState(
            notificationsAskable = state.notificationsAskable,
            usageGranted = state.usageGranted,
            notificationsGranted = state.notificationsGranted,
            message = "Forgotten. Reporting has stopped. Usage access is still on in Android " +
                "settings — switch it off there if you want it gone too.",
        )
    }

    private fun notificationsAllowed(): Boolean =
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            true
        } else {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        }

    private fun describe(error: Throwable): String = when (error) {
        is ApiException -> error.message.orEmpty()
        is IOException -> "Could not reach ${state.host}. Is the phone online, and on the right network?"
        else -> error.message ?: "Something went wrong."
    }
}
