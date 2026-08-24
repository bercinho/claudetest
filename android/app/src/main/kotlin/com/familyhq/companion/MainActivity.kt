package com.familyhq.companion

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import com.familyhq.companion.data.Settings

/**
 * The launcher icon lands here, and all this does is decide where to go: setup
 * if we do not know where the server is yet, otherwise straight into the app.
 *
 * It draws nothing — its theme is the splash, so the handover is invisible.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val settings = Settings(this)

        // A token is only needed on the phone whose screen time is being
        // reported. A parent's phone is a perfectly good client without one, so
        // the address alone is enough to get going.
        val target = if (settings.host.isBlank()) {
            Intent(this, SetupActivity::class.java)
        } else {
            Intent(this, TwaActivity::class.java).apply {
                // Carry a tapped https link through, so a link to a particular
                // page opens that page rather than the home screen.
                intent?.data?.let { data = it }
            }
        }

        startActivity(target)

        // No animation and no entry in the back stack: pressing back from the
        // app should leave, not come back through here.
        overridePendingTransition(0, 0)
        finish()
    }
}
