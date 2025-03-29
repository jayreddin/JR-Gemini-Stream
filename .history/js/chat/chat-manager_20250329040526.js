export class ChatManager {
    constructor() {
        this.chatContainer = document.getElementById('chatHistory');
        this.currentStreamingMessage = null;
        this.lastUserMessageType = null; // 'text' or 'audio'
        this.currentTranscript = ''; // Add this to store accumulated transcript
    }

    _formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    _createMessageElement(text, type) {
        const messageContainer = document.createElement('div');
        messageContainer.className = `chat-message ${type}-message`;

        const textSpan = document.createElement('span');
        textSpan.className = 'message-text';
        textSpan.textContent = text;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = this._formatTime(new Date());

        messageContainer.appendChild(textSpan);
        messageContainer.appendChild(timeSpan);

        return messageContainer;
    }

    addUserMessage(text) {
        const messageElement = this._createMessageElement(text, 'user');
        this.chatContainer.appendChild(messageElement);
        this.lastUserMessageType = 'text';
        this.scrollToBottom();
    }

    addUserAudioMessage() {
        const messageElement = this._createMessageElement('User sent audio', 'user');
        this.chatContainer.appendChild(messageElement);
        this.lastUserMessageType = 'audio';
        this.scrollToBottom();
    }

    startModelMessage() {
        // If there's already a streaming message, finalize it first
        if (this.currentStreamingMessage) {
            this.finalizeStreamingMessage();
        }

        // If no user message was shown yet, show audio message
        if (!this.lastUserMessageType) {
            this.addUserAudioMessage();
        }

        const messageElement = this._createMessageElement('', 'model'); // Start with empty text
        messageElement.classList.add('streaming');
        this.chatContainer.appendChild(messageElement);
        this.currentStreamingMessage = messageElement; // Store the container
        this.currentTranscript = ''; // Reset transcript when starting new message
        this.scrollToBottom();
    }

    updateStreamingMessage(text) {
        if (!this.currentStreamingMessage) {
            this.startModelMessage();
        }
        this.currentTranscript += ' ' + text; // Append new text to the transcript
        const textSpan = this.currentStreamingMessage.querySelector('.message-text');
        if (textSpan) {
            textSpan.textContent = this.currentTranscript.trim(); // Update only the text span
        }
        this.scrollToBottom();
    }

    finalizeStreamingMessage() {
        if (this.currentStreamingMessage) {
            this.currentStreamingMessage.classList.remove('streaming');
            this.currentStreamingMessage = null;
            this.lastUserMessageType = null;
            this.currentTranscript = ''; // Reset transcript when finalizing
        }
    }

    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    clear() {
        this.chatContainer.innerHTML = '';
        this.currentStreamingMessage = null;
        this.lastUserMessageType = null;
        this.currentTranscript = '';
    }
}
