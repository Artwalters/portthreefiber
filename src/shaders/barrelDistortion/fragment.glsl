uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uCursor;
uniform float uScrollVelocity;
uniform sampler2D uTexture;
uniform vec2 uTextureSize;
uniform vec2 uQuadSize;

varying vec2 vUv;
varying vec2 vUvCover;

void main() {
  // Simple texture display with cover behavior
  vec4 texture = texture2D(uTexture, vUvCover);
  
  gl_FragColor = texture;
}