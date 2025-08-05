import { useRef, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const MobileWater = forwardRef((props, ref) => {
    const { gl, size, scene, camera } = useThree()
    const meshRef = useRef()
    const mouse = useRef(new THREE.Vector2(0.5, 0.5))
    const mouseDown = useRef(false)
    const lastRippleTime = useRef(0)
    
    // Expose update function for external components (like slider)
    useImperativeHandle(ref, () => ({
        updateMouse: (x, y, isDown) => {
            mouse.current.x = x / window.innerWidth
            mouse.current.y = 1.0 - (y / window.innerHeight)
            mouseDown.current = isDown
        }
    }))
    
    // Mobile-optimized buffers - smaller resolution, UnsignedByte for compatibility
    const buffers = useMemo(() => {
        // Use HalfFloat for mobile compatibility, fallback to UnsignedByte
        let textureType = THREE.HalfFloatType
        const gl = gl.getContext()
        
        // Test HalfFloat support
        const halfFloatExt = gl.getExtension('OES_texture_half_float')
        if (!halfFloatExt) {
            textureType = THREE.UnsignedByteType
            console.log('MobileWater: Using UnsignedByte textures')
        } else {
            console.log('MobileWater: Using HalfFloat textures')
        }
        
        const options = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: textureType
        }
        
        // Lower resolution for mobile performance
        const resolution = 256
        
        return {
            read: new THREE.WebGLRenderTarget(resolution, resolution, options),
            write: new THREE.WebGLRenderTarget(resolution, resolution, options),
            scene: new THREE.WebGLRenderTarget(size.width, size.height, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType // Always use UnsignedByte for scene capture
            }),
            textureType: textureType,
            resolution: resolution
        }
    }, [])
    
    // Mobile-optimized water simulation - simpler but stable
    const simMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uPrevious: { value: null },
                uTime: { value: 0 },
                uMouse: { value: new THREE.Vector2(0.5, 0.5) },
                uMouseDown: { value: 0 },
                uDelta: { value: 1.0 },
                uRipple: { value: 0.0 },
                uRipplePos: { value: new THREE.Vector2(0.5, 0.5) }
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
                uniform float uRipple;
                uniform vec2 uRipplePos;
                varying vec2 vUv;
                
                void main() {
                    vec2 texel = 1.0 / vec2(256.0);
                    
                    // Get previous state
                    vec4 prev = texture2D(uPrevious, vUv);
                    float height = prev.x;
                    float velocity = prev.y;
                    
                    // Sample neighbors for wave equation
                    float left = texture2D(uPrevious, vUv - vec2(texel.x, 0.0)).x;
                    float right = texture2D(uPrevious, vUv + vec2(texel.x, 0.0)).x;
                    float up = texture2D(uPrevious, vUv + vec2(0.0, texel.y)).x;
                    float down = texture2D(uPrevious, vUv - vec2(0.0, texel.y)).x;
                    
                    // Simple wave equation - optimized for mobile
                    float delta = min(uDelta, 1.0);
                    float average = (left + right + up + down) * 0.25;
                    velocity += (average - height) * delta * 2.0;
                    height += velocity * delta;
                    
                    // Strong damping for mobile stability
                    velocity *= 0.98;
                    height *= 0.99;
                    
                    // Add ripple on touch/click - based on webflow ripples params
                    if (uRipple > 0.0) {
                        float dist = distance(vUv, uRipplePos);
                        float rippleRadius = 0.08; // Similar to dropRadius: 20 in webflow
                        
                        if (dist < rippleRadius) {
                            float ripple = (1.0 - dist / rippleRadius);
                            ripple = sin(ripple * 3.14159); // Sine wave for smooth ripple
                            height += ripple * uRipple * 0.3; // Moderate strength
                        }
                    }
                    
                    // Subtle idle animation - much calmer for mobile
                    float idleStrength = 0.02;
                    float idleSpeed = 0.5;
                    float idle = sin(vUv.x * 8.0 + uTime * idleSpeed) * 
                                sin(vUv.y * 6.0 + uTime * idleSpeed * 0.8) * idleStrength;
                    height += idle;
                    
                    // Calculate simple gradients
                    float gradX = (right - left) * 0.5;
                    float gradY = (up - down) * 0.5;
                    
                    gl_FragColor = vec4(height, velocity, gradX, gradY);
                }
            `
        })
    }, [])
    
    // Mobile-optimized display material
    const material = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uWaterTexture: { value: null },
                uSceneTexture: { value: null },
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(size.width, size.height) }
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
                uniform vec2 uResolution;
                varying vec2 vUv;
                
                void main() {
                    // Sample water simulation
                    vec4 water = texture2D(uWaterTexture, vUv);
                    float height = water.x;
                    float gradX = water.z;
                    float gradY = water.w;
                    
                    // Mobile-optimized distortion - similar to perturbance: 0.04
                    float distortionStrength = 0.04;
                    vec2 distortion = vec2(gradX, gradY) * distortionStrength;
                    vec2 distortedUv = vUv + distortion;
                    
                    // Sample the scene with distortion
                    vec4 sceneColor = texture2D(uSceneTexture, distortedUv);
                    
                    // Bounds check
                    if (distortedUv.x < 0.0 || distortedUv.x > 1.0 || 
                        distortedUv.y < 0.0 || distortedUv.y > 1.0) {
                        sceneColor = texture2D(uSceneTexture, vUv);
                    }
                    
                    // Fallback for empty pixels
                    if (sceneColor.a < 0.1) {
                        sceneColor = vec4(1.0, 1.0, 1.0, 1.0);
                    }
                    
                    // Very subtle water tint for mobile
                    vec3 waterColor = vec3(0.99, 0.995, 1.0);
                    
                    // Simple lighting calculation
                    vec3 normal = normalize(vec3(-gradX, 0.2, -gradY));
                    vec3 lightDir = normalize(vec3(-0.2, 1.0, 0.2));
                    float spec = pow(max(dot(normal, lightDir), 0.0), 32.0);
                    
                    // Combine with very subtle effects for mobile
                    vec3 finalColor = sceneColor.rgb * waterColor;
                    finalColor += vec3(spec) * 0.1; // Very subtle specular
                    finalColor += height * 0.02; // Very subtle height contribution
                    
                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            transparent: false,
            depthTest: false,
            depthWrite: false
        })
    }, [size])
    
    // Mobile-optimized touch/mouse tracking
    useEffect(() => {
        let currentTouchId = null
        
        const addRipple = (x, y) => {
            const now = performance.now()
            // Throttle ripples for mobile performance
            if (now - lastRippleTime.current > 100) {
                mouse.current.x = x / window.innerWidth
                mouse.current.y = 1.0 - (y / window.innerHeight)
                
                // Trigger ripple in shader
                if (simMaterial.uniforms) {
                    simMaterial.uniforms.uRipple.value = 1.0
                    simMaterial.uniforms.uRipplePos.value.copy(mouse.current)
                }
                
                lastRippleTime.current = now
            }
        }
        
        const handleMouseMove = (e) => {
            if (mouseDown.current) {
                addRipple(e.clientX, e.clientY)
            }
        }
        
        const handleMouseDown = (e) => {
            mouseDown.current = true
            addRipple(e.clientX, e.clientY)
        }
        
        const handleMouseUp = () => {
            mouseDown.current = false
        }
        
        const handleTouchStart = (e) => {
            if (e.touches.length > 0 && currentTouchId === null) {
                currentTouchId = e.touches[0].identifier
                mouseDown.current = true
                addRipple(e.touches[0].clientX, e.touches[0].clientY)
            }
        }
        
        const handleTouchMove = (e) => {
            if (currentTouchId !== null) {
                for (let touch of e.touches) {
                    if (touch.identifier === currentTouchId) {
                        addRipple(touch.clientX, touch.clientY)
                        break
                    }
                }
            }
        }
        
        const handleTouchEnd = (e) => {
            // Check if our tracked touch ended
            let touchEnded = true
            for (let touch of e.touches) {
                if (touch.identifier === currentTouchId) {
                    touchEnded = false
                    break
                }
            }
            
            if (touchEnded) {
                currentTouchId = null
                mouseDown.current = false
            }
        }
        
        // Add event listeners with passive for better mobile performance
        window.addEventListener('mousemove', handleMouseMove, { passive: true })
        window.addEventListener('mousedown', handleMouseDown, { passive: true })
        window.addEventListener('mouseup', handleMouseUp, { passive: true })
        window.addEventListener('touchstart', handleTouchStart, { passive: true })
        window.addEventListener('touchmove', handleTouchMove, { passive: true })
        window.addEventListener('touchend', handleTouchEnd, { passive: true })
        
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mousedown', handleMouseDown)
            window.removeEventListener('mouseup', handleMouseUp)
            window.removeEventListener('touchstart', handleTouchStart)
            window.removeEventListener('touchmove', handleTouchMove)
            window.removeEventListener('touchend', handleTouchEnd)
        }
    }, [simMaterial])
    
    useFrame((state, delta) => {
        // Clamp delta for mobile stability
        const clampedDelta = Math.min(delta * 60, 1.2)
        const currentTarget = gl.getRenderTarget()
        
        // Update water simulation
        try {
            if (simMaterial.uniforms && buffers.read && buffers.write) {
                simMaterial.uniforms.uPrevious.value = buffers.read.texture
                simMaterial.uniforms.uTime.value = state.clock.elapsedTime
                simMaterial.uniforms.uMouse.value.copy(mouse.current)
                simMaterial.uniforms.uMouseDown.value = mouseDown.current ? 1.0 : 0.0
                simMaterial.uniforms.uDelta.value = clampedDelta
                
                // Decay ripple effect
                if (simMaterial.uniforms.uRipple.value > 0.0) {
                    simMaterial.uniforms.uRipple.value *= 0.95
                }
                
                // Render simulation
                gl.setRenderTarget(buffers.write)
                gl.clear()
                gl.render(simScene, simCamera)
                
                // Swap buffers
                const temp = buffers.read
                buffers.read = buffers.write
                buffers.write = temp
            }
        } catch (error) {
            console.warn('MobileWater simulation error:', error)
        }
        
        // Scene capture
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
            console.warn('MobileWater scene capture error:', error)
            if (meshRef.current) meshRef.current.visible = true
        }
        
        // Update display material
        try {
            if (material.uniforms && buffers.read && buffers.scene) {
                material.uniforms.uWaterTexture.value = buffers.read.texture
                material.uniforms.uSceneTexture.value = buffers.scene.texture
                material.uniforms.uTime.value = state.clock.elapsedTime
                material.uniforms.uResolution.value.set(size.width, size.height)
            }
        } catch (error) {
            console.warn('MobileWater display error:', error)
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