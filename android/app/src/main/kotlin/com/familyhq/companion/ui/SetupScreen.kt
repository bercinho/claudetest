package com.familyhq.companion.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.familyhq.companion.data.Snapshot
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Everything the setup screen draws, and nothing it does not. */
data class SetupState(
    val host: String = "",
    val token: String = "",
    val usageGranted: Boolean = false,
    val notificationsGranted: Boolean = true,
    val notificationsAskable: Boolean = false,
    val busy: Boolean = false,
    val message: String? = null,
    val messageIsProblem: Boolean = false,
    val snapshot: Snapshot? = null,
    val lastStatus: String = "",
    val lastSuccessAt: Long = 0L,
)

/** Everything the setup screen can ask for. */
data class SetupActions(
    val onHostChange: (String) -> Unit = {},
    val onTokenChange: (String) -> Unit = {},
    val onCheck: () -> Unit = {},
    val onGrantUsage: () -> Unit = {},
    val onGrantNotifications: () -> Unit = {},
    val onReportNow: () -> Unit = {},
    val onOpenApp: () -> Unit = {},
    val onForget: () -> Unit = {},
)

@Composable
fun SetupScreen(state: SetupState, actions: SetupActions) {
    Surface(color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Family HQ", style = MaterialTheme.typography.headlineMedium)
            Text(
                "Two things to set up: where your family's server is, and — on your son's " +
                    "phone only — permission to read how long he has been using it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            ServerCard(state, actions)
            ReportingCard(state, actions)
            state.message?.let { Notice(it, state.messageIsProblem) }

            if (state.host.isNotBlank()) {
                Button(
                    onClick = actions.onOpenApp,
                    enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Open Family HQ") }
            }

            HorizontalDivider(modifier = Modifier.padding(top = 8.dp))
            TextButton(onClick = actions.onForget, enabled = !state.busy) {
                Text("Forget the server and stop reporting")
            }
            Text(
                "Nothing this app records ever leaves your own server. It talks to no one else.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun ServerCard(state: SetupState, actions: SetupActions) {
    Section("Your server") {
        OutlinedTextField(
            value = state.host,
            onValueChange = actions.onHostChange,
            label = { Text("Address") },
            placeholder = { Text("family.example.com") },
            supportingText = { Text("Just the host. https:// is added for you.") },
            singleLine = true,
            enabled = !state.busy,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = state.token,
            onValueChange = actions.onTokenChange,
            label = { Text("Device token") },
            supportingText = {
                Text(
                    "Only needed on the phone whose screen time is being counted. A parent " +
                        "creates it under Notifications › Companion devices, and it is shown once.",
                )
            },
            singleLine = true,
            enabled = !state.busy,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth(),
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Button(onClick = actions.onCheck, enabled = !state.busy) { Text("Save and check") }
            if (state.busy) CircularProgressIndicator(modifier = Modifier.size(20.dp))
        }

        state.snapshot?.let { SnapshotCard(it) }
    }
}

@Composable
private fun SnapshotCard(snapshot: Snapshot) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                if (snapshot.deviceName.isBlank()) "Connected" else "Connected as ${snapshot.deviceName}",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            val detail = if (snapshot.tracking) {
                "${snapshot.date}: ${snapshot.allowanceMinutes} min allowed, " +
                    "${snapshot.usedMinutes} used, ${snapshot.remainingMinutes} left. " +
                    "This phone has reported ${snapshot.recordedMinutes} min."
            } else {
                "${snapshot.date}: screen time is not being tracked today. " +
                    "This phone has reported ${snapshot.recordedMinutes} min."
            }
            Text(
                detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Text(
                "Days are counted in ${snapshot.timezone}, the server's timezone.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
    }
}

@Composable
private fun ReportingCard(state: SetupState, actions: SetupActions) {
    Section("Screen time reporting") {
        Text(
            "Set this up on your son's phone. With usage access switched on, Family HQ reports " +
                "how many minutes he spent in each app, a few times a day, to your server only. " +
                "It never reads messages, browsing history, or anything he types.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        StatusLine(
            label = "Usage access",
            ok = state.usageGranted,
            okText = "Granted",
            notOkText = "Not granted — nothing is being counted",
        )
        if (!state.usageGranted) {
            OutlinedButton(onClick = actions.onGrantUsage, enabled = !state.busy) {
                Text("Open Android settings")
            }
            Text(
                "Android does not allow an app to ask for this with a dialog. In the list that " +
                    "opens, find Family HQ and switch on \"Permit usage access\".",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (state.notificationsAskable) {
            StatusLine(
                label = "Notifications",
                ok = state.notificationsGranted,
                okText = "Allowed",
                notOkText = "Not allowed — reminders will not appear",
            )
            if (!state.notificationsGranted) {
                OutlinedButton(onClick = actions.onGrantNotifications, enabled = !state.busy) {
                    Text("Allow notifications")
                }
            }
        }

        OutlinedButton(
            onClick = actions.onReportNow,
            enabled = !state.busy && state.usageGranted && state.token.isNotBlank(),
        ) { Text("Report now") }

        if (state.lastStatus.isNotBlank()) {
            Text(
                "Last attempt: ${state.lastStatus}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (state.lastSuccessAt > 0L) {
            Text(
                "Last accepted ${relative(state.lastSuccessAt)}.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}

@Composable
private fun StatusLine(label: String, ok: Boolean, okText: String, notOkText: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(if (ok) "✓" else "•", fontFamily = FontFamily.Monospace)
        Column {
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(
                if (ok) okText else notOkText,
                style = MaterialTheme.typography.bodySmall,
                color = if (ok) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun Notice(text: String, problem: Boolean) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (problem) {
                MaterialTheme.colorScheme.errorContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
        ),
    ) {
        Text(
            text,
            modifier = Modifier.padding(14.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = if (problem) {
                MaterialTheme.colorScheme.onErrorContainer
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
        )
    }
}

/** "12 minutes ago", or a date once that stops being useful. */
private fun relative(epochMillis: Long, now: Long = System.currentTimeMillis()): String {
    val seconds = (now - epochMillis) / 1000
    return when {
        seconds < 60 -> "just now"
        seconds < 3600 -> "${seconds / 60} min ago"
        seconds < 86_400 -> "${seconds / 3600} h ago"
        else -> DateTimeFormatter.ofPattern("d MMM, HH:mm")
            .withZone(ZoneId.systemDefault())
            .format(Instant.ofEpochMilli(epochMillis))
    }
}
