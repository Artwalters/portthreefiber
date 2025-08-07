import { forwardRef, useMemo } from 'react'
import { Uniform } from 'three'
import { Effect } from 'postprocessing'

// Custom shader effect for fish caustics
class FishCausticsEffectImpl extends Effect {
  constructor() {
    super('FishCausticsEffect', {
      uniforms: new Map([
        ['uTime', new Uniform(0)],
        ['uStrength', new Uniform(0.7)]
      ]),
      fragmentShader: `
        uniform float uTime;
        uniform float uStrength;
        
        // Simple noise function for caustics pattern
        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          // Create animated caustics pattern
          vec2 pos = uv * 8.0;
          float t = uTime * 0.3;
          
          float n1 = noise(pos + t);
          float n2 = noise(pos * 1.5 - t * 0.7);
          float n3 = noise(pos * 2.0 + t * 1.3);
          
          // Combine noise layers
          float caustics = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
          caustics = smoothstep(0.3, 0.7, caustics);
          
          // Sample the input color
          vec3 color = inputColor.rgb;
          
          // Detect if this is likely a fish pixel (not white background)
          float luminance = dot(color, vec3(0.299, 0.587, 0.114));
          bool isFish = luminance < 0.95; // Not pure white background
          
          if (isFish) {
            // In bright caustics areas, blend towards white (hiding the fish)
            vec3 brightWater = vec3(1.0);
            color = mix(color, brightWater, caustics * uStrength);
          }
          
          outputColor = vec4(color, inputColor.a);
        }
      `
    })
  }

  update(renderer, inputBuffer, deltaTime) {
    this.uniforms.get('uTime').value += deltaTime
  }
}

// React component wrapper
export const FishCausticsEffect = forwardRef((props, ref) => {
  const effect = useMemo(() => new FishCausticsEffectImpl(), [])
  return <primitive ref={ref} object={effect} />
})