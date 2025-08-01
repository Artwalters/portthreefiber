import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export default function SimpleWaterOverlay() {
    const { gl, size, camera, scene } = useThree()
    const meshRef = useRef()
    const mouse = useRef(new THREE.Vector2())
    const mouseDown = useRef(false)
    
    // Create render target for scene capture
    const sceneTarget = useMemo(() => {
        return new THREE.WebGLRenderTarget(size.width, size.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        })
    }, [size])
    
    // Update render target size on resize
    useEffect(() => {
        sceneTarget.setSize(size.width, size.height)
        return () => sceneTarget.dispose()
    }, [size, sceneTarget])
    
    // Simple water shader material
    const material = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uSceneTexture: { value: null },
                uTime: { value: 0 },
                uMouse: { value: new THREE.Vector2(0.5, 0.5) },
                uMouseDown: { value: 0 },
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
                uniform sampler2D uSceneTexture;
                uniform float uTime;
                uniform vec2 uMouse;
                uniform float uMouseDown;
                uniform vec2 uResolution;
                varying vec2 vUv;
                
                void main() {
                    vec2 uv = vUv;
                    
                    // Create ripple effect from mouse
                    float dist = distance(uv, uMouse);
                    float ripple = 0.0;
                    
                    if (uMouseDown > 0.5) {
                        ripple = sin(dist * 40.0 - uTime * 6.0) * exp(-dist * 5.0) * 0.02;
                    }
                    
                    // Add subtle wave animation
                    vec2 wave1 = vec2(
                        sin(uv.y * 10.0 + uTime * 0.5) * 0.005,
                        cos(uv.x * 10.0 + uTime * 0.3) * 0.005
                    );
                    
                    vec2 wave2 = vec2(
                        sin(uv.y * 15.0 - uTime * 0.8) * 0.003,
                        cos(uv.x * 15.0 - uTime * 0.6) * 0.003
                    );
                    
                    // Combine distortions
                    vec2 distortion = wave1 + wave2 + ripple;
                    vec2 distortedUv = uv + distortion;
                    
                    // Sample scene with distortion
                    vec4 sceneColor = texture2D(uSceneTexture, distortedUv);
                    
                    // Add subtle color tint
                    vec3 waterTint = vec3(0.95, 0.98, 1.0);
                    vec3 finalColor = sceneColor.rgb * waterTint;
                    
                    // Add specular highlights based on distortion
                    float highlight = pow(max(0.0, ripple * 20.0), 2.0);
                    finalColor += vec3(1.0) * highlight * 0.5;
                    
                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            depthTest: false,
            depthWrite: false
        })
    }, [size])
    
    // Mouse event handlers
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
        
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mousedown', handleMouseDown)
        window.addEventListener('mouseup', handleMouseUp)
        window.addEventListener('touchmove', handleTouchMove)
        window.addEventListener('touchstart', handleTouchStart)
        window.addEventListener('touchend', handleTouchEnd)
        
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mousedown', handleMouseDown)
            window.removeEventListener('mouseup', handleMouseUp)
            window.removeEventListener('touchmove', handleTouchMove)
            window.removeEventListener('touchstart', handleTouchStart)
            window.removeEventListener('touchend', handleTouchEnd)
        }
    }, [])
    
    useFrame((state) => {
        // Store current render target
        const currentRenderTarget = gl.getRenderTarget()
        
        // Hide water mesh temporarily
        if (meshRef.current) {
            meshRef.current.visible = false
        }
        
        // Capture scene without water effect
        gl.setRenderTarget(sceneTarget)
        gl.render(scene, camera)
        
        // Show water mesh again
        if (meshRef.current) {
            meshRef.current.visible = true
        }
        
        // Update uniforms
        material.uniforms.uSceneTexture.value = sceneTarget.texture
        material.uniforms.uTime.value = state.clock.elapsedTime
        material.uniforms.uMouse.value.copy(mouse.current)
        material.uniforms.uMouseDown.value = mouseDown.current ? 1.0 : 0.0
        material.uniforms.uResolution.value.set(size.width, size.height)
        
        // Restore render target
        gl.setRenderTarget(currentRenderTarget)
    })
    
    return (
        <mesh ref={meshRef} frustumCulled={false} renderOrder={1000}>
            <planeGeometry args={[2, 2]} />
            <primitive object={material} />
        </mesh>
    )
}