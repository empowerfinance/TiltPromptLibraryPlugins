plugins {
    id("java")
    id("org.jetbrains.intellij.platform") version "2.7.2"
    kotlin("jvm") version "2.1.21"
    kotlin("plugin.serialization") version "2.1.21"
    jacoco
}

// Version will be set by GitHub Actions, fallback to 1.0.0 for local development
version = project.findProperty("pluginVersion") ?: "1.0.0-SNAPSHOT"
group = "com.example.riderpromptlibrary"

repositories {
    mavenCentral()
    // IntelliJ Platform repositories required by the v2 plugin
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    // Select Rider platform version via v2 plugin dependency DSL
    intellijPlatform {
        rider("2025.2")
        // Required for :instrumentCode task with v2 plugin
        instrumentationTools()
        // Git plugin (bundled) for git4idea APIs
        bundledPlugin("Git4Idea")
    }
    implementation("com.charleskorn.kaml:kaml:0.92.0")

    // Testing dependencies
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.1")
    testImplementation("io.mockk:mockk:1.13.8")
    testImplementation("org.assertj:assertj-core:3.24.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
}

intellijPlatform {

    // Use a dedicated sandbox under build to avoid global caches
    sandboxContainer.set(layout.buildDirectory.dir("idea-sandbox"))

    // Plugin.xml configuration (replaces patchPluginXml in 1.x)
    pluginConfiguration {
        ideaVersion {
            sinceBuild.set("252")
            untilBuild.set("253.*")
        }
        description.set(
            """
            A simple and efficient prompt library for JetBrains Rider that helps you organize, search, and reuse text prompts.
            """.trimIndent()
        )
        changeNotes.set(
            """
            <h3>Version 1.0 - Rider 2024.3+ Compatible</h3>
            <ul>
                <li>Updated for compatibility with Rider 2024.3 and newer versions</li>
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
    jvmToolchain(21)
}

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(21))
}

tasks {
    // Configure test task to use JUnit Platform
    test {
        useJUnitPlatform()
        finalizedBy(jacocoTestReport) // Generate coverage report after tests
    }

    jacocoTestReport {
        dependsOn(test) // Tests are required to run before generating the report
        reports {
            xml.required.set(true)
            html.required.set(true)
            csv.required.set(false)
        }
    }

    jacocoTestCoverageVerification {
        violationRules {
            rule {
                limit {
                    minimum = "0.80".toBigDecimal() // 80% coverage target
                }
            }
        }
    }

    // Configure runIde with explicit type to ensure Kotlin DSL has task model
    named<org.jetbrains.intellij.platform.gradle.tasks.RunIdeTask>("runIde") {
        jvmArgs = listOf("-Xmx1g")
    }

    // Ensure buildSearchableOptions uses its own sandbox to prevent H2 lock contention
    withType<org.jetbrains.intellij.platform.gradle.tasks.BuildSearchableOptionsTask> {
        enabled = false // No custom settings pages; skip building searchable options for speed and stability
    }

    // Disable bytecode instrumentation (no GUI forms or NotNull instrumentation needed)
    withType<org.jetbrains.intellij.platform.gradle.tasks.InstrumentCodeTask> { enabled = false }

    // Optional Windows helper to kill lingering locks via Sysinternals handle.exe (if installed)
    register<Exec>("killH2Locks") {
        commandLine(
            "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
            """
            ${'$'}ErrorActionPreference = 'SilentlyContinue';
            ${'$'}handle = 'C:\\Tools\\Sysinternals\\handle64.exe';
            if (-not (Test-Path ${'$'}handle)) { exit 0 }
            ${'$'}root = (Resolve-Path '.\\build').Path;
            ${'$'}out = & ${'$'}handle -accepteula ${'$'}root;
            ${'$'}pids = (${ '$' }out | Select-String 'pid:\s*(\d+)' -AllMatches).Matches | ForEach-Object { ${'$'}_.Groups[1].Value } | Select-Object -Unique;
            foreach (${ '$' }pid in ${ '$' }pids) { Stop-Process -Id ${ '$' }pid -Force }
            """.trimIndent()
        )
    }
}

