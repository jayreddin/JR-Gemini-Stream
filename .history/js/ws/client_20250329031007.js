/**
 * Client for interacting with the Gemini 2.0 Flash Multimodal Live API via WebSockets.
 * This class handles the connection, sending and receiving messages, and processing responses.
 * 
 * @extends EventEmitter
 */
import { EventEmitter } from 'https://cdn.skypack.dev/eventemitter3';
import { blobToJSON, base64ToArrayBuffer } from '../utils/utils.js';

export class GeminiWebsocketClient extends EventEmitter {
    /**
     * Creates a new GeminiWebsocketClient with the given configuration.
     * @param {string} name - Name for the websocket client.
     * @param {string} url - URL for the Gemini API that contains the API key at the end.
     * @param {Object} config - Configuration object for the Gemini API.
     */
    constructor(name, url, config) {
        super();
        this.name = name || 'WebSocketClient';
        this.url = url || `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
        this.ws = null;
        this.config = config;
        this.isConnecting = false;
        this.connectionPromise = null;
        this.maxReconnectAttempts = 3;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Start with 1 second delay
    }

    /**
     * Establishes a WebSocket connection and initializes the session with a configuration.
     * @returns {Promise} Resolves when the connection is established and setup is complete
     */
    async connect() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            console.debug(`${this.name} already has an open connection`);
            return this.connectionPromise;
        }

        if (this.isConnecting) {
            console.debug(`${this.name} connection already in progress`);
            return this.connectionPromise;
        }

        // Reset reconnect attempts when explicitly connecting
        this.reconnectAttempts = 0;
        return this._connect();
    }

    /**
     * Internal connection method with reconnection logic
     * @returns {Promise} Resolves when the connection is established and setup is complete
     * @private
     */
    async _connect() {
        console.info('🔗 Establishing WebSocket connection...');
        this.isConnecting = true;
        this.connectionPromise = new Promise((resolve, reject) => {
            // Clean up any existing connection
            if (this.ws) {
                try {
                    this.ws.onclose = null;
                    this.ws.onerror = null;
                    this.ws.onmessage = null;
                    this.ws.onopen = null;
                    this.ws.close();
                } catch (e) {
                    console.warn('Error while cleaning up existing WebSocket:', e);
                }
                this.ws = null;
            }

            const ws = new WebSocket(this.url);
            
            // Set a connection timeout
            const connectionTimeout = setTimeout(() => {
                console.error(`WebSocket connection timeout after 10 seconds`);
                if (ws.readyState !== WebSocket.OPEN) {
                    ws.close();
                    reject(new Error('Connection timeout'));
                }
            }, 10000);

            // Send setup message upon successful connection
            ws.addEventListener('open', () => {
                console.info('🔗 Successfully connected to websocket');
                clearTimeout(connectionTimeout);
                this.ws = ws;
                this.isConnecting = false;
                this.reconnectAttempts = 0; // Reset on successful connection

                // Configure
                try {
                    this.sendJSON({ setup: this.config });
                    console.debug("Setup message with the following configuration was sent:", this.config);
                    resolve();
                } catch (error) {
                    console.error('Error sending setup message:', error);
                    reject(error);
                }
            });

            // Handle connection errors
            ws.addEventListener('error', (error) => {
                console.error(`WebSocket error event:`, error);
                clearTimeout(connectionTimeout);
                
                // Don't close here, let the onclose handler handle it
                const reason = error.reason || 'Unknown error';
                const message = `Could not connect to "${this.url}. Reason: ${reason}"`;
                console.error(message, error);
                // Only reject if we haven't connected yet
                if (this.isConnecting) {
                    reject(error);
                }
            });

            // Listen for incoming messages, expecting Blob data for binary streams
            ws.addEventListener('message', async (event) => {
                try {
                    if (event.data instanceof Blob) {
                        this.receive(event.data);
                    } else {
                        console.warn('Non-blob message received:', event);
                    }
                } catch (error) {
                    console.error('Error processing message:', error);
                }
            });

            // Handle connection closure
            ws.addEventListener('close', (event) => {
                clearTimeout(connectionTimeout);
                console.warn(`WebSocket connection closed: ${event.code} ${event.reason}`);
                this.ws = null;
                
                // Attempt to reconnect if not manually closed
                if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
                    console.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
                    
                    setTimeout(() => {
                        console.info(`Reconnecting now...`);
                        this.isConnecting = false; // Reset connecting flag for reconnect
                        this._connect().catch(err => {
                            console.error('Reconnection failed:', err);
                        });
                    }, delay);
                } else {
                    this.isConnecting = false;
                    // Only emit disconnected if we're not trying to reconnect
                    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                        console.error(`Maximum reconnection attempts (${this.maxReconnectAttempts}) reached.`);
                        this.emit('disconnected');
                    }
                }
                
                // Only reject the promise if we're still in the initial connection phase
                if (this.isConnecting) {
                    reject(new Error(`WebSocket closed during connection: ${event.code} ${event.reason}`));
                }
            });
        });

        return this.connectionPromise;
    }

    /**
     * Explicitly disconnects the WebSocket.
     */
    disconnect() {
        if (this.ws) {
            // Flag that this is a clean disconnect
            const ws = this.ws;
            this.ws = null;
            this.isConnecting = false;
            this.connectionPromise = null;
            
            try {
                ws.close(1000, "Disconnected by client");
            } catch (error) {
                console.warn(`Error closing WebSocket:`, error);
            }
            
            console.info(`${this.name} successfully disconnected from websocket`);
        }
    }

    /**
     * Checks if the WebSocket is in a state where it can send messages.
     * @returns {boolean} True if the connection is ready for sending.
     */
    isReady() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Processes incoming WebSocket messages.
     * Handles various response types including tool calls, setup completion,
     * and content delivery (text/audio).
     */
    async receive(blob) {
        const response = await blobToJSON(blob);
        
        // Handle tool call responses
        if (response.toolCall) {
            console.debug(`${this.name} received tool call`, response);       
            this.emit('tool_call', response.toolCall);
            return;
        }

        // Handle tool call cancellation
        if (response.toolCallCancellation) {
            console.debug(`${this.name} received tool call cancellation`, response);
            this.emit('tool_call_cancellation', response.toolCallCancellation);
            return;
        }

        // Process server content (text/audio/interruptions)
        if (response.serverContent) {
            const { serverContent } = response;
            if (serverContent.interrupted) {
                console.debug(`${this.name} is interrupted`);
                this.emit('interrupted');
                return;
            }
            if (serverContent.turnComplete) {
                console.debug(`${this.name} has completed its turn`);
                this.emit('turn_complete');
            }
            if (serverContent.modelTurn) {
                // console.debug(`${this.name} is sending content`);
                // Split content into audio and non-audio parts
                let parts = serverContent.modelTurn.parts;

                // Filter out audio parts from the model's content parts
                const audioParts = parts.filter((p) => p.inlineData && p.inlineData.mimeType.startsWith('audio/pcm'));
                
                // Extract base64 encoded audio data from the audio parts
                const base64s = audioParts.map((p) => p.inlineData?.data);
                
                // Create an array of non-audio parts by excluding the audio parts
                const otherParts = parts.filter((p) => !audioParts.includes(p));

                // Process audio data
                base64s.forEach((b64) => {
                    if (b64) {
                        const data = base64ToArrayBuffer(b64);
                        this.emit('audio', data);
                    }
                });

                // Emit remaining content
                if (otherParts.length) {
                    this.emit('content', { modelTurn: { parts: otherParts } });
                    console.debug(`${this.name} sent:`, otherParts);
                }
            }
        } else {
            console.debug(`${this.name} received unmatched message:`, response);
        }
    }

    /**
     * Sends encoded audio chunk to the Gemini API.
     * 
     * @param {string} base64audio - The base64 encoded audio string.
     */
    async sendAudio(base64audio) {
        const data = { realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm', data: base64audio }] } };
        await this.sendJSON(data);
        console.debug(`Sending audio chunk to ${this.name}.`);
    }

    /**
     * Sends encoded image to the Gemini API.
     * 
     * @param {string} base64image - The base64 encoded image string.
     */
    async sendImage(base64image) {
        const data = { realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: base64image }] } };
        await this.sendJSON(data);
        console.debug(`Image with a size of ${Math.round(base64image.length/1024)} KB was sent to the ${this.name}.`);
    }

    /**
     * Sends a text message to the Gemini API.
     * 
     * @param {string} text - The text to send to Gemini.
     * @param {boolean} endOfTurn - If false model will wait for more input without sending a response.
     */
    async sendText(text, endOfTurn = true) {
        const formattedText = { 
            clientContent: { 
                turns: [{
                    role: 'user', 
                    parts: [{ text: text }]
                }], 
                turnComplete: endOfTurn 
            } 
        };
        await this.sendJSON(formattedText);
        console.debug(`Text sent to ${this.name}:`, text);
    }
    /**
     * Sends the result of the tool call to Gemini.
     * @param {Object} toolResponse - The response object
     * @param {any} toolResponse.output - The output of the tool execution (string, number, object, etc.)
     * @param {string} toolResponse.id - The identifier of the tool call from toolCall.functionCalls[0].id
     * @param {string} toolResponse.error - Send the output as null and the error message if the tool call failed (optional)
     */
    async sendToolResponse(toolResponse) {
        if (!toolResponse || !toolResponse.id) {
            throw new Error('Tool response must include an id');
        }

        const { output, id, error } = toolResponse;
        let result = [];

        if (error) {
            result = [{
                response: { error: error },
                id
            }];
        } else if (output === undefined) {
            throw new Error('Tool response must include an output when no error is provided');
        } else {
            result = [{
                response: { output: output },
                id
            }];
        }

        await this.sendJSON({ toolResponse: {functionResponses: result} });
        console.debug(`Tool response sent to ${this.name}:`, toolResponse);
    }

    /**
     * Sends a JSON object to the Gemini API.
     * 
     * @param {Object} json - The JSON object to send.
     */
    async sendJSON(json) {        
        try {
            // Check if we need to reconnect
            if (!this.isReady()) {
                if (!this.isConnecting) {
                    console.warn('WebSocket not ready, attempting to reconnect...');
                    await this._connect();
                } else {
                    console.debug('WebSocket connection in progress, waiting...');
                    await this.connectionPromise;
                }
            }
            
            // Now check again after potential reconnection
            if (!this.isReady()) {
                throw new Error('WebSocket is not in OPEN state after reconnection attempt');
            }
            
            this.ws.send(JSON.stringify(json));
        } catch (error) {
            console.error(`Failed to send to ${this.name}:`, error);
            throw error; // Rethrow for the caller to handle
        }
    }
}