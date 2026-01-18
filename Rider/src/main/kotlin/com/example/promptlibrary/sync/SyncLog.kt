package com.example.promptlibrary.sync

import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Log entry with timestamp, level, and message.
 */
data class LogEntry(
    val time: String,
    val level: LogLevel,
    val message: String
)

enum class LogLevel {
    INFO, WARN, ERROR
}

/**
 * Centralized logging service for sync operations.
 * Similar to VS Code's log.ts - stores entries and notifies listeners.
 */
object SyncLog {
    private val _entries = CopyOnWriteArrayList<LogEntry>()
    private val _listeners = CopyOnWriteArrayList<() -> Unit>()
    private const val MAX_ENTRIES = 300
    private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")

    val entries: List<LogEntry> get() = _entries.toList()

    fun addListener(listener: () -> Unit) {
        _listeners.add(listener)
    }

    fun removeListener(listener: () -> Unit) {
        _listeners.remove(listener)
    }

    private fun notifyListeners() {
        _listeners.forEach { it() }
    }

    private fun push(level: LogLevel, message: String) {
        val entry = LogEntry(
            time = LocalDateTime.now().format(timeFormatter),
            level = level,
            message = message
        )
        _entries.add(entry)
        // Trim if over max
        while (_entries.size > MAX_ENTRIES) {
            _entries.removeAt(0)
        }
        notifyListeners()
    }

    fun info(msg: String) = push(LogLevel.INFO, msg)
    fun warn(msg: String) = push(LogLevel.WARN, msg)
    fun error(msg: String) = push(LogLevel.ERROR, msg)

    fun clear() {
        _entries.clear()
        notifyListeners()
    }
}

