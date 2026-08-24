# R8 is on for release builds. Almost nothing here needs help — the app is a
# handful of activities, a worker, and two data classes — but three things are
# reached reflectively and would otherwise be renamed or removed.

# The browser binds to the delegation service by name across processes.
-keep class com.familyhq.companion.NotificationDelegationService { *; }

# androidbrowserhelper reads meta-data and instantiates its own classes; keeping
# the package whole is cheaper than chasing which parts.
-keep class com.google.androidbrowserhelper.** { *; }

# WorkManager instantiates workers by class name.
-keep class com.familyhq.companion.usage.ReportWorker { <init>(...); }

# org.json is in the platform, not the app.
-dontwarn org.json.**
