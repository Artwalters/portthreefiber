class CanvasTextGenerator {
  constructor() {
    this.canvas = null;
    this.ctx = null;
  }

  // Helper function to get power of 2
  getPowerOfTwo(value) {
    let pow = 1;
    while (pow < value) {
      pow *= 2;
    }
    return pow;
  }

  // Generate text texture canvas
  generateTextCanvas(text, options = {}) {
    const {
      fontSize = 24,
      fontFamily = 'Helvetica Neue, -apple-system, sans-serif',
      fontWeight = '500',
      color = '#000000',
      textAlign = 'left',
      textBaseline = 'top',
      padding = 10
    } = options;

    // Create or reuse canvas
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      // Hide the canvas
      this.canvas.style.position = 'absolute';
      this.canvas.style.left = '-9999px';
      this.canvas.style.visibility = 'hidden';
      document.body.appendChild(this.canvas);
    }

    // Set font before measuring
    this.ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    
    // Measure text dimensions
    const textMetrics = this.ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize; // Approximation

    // Calculate canvas size (power of 2 for WebGL compatibility)
    const canvasWidth = this.getPowerOfTwo(textWidth + padding * 2);
    const canvasHeight = this.getPowerOfTwo(textHeight + padding * 2);

    // Set canvas dimensions
    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;

    // Clear canvas
    this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Set text properties (must be set again after canvas resize)
    this.ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = textAlign;
    this.ctx.textBaseline = textBaseline;

    // Calculate text position based on alignment
    let x, y;
    switch (textAlign) {
      case 'center':
        x = canvasWidth / 2;
        break;
      case 'right':
        x = canvasWidth - padding;
        break;
      case 'left':
      default:
        x = padding;
        break;
    }

    switch (textBaseline) {
      case 'middle':
        y = canvasHeight / 2;
        break;
      case 'bottom':
        y = canvasHeight - padding;
        break;
      case 'top':
      default:
        y = padding;
        break;
    }

    // Draw the text
    this.ctx.fillText(text, x, y);

    console.log('Generated text canvas:', {
      text,
      canvasSize: [canvasWidth, canvasHeight],
      textSize: [textWidth, textHeight],
      position: [x, y]
    });

    return {
      canvas: this.canvas,
      width: canvasWidth,
      height: canvasHeight,
      textWidth,
      textHeight
    };
  }

  // Clean up
  dispose() {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
  }
}

export default CanvasTextGenerator;