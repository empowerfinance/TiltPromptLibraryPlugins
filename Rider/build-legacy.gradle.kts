plugins {
    id("java")
    id("org.jetbrains.intellij.platform") version "2.0.1"
    kotlin("jvm") version "1.9.25"
    kotlin("plugin.serialization") version "1.9.25"
}

import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType

// Version will be set by GitHub Actions, fallback to 1.0.0 for local development
version = project.findProperty("pluginVersion") ?: "1.0.0-LEGACY-SNAPSHOT"
group = "com.example.riderpromptlibrary"

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
}

intellijPlatform {
    defaultRepositories()
    // Legacy target range for Rider
    rider("2024.1")

    sandboxContainer.set(layout.buildDirectory.dir("idea-sandbox-legacy"))

    pluginConfiguration {
        ideaVersion {
            sinceBuild.set("241")
            untilBuild.set("251.*")
        }
        description.set(
            """
            A simple and efficient prompt library for JetBrains Rider that helps you organize, search, and reuse text prompts.
            This is the legacy version compatible with Rider 2024.1 through 2025.1.
            """.trimIndent()
        )
        changeNotes.set(
            """
            <h3>Version 1.0 - Legacy (Rider 2024.1-2025.1)</h3>
            <ul>
                <li>Compatible with Rider 2024.1 through 2025.1</li>
                <li>Create, edit, and delete prompts with confirmation</li>
                <li>Click prompts to copy to clipboard</li>
                <li>Real-time search with case-insensitive filtering</li>
                <li>Import/Export prompts as JSON</li>
                <li>Automatic duplicate detection</li>
                <li>Persistent storage across IDE restarts</li>
            </ul>
            """.trimIndent()
        )
    }
}

// Java/Kotlin settings
kotlin {
    jvmToolchain(17)
}

// Tasks migration for v2 plugin
@Suppress("UnstableApiUsage")
tasks {
    named<org.jetbrains.intellij.platform.gradle.tasks.RunIdeTask>("runIde") {
        jvmArgs = listOf("-Xmx1g")
    }
}
