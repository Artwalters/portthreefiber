import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree, extend } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'
import * as THREE from 'three'

// Buffer shader - wave simulation
const bufferVertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const bufferFragmentShader = `
uniform sampler2D uPreviousTexture;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uMouseDown;
uniform float uTime;
uniform float uDelta;

varying vec2 vUv;

void main() {
    vec2 fragCoord = vUv * uResolution;
    
    // Sample previous state
    vec4 previousData = texture2D(uPreviousTexture, vUv);
    float pressure = previousData.x;
    float pVel = previousData.y;
    
    // Sample neighbors
    vec2 texelSize = 1.0 / uResolution;
    float p_right = texture2D(uPreviousTexture, vUv + vec2(texelSize.x, 0.0)).x;
    float p_left = texture2D(uPreviousTexture, vUv - vec2(texelSize.x, 0.0)).x;
    float p_up = texture2D(uPreviousTexture, vUv + vec2(0.0, texelSize.y)).x;
    float p_down = texture2D(uPreviousTexture, vUv - vec2(0.0, texelSize.y)).x;
    
    // Wrapping boundary conditions for continuous flow
    if (vUv.x <= texelSize.x) p_left = texture2D(uPreviousTexture, vec2(1.0 - texelSize.x, vUv.y)).x;
    if (vUv.x >= 1.0 - texelSize.x) p_right = texture2D(uPreviousTexture, vec2(texelSize.x, vUv.y)).x;
    if (vUv.y <= texelSize.y) p_down = texture2D(uPreviousTexture, vec2(vUv.x, 1.0 - texelSize.y)).x;
    if (vUv.y >= 1.0 - texelSize.y) p_up = texture2D(uPreviousTexture, vec2(vUv.x, texelSize.y)).x;
    
    // Wave equation
    float delta = min(uDelta, 1.0);
    pVel += delta * (-2.0 * pressure + p_right + p_left) / 4.0;
    pVel += delta * (-2.0 * pressure + p_up + p_down) / 4.0;
    
    // Update pressure
    pressure += delta * pVel;
    
    // Spring motion for water-like waves
    pVel -= 0.003 * delta * pressure;
    
    // Less damping so waves last longer
    pVel *= 1.0 - 0.001 * delta;
    pressure *= 0.9995;
    
    // Calculate gradients
    float gradX = (p_right - p_left) / 2.0;
    float gradY = (p_up - p_down) / 2.0;
    
    // Mouse interaction - much stronger
    if (uMouseDown > 0.5) {
        vec2 mousePos = uMouse * uResolution;
        float dist = distance(fragCoord, mousePos);
        if (dist <= 40.0) {
            pressure += (1.0 - dist / 40.0) * 1.0;
        }
    }
    
    // No automatic ripples - only mouse interaction
    
    gl_FragColor = vec4(pressure, pVel, gradX, gradY);
}
`

// Display shader - final rendering
const displayVertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const displayFragmentShader = `
uniform sampler2D uBufferTexture;
uniform sampler2D uSceneTexture;
uniform vec2 uResolution;
uniform float uTime;

varying vec2 vUv;

void main() {
    vec4 data = texture2D(uBufferTexture, vUv);
    
    // Apply stronger water distortion
    vec2 distortion = 0.025 * data.zw; // Much stronger distortion
    vec2 distortedUv = vUv + distortion;
    
    // Sample the scene with distortion
    vec4 sceneColor = texture2D(uSceneTexture, distortedUv);
    
    // If distorted UV goes out of bounds, sample original UV instead
    if (distortedUv.x < 0.0 || distortedUv.x > 1.0 || distortedUv.y < 0.0 || distortedUv.y > 1.0) {
        sceneColor = texture2D(uSceneTexture, vUv);
    }
    
    // If scene color is still black/empty, use original undistorted sample
    if (length(sceneColor.rgb) < 0.01) {
        sceneColor = texture2D(uSceneTexture, vUv);
    }
    
    // Calculate normal from gradients
    vec3 normal = normalize(vec3(-data.z * 0.5, 0.1, -data.w * 0.5));
    
    // Sunlight direction
    vec3 lightDir = normalize(vec3(-0.3, 1.0, 0.3));
    
    // Specular highlight
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfwayDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfwayDir), 0.0), 60.0);
    
    // Stronger water tint
    vec3 waterColor = vec3(0.85, 0.92, 1.0);
    
    // Combine scene with stronger water effect
    vec3 finalColor = sceneColor.rgb * waterColor;
    finalColor += vec3(1.0) * spec * 0.8;
    
    // Add stronger wave brightness variation
    finalColor += (data.x * 0.15);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`

// Create shader materials
const BufferMaterial = shaderMaterial(
    {
        uPreviousTexture: null,
        uResolution: new THREE.Vector2(),
        uMouse: new THREE.Vector2(),
        uMouseDown: 0,
        uTime: 0,
        uDelta: 1.0
    },
    bufferVertexShader,
    bufferFragmentShader
)

