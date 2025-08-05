import { useRef, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const MobileWater = forwardRef((props, ref) => {
    const { gl, size, scene, camera } = useThree()
    const meshRef = useRef()
    const mouse = useRef(new THREE.Vector2(0.5, 0.5))
    const mouseDown = useRef(false)
    
    // Expose update function for external components (like slider)
    useImperativeHandle(ref, () => ({
        updateMouse: (x, y, isDown) => {
            mouse.current.x = x / window.innerWidth
            mouse.current.y = 1.0 - (y / window.innerHeight)
            mouseDown.current = isDown
        }
    }))
    
    // Mobile-safe buffers with strong effects - keep 256 resolution but use compatible types
    const buffers = useMemo(() => {
        // Try HalfFloat first, fallback to UnsignedByte if needed
        let textureType = THREE.HalfFloatType
        const glContext = gl.getContext()
        
        // Check for HalfFloat support
        const halfFloatExt = glContext.getExtension('OES_texture_half_float')
        if (!halfFloatExt) {
            textureType = THREE.UnsignedByteType
            console.log('MobileWater: Using UnsignedByte (mobile fallback)')
        } else {
            console.log('MobileWater: Using HalfFloat')
        }
        
        const options = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: textureType
        }
        
        // Higher resolution for better quality while keeping strong effects
        const resolution = 512
        
        return {
            read: new THREE.WebGLRenderTarget(resolution, resolution, options),
            write: new THREE.WebGLRenderTarget(resolution, resolution, options),
            scene: new THREE.WebGLRenderTarget(size.width, size.height, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType // Always safe for scene capture
            })
        }
    }, [])
    
    // SimpleWater shader implementation - proper wave equation with idle waves
    const simMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uPrevious: { value: null },
                uTime: { value: 0 },
                uMouse: { value: new THREE.Vector2(0.5, 0.5) },
                uMouseDown: { value: 0 },
                uDelta: { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uPrevious;
                uniform float uTime;
                uniform vec2 uMouse;
                uniform float uMouseDown;
                uniform float uDelta;
                varying vec2 vUv;
                
                void main() {
                    vec2 texel = 1.0 / vec2(512.0);
                    
                    // Get previous state
                    vec4 prev = texture2D(uPrevious, vUv);
                    float pressure = prev.x;
                    float velocity = prev.y;
                    
                    // Sample neighbors
                    float left = texture2D(uPrevious, vUv - vec2(texel.x, 0.0)).x;
                    float right = texture2D(uPrevious, vUv + vec2(texel.x, 0.0)).x;
                    float up = texture2D(uPrevious, vUv + vec2(0.0, texel.y)).x;
                    float down = texture2D(uPrevious, vUv - vec2(0.0, texel.y)).x;
                    
                    // Wave equation - much stronger for dramatic effects  
                    float delta = min(uDelta, 1.0);
                    velocity += delta * (-2.0 * pressure + left + right) * 0.35; // Much stronger propagation
                    velocity += delta * (-2.0 * pressure + up + down) * 0.35;
                    
                    pressure += delta * velocity;
                    
                    // Minimal damping - waves travel across entire screen
                    velocity *= 0.982; // Drastically reduced damping
                    pressure *= 0.987; // Drastically reduced damping
                    
                    // Mouse interaction - smaller ripples on mobile for better visibility
                    if (uMouseDown > 0.5) {
                        float dist = distance(vUv, uMouse);
                        float rippleStrength = 1.2; // Much stronger initial impact
                        float rippleRadius = 0.08; // Smaller, more focused ripples
                        
                        if (dist < rippleRadius) {
                            float falloff = 1.0 - dist / rippleRadius;
                            falloff = smoothstep(0.0, 1.0, falloff); // Smoother falloff for better blending
                            pressure += falloff * rippleStrength;
                        }
                    }
                    
                    // No idle waves - only mouse/touch interaction
                    
                    // Calculate gradients for normals
                    float gradX = (right - left) * 0.5;
                    float gradY = (up - down) * 0.5;
                    
                    gl_FragColor = vec4(pressure, velocity, gradX, gradY);
                }
            `
        })
    }, [])
    
    // Simple display material - webflow style
    const material = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uWaterTexture: { value: null },
                uSceneTexture: { value: null },
                uTime: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uWaterTexture;
                uniform sampler2D uSceneTexture;
                uniform float uTime;
                varying vec2 vUv;
                
                void main() {
                    // Sample water simulation
                    vec4 water = texture2D(uWaterTexture, vUv);
                    float pressure = water.x;
                    float gradX = water.z;
                    float gradY = water.w;
                    
                    // Extreme distortion for dramatic layer deformation  
                    float distortionStrength = 0.25;
                    
                    vec2 distortion = vec2(gradX, gradY) * distortionStrength;
                    vec2 distortedUv = vUv + distortion;
                    
                    // Sample the scene with distortion
                    vec4 sceneColor = texture2D(uSceneTexture, distortedUv);
                    
                    // If distorted UV goes out of bounds, use original
                    if (distortedUv.x < 0.0 || distortedUv.x > 1.0 || distortedUv.y < 0.0 || distortedUv.y > 1.0) {
                        sceneColor = texture2D(uSceneTexture, vUv);
                    }
                    
                    // Only use white fallback for completely empty pixels
                    if (sceneColor.a < 0.1) {
                        sceneColor = vec4(1.0, 1.0, 1.0, 1.0);
                    }
                    
                    // Create subtle color variations to make water visible on white background
                    vec3 waterColor = vec3(0.96, 0.98, 1.0); // Slightly more blue tint
                    
                    // Calculate normal from gradients for lighting
                    vec3 normal = normalize(vec3(-gradX, 0.1, -gradY));
                    vec3 lightDir = normalize(vec3(-0.3, 1.0, 0.3));
                    
                    // Specular highlight
                    float spec = pow(max(dot(normal, lightDir), 0.0), 60.0);
                    
                    // Create dramatic depth-based color variation
                    float depthVariation = pressure * 0.25; // Much more pronounced depth effect
                    
                    // Dramatic gradient from light to dark based on water movement
                    float gradientIntensity = length(vec2(gradX, gradY)) * 3.0;
                    
                    // Create subtle shadows and highlights
                    vec3 shadowColor = vec3(0.92, 0.94, 0.98); // Slightly darker blue-gray
                    vec3 highlightColor = vec3(0.98, 0.99, 1.0); // Brighter white
                    
                    // Mix colors based on water movement and depth
                    vec3 waterTint = mix(shadowColor, highlightColor, 0.5 + depthVariation);
                    waterTint = mix(waterTint, waterColor, 0.7); // Blend with base water color
                    
                    // Apply water color modulation to scene
                    vec3 finalColor = sceneColor.rgb * waterTint;
                    
                    // Dramatic visual effects for maximum water impact
                    float effectStrength = 0.8; // Much stronger specular highlights
                    float pressureStrength = 0.12; // Much stronger pressure visualization
                    
                    finalColor += vec3(spec) * effectStrength;
                    finalColor += pressure * pressureStrength;
                    
                    // Add strong gradient overlay for dramatic water perception
                    float gradientOverlay = gradientIntensity * 0.05;
                    finalColor = mix(finalColor, shadowColor, gradientOverlay);
                    
                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            transparent: false,
            depthTest: false,
            depthWrite: false
        })
    }, [])
    
    // Simple mouse tracking - like SimpleWater
    useEffect(() => {
        const handleMouseMove = (e) => {
            mouse.current.x = e.clientX / window.innerWidth
            mouse.current.y = 1.0 - (e.clientY / window.innerHeight)
        }
        
        const handleMouseDown = () => {
            mouseDown.current = true
        }
        
        const handleMouseUp = () => {
            mouseDown.current = false
        }
        
        const handleTouchMove = (e) => {
            if (e.touches.length > 0) {
                mouse.current.x = e.touches[0].clientX / window.innerWidth
                mouse.current.y = 1.0 - (e.touches[0].clientY / window.innerHeight)
            }
        }
        
        const handleTouchStart = (e) => {
            if (e.touches.length > 0) {
                mouse.current.x = e.touches[0].clientX / window.innerWidth
                mouse.current.y = 1.0 - (e.touches[0].clientY / window.innerHeight)
                mouseDown.current = true
            }
        }
        
        const handleTouchEnd = () => {
            mouseDown.current = false
        }
        
        window.addEventListener('mousemove', handleMouseMove, { passive: true })
        window.addEventListener('mousedown', handleMouseDown, { passive: true })
        window.addEventListener('mouseup', handleMouseUp, { passive: true })
        window.addEventListener('touchmove', handleTouchMove, { passive: true })
        window.addEventListener('touchstart', handleTouchStart, { passive: true })
        window.addEventListener('touchend', handleTouchEnd, { passive: true })
        
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mousedown', handleMouseDown)
            window.removeEventListener('mouseup', handleMouseUp)
            window.removeEventListener('touchmove', handleTouchMove)
            window.removeEventListener('touchstart', handleTouchStart)
            window.removeEventListener('touchend', handleTouchEnd)
        }
    }, [])
    
    useFrame((state, delta) => {
        // Clamp delta to prevent simulation instability
        const clampedDelta = Math.min(delta * 60, 1.4)
        
        const currentTarget = gl.getRenderTarget()
        
        // 1. ALWAYS update water simulation - this MUST never stop
        try {
            if (simMaterial.uniforms && buffers.read && buffers.write) {
                simMaterial.uniforms.uPrevious.value = buffers.read.texture
                simMaterial.uniforms.uTime.value = state.clock.elapsedTime
                simMaterial.uniforms.uMouse.value.copy(mouse.current)
                simMaterial.uniforms.uMouseDown.value = mouseDown.current ? 1.0 : 0.0
                simMaterial.uniforms.uDelta.value = clampedDelta
                
                // Render simulation to write buffer - this MUST always happen
                gl.setRenderTarget(buffers.write)
                gl.clear()
                gl.render(simScene, simCamera)
                
                // Swap buffers - this MUST always happen
                const temp = buffers.read
                buffers.read = buffers.write
                buffers.write = temp
            }
        } catch (error) {
            console.warn('Water simulation error, continuing...', error)
        }
        
        // 2. Scene capture (safe fallback if it fails)
        try {
            if (meshRef.current && buffers.scene) {
                meshRef.current.visible = false
                
                gl.setRenderTarget(buffers.scene)
                gl.setClearColor(new THREE.Color(1, 1, 1), 1.0)
                gl.clear(gl.COLOR_BUFFER_BIT)
                gl.render(scene, camera)
                
                meshRef.current.visible = true
            }
        } catch (error) {
            console.warn('Scene capture error, continuing...', error)
            if (meshRef.current) meshRef.current.visible = true
        }
        
        // 3. Update display material (safe fallback)
        try {
            if (material.uniforms && buffers.read && buffers.scene) {
                material.uniforms.uWaterTexture.value = buffers.read.texture
                material.uniforms.uSceneTexture.value = buffers.scene.texture
                material.uniforms.uTime.value = state.clock.elapsedTime
            }
        } catch (error) {
            console.warn('Display material error, continuing...', error)
        }
        
        gl.setRenderTarget(currentTarget)
    })
    
    // Create simulation scene
    const simScene = useMemo(() => {
        const scene = new THREE.Scene()
        const geometry = new THREE.PlaneGeometry(2, 2)
        const mesh = new THREE.Mesh(geometry, simMaterial)
        scene.add(mesh)
        return scene
    }, [simMaterial])
    
    const simCamera = useMemo(() => {
        return new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    }, [])
    
    return (
        <mesh 
            ref={meshRef}
            position={[0, 0, 10]}
            frustumCulled={false}
            renderOrder={9999}
            raycast={() => null}
        >
            <planeGeometry args={[2, 2]} />
            <primitive object={material} />
        </mesh>
    )
})

export default MobileWater