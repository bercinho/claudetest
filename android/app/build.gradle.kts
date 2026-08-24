import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

/** Reads a value from gradle.properties, or a -P override on the command line. */
fun prop(name: String, fallback: String = ""): String =
    (project.findProperty(name) as String?)?.trim().takeUnless { it.isNullOrEmpty() } ?: fallback

val appId = prop("familyhq.applicationId", "com.example.familyhq")
val serverHost = prop("familyhq.host")

// Signing details live outside the repository. See android/README.md.
val keystoreProps = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "com.familyhq.companion"
    compileSdk = 35

    defaultConfig {
        applicationId = appId
        minSdk = 26 // adaptive icons, and UsageStatsManager is comfortable here
        targetSdk = 35
        // Play requires a higher versionCode for every upload. Locally 1 is
        // fine; CI passes -PversionCode=<run number> so nobody has to remember.
        versionCode = prop("versionCode", "1").toInt()
        versionName = prop("versionName", "1.0")

        // Baked into BuildConfig so the app knows where to look without asking.
        buildConfigField("String", "DEFAULT_HOST", "\"$serverHost\"")

        // Used by the intent filter that claims https links for your server.
        // A placeholder must never be empty or the manifest merger complains,
        // so an unset host claims a hostname nothing will ever resolve to.
        manifestPlaceholders["familyHqHost"] = serverHost.ifEmpty { "host.invalid" }
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (keystoreProps.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    sourceSets["main"].java.srcDirs("src/main/kotlin")

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.browser.helper)
    debugImplementation(libs.androidx.compose.ui.tooling)
}

// ---------------------------------------------------------------------------
// Guard rails, for the mistakes that are painful to undo after a Play upload.
// ---------------------------------------------------------------------------

gradle.taskGraph.whenReady {
    val releasing = allTasks.any { it.name.contains("Release") }
    if (!releasing) return@whenReady

    if (appId.contains("example")) {
        throw GradleException(
            "familyhq.applicationId is still \"$appId\". Set it to a package name under a domain " +
                "you control in android/gradle.properties — Google Play will not let you change it later.",
        )
    }
    if (keystoreProps.isEmpty()) {
        throw GradleException(
            "No android/keystore.properties found, so the release build would be unsigned. " +
                "See android/README.md under \"Signing\".",
        )
    }
    if (serverHost.isEmpty()) {
        logger.warn(
            "\nfamilyhq.host is not set, so the app will ask for the server address on first run " +
                "and open it in a Custom Tab with the address bar showing. Set it, and serve the " +
                "matching assetlinks.json, for a fullscreen app.\n",
        )
    }
}
