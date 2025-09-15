package com.example.promptlibrary.sync

import com.example.promptlibrary.settings.PluginSettingsService
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.util.Alarm
import java.io.File
import java.util.concurrent.TimeUnit

@Service(Service.Level.PROJECT)
class GitFetchScheduler(private val project: Project) : Disposable {
    private val alarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, this)

    fun start() {
        val s = PluginSettingsService.instance().data
        if (!s.autoFetchEnabled) return
        schedule(TimeUnit.MINUTES.toMillis(s.autoFetchMinutes.toLong()))
    }

    private fun schedule(delayMs: Long) {
        alarm.addRequest({
            try {
                val settings = PluginSettingsService.instance().data
                if (!settings.autoFetchEnabled) return@addRequest
                val root = File(settings.repoPath)
                if (root.exists() && root.isDirectory) {
                    // Fetch only (no pull) to keep refs fresh
                    GitPullService.fetch(project, root)
                }
            } finally {
                val s = PluginSettingsService.instance().data
                if (s.autoFetchEnabled) schedule(TimeUnit.MINUTES.toMillis(s.autoFetchMinutes.toLong()))
            }
        }, delayMs)
    }

    override fun dispose() {
        alarm.cancelAllRequests()
    }
}

