/**
 * Manages camera access, capture, and image processing
 */
export class CameraManager {
    /**
     * @param {Object} config
     * @param {number} config.width - Target width for resizing captured images
     * @param {number} config.quality - JPEG quality (0-1)
     * @param {string} [config.facingMode] - Camera facing mode (optional, mobile-only)
     */
    constructor(config) {
        this.config = {
            width: config.width || 640,
            quality: config.quality || 0.8,
            facingMode: config.facingMode // undefined by default for desktop compatibility
        };
        
        this.stream = null;
        this.videoElement = null;
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
        this.aspectRatio = null;
        this.previewContainer = null;
        this.switchButton = null;
        this.isMobileDevice = this._checkIfMobile();
    }

    /**
     * Detect if device is mobile
     * @returns {boolean}
     * @private
     */
    _checkIfMobile() {
        return /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
    }

    /**
     * Show the camera preview
     */
    showPreview() {
        if (this.previewContainer) {
            this.previewContainer.style.display = 'block';
        }
    }

    /**
     * Hide the camera preview
     */
    hidePreview() {
        if (this.previewContainer) {
            this.previewContainer.style.display = 'none';
        }
    }

    /**
     * Create and append the camera switch button
     * @private
     */
    _createSwitchButton() {
        // Only create button on mobile devices
        if (!this.isMobileDevice) return;

        this.switchButton = document.createElement('button');
        this.switchButton.className = 'camera-switch-btn';
        this.switchButton.innerHTML = '⟲';
        this.switchButton.addEventListener('click', () => this.switchCamera());
        this.previewContainer.appendChild(this.switchButton);
    }

    /**
     * Switch between front and back cameras
     */
    async switchCamera() {
        if (!this.isInitialized) return;
        
        // Toggle facingMode
        this.config.facingMode = this.config.facingMode === 'user' ? 'environment' : 'user';
        localStorage.setItem('facingMode', this.config.facingMode);
        
        // Stop current stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        // Reinitialize with new facingMode
        try {
            const constraints = {
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    facingMode: this.config.facingMode
                }
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.stream;
            await this.videoElement.play();
        } catch (error) {
            console.error('Failed to switch camera:', error);
            // Revert to previous facing mode on error
            this.config.facingMode = localStorage.getItem('facingMode') || 'environment';
        }
    }

    /**
     * Initialize camera stream and canvas
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            // Build constraints based on platform
            const constraints = {
                video: {
                    width: { ideal: this.isMobileDevice ? 1280 : 1920 }, // Lower resolution on mobile
                    height: { ideal: this.isMobileDevice ? 720 : 1080 }
                }
            };

            // Set initial facingMode on mobile
            if (this.isMobileDevice) {
                // Use stored preference or default to user (front camera)
                this.config.facingMode = localStorage.getItem('facingMode') || 'user';
                constraints.video.facingMode = this.config.facingMode;
            }

            // Request camera access
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            // Create and setup video element
            this.videoElement = document.createElement('video');
            this.videoElement.srcObject = this.stream;
            this.videoElement.playsInline = true; // Essential for iOS
            this.videoElement.muted = true; // Prevent feedback
            this.videoElement.setAttribute('playsinline', ''); // For iOS Safari
            this.videoElement.setAttribute('webkit-playsinline', ''); // For older iOS

            // Create canvas early to avoid layout thrashing
            this.canvas = document.createElement('canvas');

            // Add video to preview container
            const previewContainer = document.getElementById('cameraPreview');
            if (previewContainer) {
                previewContainer.innerHTML = ''; // Clear any previous content
                previewContainer.appendChild(this.videoElement);
                this.previewContainer = previewContainer;
                this._createSwitchButton(); // Add switch button
            }

            // Create a promise that resolves when video can play
            const playPromise = new Promise(resolve => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play().then(resolve);
                };
            });

            await playPromise;

            // Show preview after video starts playing
            this.showPreview();

            // Get the actual video dimensions
            const videoWidth = this.videoElement.videoWidth;
            const videoHeight = this.videoElement.videoHeight;
            this.aspectRatio = videoHeight / videoWidth;

            // Calculate canvas size maintaining aspect ratio
            const canvasWidth = parseInt(this.config.width);
            const canvasHeight = Math.round(canvasWidth * this.aspectRatio);

            // Set canvas dimensions
            this.canvas.width = canvasWidth;
            this.canvas.height = canvasHeight;
            this.ctx = this.canvas.getContext('2d', {
                alpha: false, // Optimization: no transparency needed
                willReadFrequently: false // Hint for performance
            });

            this.isInitialized = true;
        } catch (error) {
            throw new Error(`Failed to initialize camera: ${error.message}`);
        }
    }

    /**
     * Get current canvas dimensions
     * @returns {{width: number, height: number}}
     */
    getDimensions() {
        if (!this.isInitialized) {
            throw new Error('Camera not initialized. Call initialize() first.');
        }
        return {
            width: this.canvas.width,
            height: this.canvas.height
        };
    }

    /**
     * Capture and process an image from the camera
     * @returns {Promise<string>} Base64 encoded JPEG image
     */
    async capture() {
        if (!this.isInitialized) {
            throw new Error('Camera not initialized. Call initialize() first.');
        }

        // Use requestAnimationFrame for better performance
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                // Draw current video frame to canvas, maintaining aspect ratio
                this.ctx.drawImage(
                    this.videoElement,
                    0, 0,
                    this.canvas.width,
                    this.canvas.height
                );

                // Convert to base64 JPEG with specified quality
                // Use a more efficient approach for mobile
                if (this.isMobileDevice) {
                    // Lower quality on mobile for better performance
                    const mobileQuality = Math.min(this.config.quality, 0.7);
                    resolve(this.canvas.toDataURL('image/jpeg', mobileQuality).split(',')[1]);
                } else {
                    resolve(this.canvas.toDataURL('image/jpeg', this.config.quality).split(',')[1]);
                }
            });
        });
    }

    /**
     * Stop camera stream and cleanup resources
     */
    dispose() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.videoElement) {
            this.videoElement.srcObject = null;
            this.videoElement = null;
        }

        if (this.switchButton) {
            this.switchButton.remove();
            this.switchButton = null;
        }

        if (this.previewContainer) {
            this.hidePreview();
            this.previewContainer.innerHTML = ''; // Clear the preview container
            this.previewContainer = null;
        }

        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
        this.aspectRatio = null;
    }
}
