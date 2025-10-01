import { useRef, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const MobileWater = forwardRef((props, ref) => {
    const { gl, size, scene, camera } = useThree()
    const meshRef = useRef()
    const mouse = useRef(new THREE.Vector2(0.5, 0.5))
    const mouseDown = useRef(false)
    const lastInteractionTime = useRef(Date.now()) // Track last interaction
    const isInactive = useRef(false) // Track if we should pause simulation

    // Mouse tracking voor subtiele parallax position effect
    const mousePosition = useRef({ x: 0, y: 0 })
    const targetPosition = useRef({ x: 0, y: 0 })
    const currentPosition = useRef({ x: 0, y: 0 })

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
            } else {
                // Try half float on WebGL 2
                textureType = THREE.HalfFloatType
            }
        } else {
            // WebGL 1 - check for half float support
            const halfFloatExt = glContext.getExtension('OES_texture_half_float')
            const halfFloatLinearExt = glContext.getExtension('OES_texture_half_float_linear')

            if (halfFloatExt && halfFloatLinearExt) {
                textureType = THREE.HalfFloatType
            } else {
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

        // Aggressive mobile optimization - much lower resolution for better performance
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2) // Cap at 2x for performance
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768

        // Balanced resolution for quality vs performance
        let baseResolution
        if (isMobile) {
            baseResolution = 512 // Higher for better texture quality, still optimized
        } else {
            baseResolution = hasFloatSupport ? 1024 : 512 // Good quality for desktop
        }

        const resolution = Math.floor(baseResolution / Math.max(pixelRatio, 1.2)) // Less aggressive scaling

        // Scene buffer optimization - balanced for quality and performance
        const sceneResolutionMultiplier = isMobile ? 0.8 : 0.9 // Better quality, still optimized
        const sceneWidth = Math.floor(size.width * pixelRatio * sceneResolutionMultiplier)
        const sceneHeight = Math.floor(size.height * pixelRatio * sceneResolutionMultiplier)


        return {
            read: new THREE.WebGLRenderTarget(resolution, resolution, options),
            write: new THREE.WebGLRenderTarget(resolution, resolution, options),
            scene: new THREE.WebGLRenderTarget(sceneWidth, sceneHeight, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType, // Always safe for scene capture
                samples: isMobile ? 0 : 1, // No multisampling for mobile, minimal for desktop
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

        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768

        return new THREE.ShaderMaterial({
            uniforms: {
                uPrevious: { value: null },
                uTime: { value: 0 },
                uMouse: { value: new THREE.Vector2(0.5, 0.5) },
                uMouseDown: { value: 0 },
                uDelta: { value: 1.0 },
                uHasFloatSupport: { value: hasFloatSupport ? 1.0 : 0.0 },
                uIsMobile: { value: isMobile ? 1.0 : 0.0 },
                uIsInactive: { value: 0.0 }
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
                uniform float uIsMobile;
                uniform float uIsInactive;
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

                    // Underwater damping - slower dissipation like SimpleWater
                    // BUT: much stronger damping when inactive to prevent accumulation errors
                    float velocityDamping = (uIsInactive > 0.5) ? 0.95 : 0.998;
                    float pressureDamping = (uIsInactive > 0.5) ? 0.96 : 0.999;

                    velocity *= velocityDamping;
                    pressure *= pressureDamping;

                    // Clamp values to prevent runaway accumulation on byte textures
                    if (uHasFloatSupport < 0.5) {
                        pressure = clamp(pressure, -0.8, 0.8);
                        velocity = clamp(velocity, -0.8, 0.8);
                    }

                    // Underwater hand-swipe interaction (simplified but more like SimpleWater)
                    if (uMouseDown > 0.5) {
                        float dist = distance(vUv, uMouse);
                        float swipeRadius = 0.12; // Larger interaction area like SimpleWater
                        float swipeStrength = 0.3;

                        if (dist < swipeRadius) {
                            float falloff = smoothstep(swipeRadius, 0.0, dist);

                            // Add subtle turbulence for more natural underwater effect
                            float turbulence = sin(vUv.x * 30.0 + uTime) * cos(vUv.y * 30.0 - uTime) * 0.2;

                            // Combined underwater effect
                            float effect = falloff * swipeStrength;
                            pressure += effect * (1.0 + turbulence);
                        }
                    }

                    // Optimized idle waves - reduced complexity for mobile
                    // STOP idle waves when inactive to prevent accumulation
                    if (uIsInactive < 0.5) {
                        float idleWaveStrength = 0.06;
                        float idleSpeed = 0.3;
                        float idleDisturbance;

                        if (uIsMobile > 0.5) {
                            // Mobile: Only 2 simpler waves for better performance
                            float wave1 = sin(vUv.x * 8.0 + uTime * idleSpeed) * 0.5;
                            float wave2 = sin(vUv.y * 6.0 + uTime * idleSpeed * 0.8) * 0.5;
                            idleDisturbance = (wave1 + wave2) * idleWaveStrength;
                        } else {
                            // Desktop: Keep 3 waves for quality
                            float wave1 = sin(vUv.x * 12.0 + uTime * idleSpeed) * 0.4;
                            float wave2 = sin(vUv.y * 8.0 + uTime * idleSpeed * 0.7) * 0.3;
                            float wave3 = sin((vUv.x + vUv.y) * 6.0 + uTime * idleSpeed * 1.3) * 0.3;
                            idleDisturbance = (wave1 + wave2 + wave3) * idleWaveStrength;
                        }

                        pressure += idleDisturbance;
                    }

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
                uHasFloatSupport: { value: buffers.hasFloatSupport ? 1.0 : 0.0 },
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

                    // More visible distortion for underwater effect (like SimpleWater)
                    float distortionStrength = 0.055;

                    vec2 distortion = vec2(gradX, gradY) * distortionStrength;
                    vec2 distortedUv = vUv + distortion;

                    // Chromatic aberration - more subtle like SimpleWater
                    float aberrationStrength = 0.001; // Even more subtle
                    vec2 aberrationOffset = distortion * aberrationStrength / distortionStrength;

                    // Sample each color channel with different offsets
                    vec2 uvR = distortedUv + aberrationOffset;
                    vec2 uvG = distortedUv;
                    vec2 uvB = distortedUv - aberrationOffset;

                    // Softer UV clamping to reduce edge artifacts (like SimpleWater)
                    uvR = clamp(uvR, 0.0001, 0.9999);
                    uvG = clamp(uvG, 0.0001, 0.9999);
                    uvB = clamp(uvB, 0.0001, 0.9999);

                    // Sample RGB separately for chromatic aberration
                    float r = texture2D(uSceneTexture, uvR).r;
                    float g = texture2D(uSceneTexture, uvG).g;
                    float b = texture2D(uSceneTexture, uvB).b;
                    float a = texture2D(uSceneTexture, uvG).a;

                    vec4 sceneColor = vec4(r, g, b, a);

                    // Softer fallback transition for smoother edges (like SimpleWater)
                    if (sceneColor.a < 0.01) {
                        sceneColor = vec4(1.0, 1.0, 1.0, 1.0);
                    }

                    // Much more subtle water color - almost white (like SimpleWater)
                    vec3 waterColor = vec3(0.98, 0.99, 1.0);

                    // Calculate normal from gradients for lighting
                    vec3 normal = normalize(vec3(-gradX, 0.1, -gradY));
                    vec3 lightDir = normalize(vec3(-0.3, 1.0, 0.3));

                    // Depth calculation using pressure values as proxy (like SimpleWater)
                    float depth = abs(pressure) * 2.0 + 0.1; // Base depth + variation
                    float depthAttenuation = exp(-depth * 0.5); // Exponential falloff

                    // Cleaner, single-layer specular with depth (like SimpleWater)
                    float spec = pow(max(dot(normal, lightDir), 0.0), 50.0) * depthAttenuation;

                    // Subtle volumetric scattering (like SimpleWater)
                    float volumetricScatter = 1.0 - exp(-depth * 0.5);
                    vec3 scatterColor = vec3(0.95, 0.97, 1.0); // Very subtle blue tint

                    // Cleaner, slower caustics (like SimpleWater)
                    float causticScale = 6.0;
                    float caustic = sin(vUv.x * causticScale + uTime * 0.3) * sin(vUv.y * causticScale + uTime * 0.2);
                    caustic *= exp(-depth * 1.0) * 0.15; // More subtle caustics

                    // Combine scene with water effects
                    vec3 finalColor = sceneColor.rgb * waterColor;

                    // Add subtle volumetric scattering (like SimpleWater)
                    finalColor = mix(finalColor, scatterColor, volumetricScatter * 0.05);

                    // Add clean caustics (like SimpleWater)
                    finalColor += vec3(caustic) * 0.1;

                    // Reduced visual effect strength - keep deformation but less visible water effects (like SimpleWater)
                    float effectStrength = 0.11; // Slightly more visible glare
                    float pressureStrength = 0.03; // Reduced for less pressure visibility

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
            lastInteractionTime.current = Date.now()
            isInactive.current = false
        }

        const handleMouseDown = () => {
            mouseDown.current = true
            lastInteractionTime.current = Date.now()
            isInactive.current = false
        }

        const handleMouseUp = () => {
            mouseDown.current = false
        }

        const handleTouchMove = (e) => {
            if (e.touches.length > 0) {
                mouse.current.x = e.touches[0].clientX / window.innerWidth
                mouse.current.y = 1.0 - (e.touches[0].clientY / window.innerHeight)
                lastInteractionTime.current = Date.now()
                isInactive.current = false
            }
        }

        const handleTouchStart = (e) => {
            if (e.touches.length > 0) {
                mouse.current.x = e.touches[0].clientX / window.innerWidth
                mouse.current.y = 1.0 - (e.touches[0].clientY / window.innerHeight)
                mouseDown.current = true
                lastInteractionTime.current = Date.now()
                isInactive.current = false
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

    // Add WebGL context loss recovery for mobile stability
    useEffect(() => {
        const canvas = gl.domElement

        const handleContextLost = (event) => {
            event.preventDefault()
            console.warn('WebGL context lost - MobileWater')
        }

        const handleContextRestored = () => {
            console.warn('WebGL context restored - MobileWater')
            // Reset interaction time to restart simulation properly
            lastInteractionTime.current = Date.now()
            isInactive.current = false
        }

        canvas.addEventListener('webglcontextlost', handleContextLost, false)
        canvas.addEventListener('webglcontextrestored', handleContextRestored, false)

        return () => {
            canvas.removeEventListener('webglcontextlost', handleContextLost)
            canvas.removeEventListener('webglcontextrestored', handleContextRestored)
        }
    }, [gl])

    useFrame((state, delta) => {
        // Check for inactivity to prevent mobile memory/precision issues
        const now = Date.now()
        const timeSinceLastInteraction = now - lastInteractionTime.current

        // After 30 seconds of inactivity, apply stronger damping and stop idle waves
        if (timeSinceLastInteraction > 30000) { // 30 seconds
            isInactive.current = true
            // Skip every other frame during inactivity to reduce mobile load
            if (Math.floor(state.clock.elapsedTime * 30) % 2 === 0) {
                return
            }
        }

        // Clamp delta to prevent simulation instability
        const clampedDelta = Math.min(delta * 60, 1.4)

        const currentTarget = gl.getRenderTarget()

        // 1. Water simulation with mobile safety checks
        try {
            if (simMaterial.uniforms && buffers.read && buffers.write) {
                simMaterial.uniforms.uPrevious.value = buffers.read.texture
                // Use modulo to prevent floating point precision issues on mobile
                const safeTime = (state.clock.elapsedTime * 0.3) % 1000 // Cycle every 1000 seconds
                simMaterial.uniforms.uTime.value = safeTime
                simMaterial.uniforms.uMouse.value.copy(mouse.current)
                simMaterial.uniforms.uMouseDown.value = mouseDown.current ? 1.0 : 0.0
                simMaterial.uniforms.uDelta.value = clampedDelta
                simMaterial.uniforms.uIsInactive.value = isInactive.current ? 1.0 : 0.0

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

                // Make BarrelDistortionTemplate meshes AND text meshes visible during scene capture
                const barrelDistortionMeshes = []
                const hiddenContainers = []
                scene.traverse((child) => {
                    // Skip blue container from water capture to prevent double rendering
                    // Only hide during capture, but allow it to exist normally for water interaction
                    if (child.userData?.skipWaterCapture) {
                        if (child.visible) {
                            hiddenContainers.push(child)
                            child.visible = false
                        }
                        return
                    }

                    // Original barrel distortion meshes (images)
                    if (child.isMesh && child.material && child.material.uniforms && child.material.uniforms.uScrollVelocity) {
                        barrelDistortionMeshes.push(child)
                        child.visible = true
                    }
                    // Text meshes (troika Text objects) - including logo
                    else if (child.isText || child.type === 'Text' || child.userData?.type === 'webgl-text' || child.userData?.isLogo) {
                        barrelDistortionMeshes.push(child)
                        child.visible = true
                    }
                })

                gl.setRenderTarget(buffers.scene)
                gl.setClearColor(new THREE.Color(1, 1, 1), 1.0)
                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT) // Clear both color and depth

                // Force a complete frame render with antialiasing
                gl.render(scene, camera)

                // Hide BarrelDistortionTemplate meshes again after capture
                barrelDistortionMeshes.forEach(mesh => {
                    mesh.visible = false
                })

                // Restore visibility of hidden containers
                hiddenContainers.forEach(mesh => {
                    mesh.visible = true
                })

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

        // Parallax removed from water layer

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
