// DOM elements object
const elements = {
    // Button elements
    disconnectBtn: document.getElementById('disconnectBtn'),
    connectBtn: document.getElementById('connectBtn'),
    micBtn: document.getElementById('micBtn'),
    cameraBtn: document.getElementById('cameraBtn'),
    screenBtn: document.getElementById('screenBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    newChatBtn: document.getElementById('newChatBtn'),

    // Preview elements
    cameraPreview: document.getElementById('cameraPreview'),
    screenPreview: document.getElementById('screenPreview'),
    
    // Model banner
    modelBanner: document.getElementById('modelBanner'),

    // Text input elements
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),

    // Chat container
    chatHistory: document.getElementById('chatHistory'),

    // Visualizer canvas
    visualizerCanvas: document.getElementById('visualizer')
};

export default elements;
