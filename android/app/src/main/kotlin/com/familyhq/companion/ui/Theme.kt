package com.familyhq.companion.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// The web app's palette, so the setup screen does not look like a different
// product from the thing it sets up.
private val Brand = Color(0xFF6C4CE0)
private val BrandDark = Color(0xFFB9A6FF)
private val Paper = Color(0xFFF7F7FB)
private val Ink = Color(0xFF191A20)

private val LightScheme = lightColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE9E2FF),
    onPrimaryContainer = Color(0xFF23125E),
    background = Paper,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
    surfaceVariant = Color(0xFFEDEDF4),
    onSurfaceVariant = Color(0xFF4A4A57),
    error = Color(0xFFB3261E),
)

private val DarkScheme = darkColorScheme(
    primary = BrandDark,
    onPrimary = Color(0xFF23125E),
    primaryContainer = Color(0xFF3B2A7A),
    onPrimaryContainer = Color(0xFFE9E2FF),
    background = Ink,
    onBackground = Color(0xFFECECF1),
    surface = Color(0xFF22232B),
    onSurface = Color(0xFFECECF1),
    surfaceVariant = Color(0xFF33343E),
    onSurfaceVariant = Color(0xFFC4C4D0),
    error = Color(0xFFF2B8B5),
)

@Composable
fun FamilyHqTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (dark) DarkScheme else LightScheme,
        typography = Typography(),
        content = content,
    )
}