const DisplayMaterial = shaderMaterial(
    {
        uBufferTexture: null,
        uSceneTexture: null,
        uResolution: new THREE.Vector2(),
        uTime: 0
    },
    displayVertexShader,
    displayFragmentShader
)

extend({ BufferMaterial, DisplayMaterial })

export default function WaterOverlay() {
    const { gl, size, camera, scene } = useThree()
    const meshRef = useRef()
    const bufferMaterialRef = useRef()
    const displayMaterialRef = useRef()
    
    // Mouse state
    const mouse = useRef(new THREE.Vector2())
    const mouseDown = useRef(false)
    
    // Create render targets for ping-pong buffer
    const renderTargets = useMemo(() => {
        const options = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        }
        
        return {
            read: new THREE.WebGLRenderTarget(size.width, size.height, options),
            write: new THREE.WebGLRenderTarget(size.width, size.height, options),
            scene: new THREE.WebGLRenderTarget(size.width, size.height, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            })
        }
    }, [size])
    
    // Buffer scene for wave simulation
    const bufferScene = useMemo(() => {
        const scene = new THREE.Scene()
        const geometry = new THREE.PlaneGeometry(2, 2)
        const mesh = new THREE.Mesh(geometry)
        scene.add(mesh)
        return { scene, mesh }
    }, [])
    
    // Orthographic camera for buffer rendering
    const bufferCamera = useMemo(() => {
        return new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    }, [])
    
    // Update render target sizes on resize
    useEffect(() => {
        renderTargets.read.setSize(size.width, size.height)
        renderTargets.write.setSize(size.width, size.height)
        renderTargets.scene.setSize(size.width, size.height)
    }, [size, renderTargets])
    
    // Mouse event handlers - use passive listeners to avoid conflicts
    useEffect(() => {
        const handleMouseMove = (e) => {
            mouse.current.x = e.clientX / window.innerWidth
            mouse.current.y = 1.0 - (e.clientY / window.innerHeight)
        }
        
        const handleMouseDown = (e) => {
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
        
        // Use passive listeners to avoid interference
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
        // Limit delta to prevent instability
        const clampedDelta = Math.min(delta * 60, 1.4)
        
        // Store current render target
        const currentRenderTarget = gl.getRenderTarget()
        
        // ALWAYS update water simulation first, regardless of scene state
        if (bufferMaterialRef.current) {
            bufferMaterialRef.current.uniforms.uPreviousTexture.value = renderTargets.read.texture
            bufferMaterialRef.current.uniforms.uResolution.value.set(size.width, size.height)
            bufferMaterialRef.current.uniforms.uMouse.value.copy(mouse.current)
            bufferMaterialRef.current.uniforms.uMouseDown.value = mouseDown.current ? 1.0 : 0.0
            bufferMaterialRef.current.uniforms.uTime.value = state.clock.elapsedTime
            bufferMaterialRef.current.uniforms.uDelta.value = clampedDelta
        }
        
        // Apply buffer material to buffer mesh
        bufferScene.mesh.material = bufferMaterialRef.current
        
        // ALWAYS render wave simulation - this must never stop
        gl.setRenderTarget(renderTargets.write)
        gl.clear()
        gl.render(bufferScene.scene, bufferCamera)
        
        // Swap buffers for next frame
        const temp = renderTargets.read
        renderTargets.read = renderTargets.write
        renderTargets.write = temp
        
        // Capture scene without water mesh interference
        if (meshRef.current) {
            // Completely remove water mesh from scene during capture
            const waterMesh = meshRef.current
            const parent = waterMesh.parent
            if (parent) {
                parent.remove(waterMesh)
            }
            
            // Capture the current scene (without water effect)
            gl.setRenderTarget(renderTargets.scene)
            gl.clear(new THREE.Color(1, 1, 1))
            gl.render(state.scene, camera)
            
            // Add water mesh back to scene
            if (parent) {
                parent.add(waterMesh)
            }
        }
        
        // Update display material uniforms
        if (displayMaterialRef.current) {
            displayMaterialRef.current.uniforms.uBufferTexture.value = renderTargets.read.texture
            displayMaterialRef.current.uniforms.uSceneTexture.value = renderTargets.scene.texture
            displayMaterialRef.current.uniforms.uResolution.value.set(size.width, size.height)
            displayMaterialRef.current.uniforms.uTime.value = state.clock.elapsedTime
        }
        
        // Restore render target
        gl.setRenderTarget(currentRenderTarget)
    })
    
    // Create a fullscreen quad
    const screenQuad = useMemo(() => {
        const geometry = new THREE.PlaneGeometry(2, 2)
        return geometry
    }, [])
    
    return (
        <>
            <bufferMaterial ref={bufferMaterialRef} />
            {/* Render as fullscreen post-processing effect */}
            <mesh 
                ref={meshRef} 
                geometry={screenQuad}
                position={[0, 0, 5]}
                frustumCulled={false}
                renderOrder={999}
                raycast={() => null}
            >
                <displayMaterial 
                    ref={displayMaterialRef} 
                    transparent={true}
                    opacity={0.8}
                    depthTest={false}
                    depthWrite={false}
                />
            </mesh>
        </>
    )
}