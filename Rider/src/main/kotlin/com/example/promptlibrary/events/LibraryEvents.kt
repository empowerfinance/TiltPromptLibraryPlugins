package com.example.promptlibrary.events

import com.intellij.openapi.application.ApplicationManager
import com.intellij.util.messages.Topic

object LibraryEvents {
    interface Listener {
        fun libraryChanged()
    }

    val TOPIC: Topic<Listener> = Topic.create("PromptLibrary:LibraryChanged", Listener::class.java)

    fun fireChanged() {
        ApplicationManager.getApplication().messageBus.syncPublisher(TOPIC).libraryChanged()
    }
}

