package com.example.promptlibrary.events

import com.intellij.openapi.application.ApplicationManager
import com.intellij.util.messages.Topic

object LibraryEvents {
    interface Listener {
        fun libraryChanged()
    }

    val TOPIC: Topic<Listener> = Topic.create("PromptLibrary:LibraryChanged", Listener::class.java)

    /**
     * Fires a library changed event to all listeners.
     * This method is safe to call from any thread - it will dispatch to the EDT if necessary.
     */
    fun fireChanged() {
        val application = ApplicationManager.getApplication()
        if (application.isDispatchThread) {
            // Already on EDT, fire directly
            application.messageBus.syncPublisher(TOPIC).libraryChanged()
        } else {
            // Schedule on EDT to ensure UI updates happen safely
            application.invokeLater {
                application.messageBus.syncPublisher(TOPIC).libraryChanged()
            }
        }
    }
}

