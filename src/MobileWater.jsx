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
    
    // Mobile-safe buffers with proper WebGL extension checking
    const buffers = useMemo(() => {
        const glContext = gl.getContext()
        let textureType = THREE.UnsignedByteType
        let hasFloatSupport = false
        
        // Check for WebGL 2 first
        if (glContext instanceof WebGL2RenderingContext) {
            // WebGL 2 - check for EXT_color_buffer_float
            const floatExt = glContext.getExtension('EXT_color_buffer_float')
            if (floatExt) {
                textureType = THREE.FloatType
                hasFloatSupport = true
                console.log('MobileWater: Using FloatType (WebGL2 + EXT_color_buffer_float)')
            } else {
                // Try half float on WebGL 2
                textureType = THREE.HalfFloatType
                console.log('MobileWater: Using HalfFloatType (WebGL2 fallback)')
            }
        } else {
            // WebGL 1 - check for half float support
            const halfFloatExt = glContext.getExtension('OES_texture_half_float')
            const halfFloatLinearExt = glContext.getExtension('OES_texture_half_float_linear')
            
            if (halfFloatExt && halfFloatLinearExt) {
                textureType = THREE.HalfFloatType
                console.log('MobileWater: Using HalfFloatType (WebGL1)')
            } else {
                console.log('MobileWater: Using UnsignedByteType (mobile safe fallback)')
            }
        }
        
        // Adjust filtering based on texture type for mobile compatibility
        const filtering = textureType === THREE.UnsignedByteType ? THREE.LinearFilter : THREE.NearestFilter
        
        const options = {
            minFilter: filtering,
            magFilter: filtering,
            format: THREE.RGBAFormat,
            type: textureType,
            generateMipmaps: false // Disable mipmaps for performance
        }
        
        // Adaptive resolution based on device pixel ratio and performance
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2) // Cap at 2x for performance
        const baseResolution = hasFloatSupport ? 512 : 256 // Higher res if we have float support
        const resolution = Math.floor(baseResolution / pixelRatio) // Scale down for high DPI
        
        // Scene buffer should match actual screen resolution for proper reflection/refraction
        const sceneWidth = Math.floor(size.width * pixelRatio)
        const sceneHeight = Math.floor(size.height * pixelRatio)
        
        console.log(`MobileWater: Resolution ${resolution}x${resolution}, Scene ${sceneWidth}x${sceneHeight}, PixelRatio ${pixelRatio}`)
        
        return {
            read: new THREE.WebGLRenderTarget(resolution, resolution, options),
            write: new THREE.WebGLRenderTarget(resolution, resolution, options),
            scene: new THREE.WebGLRenderTarget(sceneWidth, sceneHeight, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType, // Always safe for scene capture
                generateMipmaps: false
            }),
            hasFloatSupport: hasFloatSupport,
            textureType: textureType
        }
    }, [])
    
    // Adaptive shader based on texture support
    const simMaterial = useMemo(() => {
        const hasFloatSupport = buffers.hasFloatSupport
        const useValueMapping = !hasFloatSupport
        
        return new THREE.ShaderMaterial({
            uniforms: {
                uPrevious: { value: null },
                uTime: { value: 0 },
                uMouse: { value: new THREE.Vector2(0.5, 0.5) },
                uMouseDown: { value: 0 },
                uDelta: { value: 1.0 },
                uHasFloatSupport: { value: hasFloatSupport ? 1.0 : 0.0 }
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
                uniform float uHasFloatSupport;
                varying vec2 vUv;
                
                void main() {
                    vec2 texel = 1.0 / vec2(${Math.floor(buffers.read.width)}.0);
                    
                    // Get previous state - adaptive based on texture support
                    vec4 prev = texture2D(uPrevious, vUv);
                    float pressure, velocity;
                    
                    if (uHasFloatSupport > 0.5) {
                        // Float textures - use values directly
                        pressure = prev.x;
                        velocity = prev.y;
                    } else {
                        // Byte textures - map from [0,1] to [-1,1] for more range
                        pressure = prev.x * 2.0 - 1.0;
                        velocity = prev.y * 2.0 - 1.0;
                    }
                    
                    // Sample neighbors - adaptive based on texture support
                    vec4 leftSample = texture2D(uPrevious, vUv - vec2(texel.x, 0.0));
                    vec4 rightSample = texture2D(uPrevious, vUv + vec2(texel.x, 0.0));
                    vec4 upSample = texture2D(uPrevious, vUv + vec2(0.0, texel.y));
                    vec4 downSample = texture2D(uPrevious, vUv - vec2(0.0, texel.y));
                    
                    float left, right, up, down;
                    if (uHasFloatSupport > 0.5) {
                        left = leftSample.x;
                        right = rightSample.x;
                        up = upSample.x;
                        down = downSample.x;
                    } else {
                        left = leftSample.x * 2.0 - 1.0;
                        right = rightSample.x * 2.0 - 1.0;
                        up = upSample.x * 2.0 - 1.0;
                        down = downSample.x * 2.0 - 1.0;
                    }
                    
                    // Wave equation - matching SimpleWater's coefficients
                    float delta = min(uDelta, 1.0);
                    velocity += delta * (-2.0 * pressure + left + right) * 0.1875; // Match SimpleWater
                    velocity += delta * (-2.0 * pressure + up + down) * 0.1875;
                    
                    pressure += delta * velocity;
                    
                    // Match SimpleWater's damping for longer lasting waves
                    velocity *= 0.995; // Same as SimpleWater
                    pressure *= 0.998; // Same as SimpleWater
                    
                    // Mouse interaction - matching SimpleWater
                    if (uMouseDown > 0.5) {
                        float dist = distance(vUv, uMouse);
                        float rippleStrength = 0.5; // Match SimpleWater
                        float rippleRadius = 0.075; // Match SimpleWater
                        
                        if (dist < rippleRadius) {
                            pressure += (1.0 - dist / rippleRadius) * rippleStrength;
                        }
                    }
                    
                    // Add idle waves like SimpleWater for continuous movement
                    float idleWaveStrength = 0.06;
                    float idleSpeed = 0.3;
                    
                    // Multiple sine waves at different frequencies
                    float wave1 = sin(vUv.x * 12.0 + uTime * idleSpeed) * 0.4;
                    float wave2 = sin(vUv.y * 8.0 + uTime * idleSpeed * 0.7) * 0.3;
                    float wave3 = sin((vUv.x + vUv.y) * 6.0 + uTime * idleSpeed * 1.3) * 0.3;
                    
                    float idleDisturbance = (wave1 + wave2 + wave3) * idleWaveStrength;
                    pressure += idleDisturbance;
                    
                    // Calculate gradients for normals
                    float gradX = (right - left) * 0.5;
                    float gradY = (up - down) * 0.5;
                    
                    // Output format depends on texture support
                    if (uHasFloatSupport > 0.5) {
                        // Float textures - output values directly
                        gl_FragColor = vec4(pressure, velocity, gradX, gradY);
                    } else {
                        // Byte textures - map back to [0,1] range for storage
                        pressure = (pressure + 1.0) * 0.5;
                        velocity = (velocity + 1.0) * 0.5;
                        gradX = (gradX + 1.0) * 0.5;
                        gradY = (gradY + 1.0) * 0.5;
                        gl_FragColor = vec4(pressure, velocity, gradX, gradY);
                    }
                }
            `
        })
    }, [])
    
    // Adaptive display material
    const material = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uWaterTexture: { value: null },
                uSceneTexture: { value: null },
                uTime: { value: 0 },
                uHasFloatSupport: { value: buffers.hasFloatSupport ? 1.0 : 0.0 }
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
                uniform float uHasFloatSupport;
                varying vec2 vUv;
                
                void main() {
                    // Sample water simulation - adaptive based on texture support
                    vec4 water = texture2D(uWaterTexture, vUv);
                    float pressure, gradX, gradY;
                    
                    if (uHasFloatSupport > 0.5) {
                        // Float textures - use values directly
                        pressure = water.x;
                        gradX = water.z;
                        gradY = water.w;
                    } else {
                        // Byte textures - map back from [0,1] to [-1,1]
                        pressure = water.x * 2.0 - 1.0;
                        gradX = water.z * 2.0 - 1.0;
                        gradY = water.w * 2.0 - 1.0;
                    }
                    
                    // Match SimpleWater's distortion strength
                    float distortionStrength = 0.04;
                    
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
                    
                    // Match SimpleWater's subtle water color
                    vec3 waterColor = vec3(0.98, 0.99, 1.0);
                    
                    // Calculate normal from gradients for lighting
                    vec3 normal = normalize(vec3(-gradX, 0.1, -gradY));
                    vec3 lightDir = normalize(vec3(-0.3, 1.0, 0.3));
                    
                    // Specular highlight
                    float spec = pow(max(dot(normal, lightDir), 0.0), 60.0);
                    
                    // Combine scene with water effects - match SimpleWater
                    vec3 finalColor = sceneColor.rgb * waterColor;
                    
                    // Match SimpleWater's reduced visual effect strength
                    float effectStrength = 0.3; // Same as SimpleWater
                    float pressureStrength = 0.03; // Same as SimpleWater
                    
                    finalColor += vec3(spec) * effectStrength;
                    finalColor += pressure * pressureStrength;
                    
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