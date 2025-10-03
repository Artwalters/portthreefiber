import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const UPDATE_INTERVAL = 1 / 60

// Import Flow modifier (you might need to install this or include the files)
// import { Flow } from 'three/addons/modifiers/CurveModifier.js'

export default function RotatingDragon() {
    const flowRef = useRef()

    // Configurable curve width based on screen size
    const curveWidthScale = useMemo(() => {
        const screenWidth = window.innerWidth
        if (screenWidth > 1920) return 1.65 // Extra large screens
        if (screenWidth > 1440) return 1.2 // Large screens
        if (screenWidth <= 768) return 0.7 // Mobile = smaller/narrower
        return 1.0 // Default for normal screens
    }, [])

    // Configurable curve height scale - taller on mobile, lower on large screens
    const curveHeightScale = useMemo(() => {
        const screenWidth = window.innerWidth
        if (screenWidth > 1920) return 0.5 // Extra large screens = much lower
        if (screenWidth > 1440) return 0.7 // Large screens = somewhat lower
        if (screenWidth <= 768) return 1.6 // Mobile = much taller/more stretched vertically
        return 1.0 // Default for normal screens
    }, [])

    // Vertical offset - move curves down on mobile so start/end points are off-screen
    const curveYOffset = useMemo(() => {
        const screenWidth = window.innerWidth
        if (screenWidth <= 768) return -3.0 // Mobile = move down
        return 0.0 // Default = no offset
    }, [])

    // Animation speed - 10% faster on mobile
    const animationSpeed = useMemo(() => {
        const screenWidth = window.innerWidth
        if (screenWidth <= 768) return 0.015125 // Mobile = 10% faster (~66 seconds)
        return 0.01375 // Desktop = ~73 seconds
    }, [])

    // Debug mode - set to true to show curve lines and debug spheres
    const showDebugLines = false

    // Load the dragon GLB model
    const { scene: dragonScene } = useGLTF('./models/dragonwaltersstudio_low.glb')

    // Complete curves for each dragon (2 loops + exit)
    const dragonCurve1 = useRef(null) // Red dragon - starts left, exits right
    const dragonCurve2 = useRef(null) // Blue dragon - starts right, exits left
    const curveProgress1 = useRef(-0.15) // Individual progress for dragon 1 - starts before curve (off screen)
    const curveProgress2 = useRef(-0.15) // Individual progress for dragon 2 - starts before curve (off screen)

    const curveGeometryRef = useRef()
    const curvesInitialized = useRef(false)

    // Get swimming loop point with interweaving spiral pattern
    const getLoopPoint = (time, t, yBaseHeight = 5, spiralOffset = 0, widthScale = 1.0, heightScale = 1.0) => {
        const numCircles = 3
        const baseRadius = 8 * widthScale // BIGGER loops - more screen space, scaled by widthScale
        const zDepthOffset = -8 // Move entire loop backwards (much further back)

        // Map t (0-1) to position in the 3-circle structure
        const totalProgress = t * numCircles
        const circleIdx = Math.floor(totalProgress)
        const angleProgress = totalProgress - circleIdx

        const angle = angleProgress * Math.PI * 2

        // Smooth rotation that interpolates between circles
        const rotation = t * Math.PI * 2 * 6 // 6 full rotations over path

        // Animate radius with multiple sine waves for organic pulsing - subtle movements
        const radiusWave1 = Math.sin(time * 0.15 + t * Math.PI * 2) * 0.15
        const radiusWave2 = Math.sin(time * 0.1 - t * Math.PI * 4) * 0.1
        const radius = baseRadius + radiusWave1 + radiusWave2

        // Base circle (vertical) with animated twist - very subtle
        const twist = Math.sin(time * 0.08 + t * Math.PI * 3) * 0.05
        let x = Math.cos(angle + twist) * radius
        let y = (Math.sin(angle + twist) * radius) * heightScale // Scale vertical size
        let z = 0

        // Apply rotation around Y axis with animation - very subtle
        const rotationOffset = Math.sin(time * 0.06) * 0.08
        const cosRot = Math.cos(rotation + rotationOffset)
        const sinRot = Math.sin(rotation + rotationOffset)
        const xRotated = x * cosRot - z * sinRot
        const zRotated = x * sinRot + z * cosRot

        // Add interweaving vertical spiral - dragons weave around each other
        // Each dragon has opposite spiral direction for harmonious interweaving
        const spiralFrequency = 4 // 4 complete up-down cycles during 2 loops
        const spiralAmplitude = 2.5 * heightScale // Height variation scaled by heightScale
        const spiralPhase = t * Math.PI * 2 * spiralFrequency + spiralOffset
        const spiralY = Math.sin(spiralPhase) * spiralAmplitude

        // LARGER radius variation to keep them apart - prevent overlap
        const radiusVariation = Math.cos(spiralPhase) * 0.8
        let adjustedX = xRotated * (1 + radiusVariation * 0.25) // Increased from 0.1 to 0.25
        let adjustedY = y + yBaseHeight + spiralY
        let adjustedZ = zRotated * (1 + radiusVariation * 0.25) + zDepthOffset

        // Apply X-axis rotation to tilt loops backward (bring bottom forward, push top back)
        const tiltAngle = -Math.PI * 0.15 // Tilt backward by ~27 degrees
        const cosX = Math.cos(tiltAngle)
        const sinX = Math.sin(tiltAngle)
        const rotatedY = adjustedY * cosX - adjustedZ * sinX
        const rotatedZ = adjustedY * sinX + adjustedZ * cosX

        return new THREE.Vector3(adjustedX, rotatedY, rotatedZ)
    }

    // Create complete dragon path: just the loop, starting at the back
    const createDragonCurve = (time, direction, loopStartOffset = 0, spiralOffset = 0, yHeight = -0.5, startY = 2.5, widthScale = 1.0, heightScale = 1.0) => {
        const points = []

        // Just the loop - no separate entrance/exit, starts at back (hidden by fog)
        const loopPoints = 720 // More points for smoother animation

        for (let i = 0; i < loopPoints; i++) {
            const t = (i / loopPoints + loopStartOffset) % 1
            const point = getLoopPoint(time, t, yHeight, spiralOffset, widthScale, heightScale)
            points.push(point)
        }

        return points
    }

    // Compute stable frames with fixed up-vector to prevent dragons from flipping upside down
    const computeStableFrames = (curve, segments) => {
        const tangents = []
        const normals = []
        const binormals = []
        const upVector = new THREE.Vector3(0, 1, 0) // Fixed world up

        for (let i = 0; i <= segments; i++) {
            const t = i / segments

            // Get tangent from curve
            const tangent = curve.getTangentAt(t).normalize()
            tangents.push(tangent.clone())

            // Project upVector onto plane perpendicular to tangent to get binormal
            // binormal = upVector - (upVector · tangent) * tangent
            const tangentDotUp = tangent.dot(upVector)
            let binormal = new THREE.Vector3()
                .copy(upVector)
                .addScaledVector(tangent, -tangentDotUp)
                .normalize()

            // If tangent is parallel to up, use a fallback
            if (binormal.length() < 0.0001) {
                binormal = new THREE.Vector3(1, 0, 0)
            }

            binormals.push(binormal.clone())

            // Compute normal perpendicular to both
            const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize()
            normals.push(normal.clone())
        }

        return { tangents, normals, binormals }
    }

    // Bake curve data to DataTexture for GPU - with better mobile support
    const bakeCurveToTexture = (curveData) => {
        const cacheSize = 2000

        // Detect WebGL capabilities
        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')

        let textureType = THREE.UnsignedByteType // Safest fallback
        let useFloats = false

        if (gl) {
            console.log('[Dragon Texture] WebGL version:', gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1')

            // WebGL 2.0 check
            if (gl instanceof WebGL2RenderingContext) {
                const floatExt = gl.getExtension('EXT_color_buffer_float')
                if (floatExt) {
                    textureType = THREE.FloatType
                    useFloats = true
                    console.log('[Dragon Texture] Using FloatType (WebGL2 + EXT_color_buffer_float)')
                } else {
                    textureType = THREE.HalfFloatType
                    console.log('[Dragon Texture] Using HalfFloatType (WebGL2 without float support)')
                }
            } else {
                // WebGL 1.0 check
                const floatExt = gl.getExtension('OES_texture_float')
                const halfFloatExt = gl.getExtension('OES_texture_half_float')

                if (floatExt) {
                    textureType = THREE.FloatType
                    useFloats = true
                    console.log('[Dragon Texture] Using FloatType (WebGL1 + OES_texture_float)')
                } else if (halfFloatExt) {
                    textureType = THREE.HalfFloatType
                    console.log('[Dragon Texture] Using HalfFloatType (WebGL1 + OES_texture_half_float)')
                } else {
                    console.warn('[Dragon Texture] No float support! Using UnsignedByteType - precision may be reduced')
                }
            }
        }

        // Create data array based on type
        let data
        if (textureType === THREE.UnsignedByteType) {
            // Pack floats into bytes (0-255 range) - loses precision but works everywhere
            data = new Uint8Array(cacheSize * 4 * 4)

            for (let i = 0; i < cacheSize; i++) {
                const baseIndex = i * 4

                // Helper to pack float to byte (normalize to 0-255)
                const packFloat = (val) => Math.floor((val + 20) / 40 * 255) // Assume range -20 to +20

                // Row 0: Points
                data[baseIndex + 0] = packFloat(curveData.points[i].x)
                data[baseIndex + 1] = packFloat(curveData.points[i].y)
                data[baseIndex + 2] = packFloat(curveData.points[i].z)
                data[baseIndex + 3] = 255

                // Row 1: Tangents
                const tangentIndex = cacheSize * 4 + baseIndex
                data[tangentIndex + 0] = packFloat(curveData.tangents[i].x)
                data[tangentIndex + 1] = packFloat(curveData.tangents[i].y)
                data[tangentIndex + 2] = packFloat(curveData.tangents[i].z)
                data[tangentIndex + 3] = 255

                // Row 2: Normals (already -1 to 1, pack differently)
                const normalIndex = cacheSize * 8 + baseIndex
                data[normalIndex + 0] = Math.floor((curveData.normals[i].x + 1) / 2 * 255)
                data[normalIndex + 1] = Math.floor((curveData.normals[i].y + 1) / 2 * 255)
                data[normalIndex + 2] = Math.floor((curveData.normals[i].z + 1) / 2 * 255)
                data[normalIndex + 3] = 255

                // Row 3: Binormals
                const binormalIndex = cacheSize * 12 + baseIndex
                data[binormalIndex + 0] = Math.floor((curveData.binormals[i].x + 1) / 2 * 255)
                data[binormalIndex + 1] = Math.floor((curveData.binormals[i].y + 1) / 2 * 255)
                data[binormalIndex + 2] = Math.floor((curveData.binormals[i].z + 1) / 2 * 255)
                data[binormalIndex + 3] = 255
            }
        } else {
            // Float or HalfFloat - use Float32Array
            data = new Float32Array(cacheSize * 4 * 4)

            for (let i = 0; i < cacheSize; i++) {
                const baseIndex = i * 4

                // Row 0: Points
                data[baseIndex + 0] = curveData.points[i].x
                data[baseIndex + 1] = curveData.points[i].y
                data[baseIndex + 2] = curveData.points[i].z
                data[baseIndex + 3] = 1.0

                // Row 1: Tangents
                const tangentIndex = cacheSize * 4 + baseIndex
                data[tangentIndex + 0] = curveData.tangents[i].x
                data[tangentIndex + 1] = curveData.tangents[i].y
                data[tangentIndex + 2] = curveData.tangents[i].z
                data[tangentIndex + 3] = 1.0

                // Row 2: Normals
                const normalIndex = cacheSize * 8 + baseIndex
                data[normalIndex + 0] = curveData.normals[i].x
                data[normalIndex + 1] = curveData.normals[i].y
                data[normalIndex + 2] = curveData.normals[i].z
                data[normalIndex + 3] = 1.0

                // Row 3: Binormals
                const binormalIndex = cacheSize * 12 + baseIndex
                data[binormalIndex + 0] = curveData.binormals[i].x
                data[binormalIndex + 1] = curveData.binormals[i].y
                data[binormalIndex + 2] = curveData.binormals[i].z
                data[binormalIndex + 3] = 1.0
            }
        }

        const texture = new THREE.DataTexture(data, cacheSize, 4, THREE.RGBAFormat, textureType)
        texture.needsUpdate = true
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping

        console.log('[Dragon Texture] Created texture:', {
            type: textureType,
            width: cacheSize,
            height: 4,
            dataLength: data.length
        })

        return texture
    }

    // Initialize complete curves once
    const initializeCurves = (time) => {
        if (curvesInitialized.current) return

        console.log('Initializing complete curves...')

        // Dragon 1 (RED): Starts at BOTTOM of shape
        const points1 = createDragonCurve(time, 1, 0.90, 0, (0.0 * curveHeightScale) + curveYOffset, (2.5 * curveHeightScale) + curveYOffset, curveWidthScale, curveHeightScale)
        const curve1 = new THREE.CatmullRomCurve3(points1, false)
        curve1.curveType = 'centripetal'
        curve1.tension = 0.0

        // Dragon 2 (BLUE): Starts at TOP of shape
        const points2 = createDragonCurve(time, -1, 0.25, Math.PI, (2.0 * curveHeightScale) + curveYOffset, (0.5 * curveHeightScale) + curveYOffset, curveWidthScale, curveHeightScale)
        const curve2 = new THREE.CatmullRomCurve3(points2, false)
        curve2.curveType = 'centripetal'
        curve2.tension = 0.0

        // Cache curves
        const cacheSize = 2000

        dragonCurve1.current = {
            curve: curve1,
            points: new Array(cacheSize),
            tangents: new Array(cacheSize),
            normals: new Array(cacheSize),
            binormals: new Array(cacheSize)
        }

        dragonCurve2.current = {
            curve: curve2,
            points: new Array(cacheSize),
            tangents: new Array(cacheSize),
            normals: new Array(cacheSize),
            binormals: new Array(cacheSize)
        }

        const frames1 = computeStableFrames(curve1, cacheSize - 1)
        const frames2 = computeStableFrames(curve2, cacheSize - 1)

        for (let i = 0; i < cacheSize; i++) {
            const t = i / (cacheSize - 1)
            dragonCurve1.current.points[i] = curve1.getPointAt(t)
            dragonCurve1.current.tangents[i] = frames1.tangents[i].clone()
            dragonCurve1.current.normals[i] = frames1.normals[i].clone()
            dragonCurve1.current.binormals[i] = frames1.binormals[i].clone()

            dragonCurve2.current.points[i] = curve2.getPointAt(t)
            dragonCurve2.current.tangents[i] = frames2.tangents[i].clone()
            dragonCurve2.current.normals[i] = frames2.normals[i].clone()
            dragonCurve2.current.binormals[i] = frames2.binormals[i].clone()
        }

        // Bake curves to GPU textures
        if (flowObject && flowObject2) {
            const texture1 = bakeCurveToTexture(dragonCurve1.current)
            const texture2 = bakeCurveToTexture(dragonCurve2.current)

            flowObject.material.uniforms.uCurveTexture.value = texture1
            flowObject2.material.uniforms.uCurveTexture.value = texture2

            console.log('Curve textures baked to GPU', {
                texture1Type: texture1.type,
                texture2Type: texture2.type,
                flowObjectVisible: flowObject.visible,
                flowObject2Visible: flowObject2.visible
            })
        }

        curvesInitialized.current = true
        console.log('Curves initialized')
    }

    // Create separate line visualizations for both curves
    const curveLineObject1 = useMemo(() => {
        const geometry = new THREE.BufferGeometry()
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 }) // Red for dragon 1
        return new THREE.Line(geometry, material)
    }, [])

    const curveLineObject2 = useMemo(() => {
        const geometry = new THREE.BufferGeometry()
        const material = new THREE.LineBasicMaterial({ color: 0x0066ff }) // Blue for dragon 2
        return new THREE.Line(geometry, material)
    }, [])

    // Create debug spheres for start (green) and end (red) points
    const debugSpheres = useMemo(() => {
        const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16)

        // Curve 1 start (green) and end (red)
        const curve1Start = new THREE.Mesh(sphereGeometry, new THREE.MeshBasicMaterial({ color: 0x00ff00 }))
        const curve1End = new THREE.Mesh(sphereGeometry, new THREE.MeshBasicMaterial({ color: 0xff0000 }))

        // Curve 2 start (green) and end (red)
        const curve2Start = new THREE.Mesh(sphereGeometry, new THREE.MeshBasicMaterial({ color: 0x00ff00 }))
        const curve2End = new THREE.Mesh(sphereGeometry, new THREE.MeshBasicMaterial({ color: 0xff0000 }))

        return { curve1Start, curve1End, curve2Start, curve2End }
    }, [])

    // GPU-based deformation system - create TWO dragons with custom shader
    const { flowObject, flowObject2, originalGeometry, boundingBox, length, curveTexture1, curveTexture2 } = useMemo(() => {
        if (!dragonScene) {
            return { flowObject: null, flowObject2: null, originalGeometry: null, boundingBox: null, length: 0, curveTexture1: null, curveTexture2: null }
        }

        // Find the first dragon mesh only (prevent duplicates)
        let dragonMesh = null
        dragonScene.traverse((child) => {
            if (child.isMesh && !dragonMesh) {
                dragonMesh = child
                console.log(`Dragon model: ${dragonMesh.geometry.attributes.position.count} vertices, ~${Math.floor(dragonMesh.geometry.index ? dragonMesh.geometry.index.count / 3 : dragonMesh.geometry.attributes.position.count / 3)} triangles`)
            }
        })

        if (!dragonMesh) {
            return { flowObject: null, flowObject2: null, originalGeometry: null, boundingBox: null, length: 0, curveTexture1: null, curveTexture2: null }
        }

        // Clone and prepare geometry like in THREE.js example
        const geometry = dragonMesh.geometry.clone()

        // Scale and orient
        geometry.scale(0.56, 0.56, 0.56)
        geometry.rotateY(Math.PI) // Turn around 180 degrees to face forward
        geometry.rotateZ(Math.PI / 2) // Rotate 90 degrees (quarter turn) to swim horizontally

        // Center geometry
        geometry.computeBoundingBox()
        const box = geometry.boundingBox
        const center = box.getCenter(new THREE.Vector3())
        geometry.translate(-center.x, -center.y, -center.z)
        geometry.computeBoundingBox()

        const originalBox = geometry.boundingBox.clone()
        const length = Math.max(originalBox.max.z - originalBox.min.z, 1e-6)

        // Custom GPU shader material with curve deformation
        const createDragonMaterial = (color) => {
            return new THREE.ShaderMaterial({
                uniforms: THREE.UniformsUtils.merge([
                    THREE.UniformsLib.fog, // Add built-in fog uniforms
                    {
                        uTime: { value: 0 },
                        uCurveProgress: { value: 0 },
                        uCurveTexture: { value: null },
                        uBoundingBoxMin: { value: new THREE.Vector3(originalBox.min.x, originalBox.min.y, originalBox.min.z) },
                        uLength: { value: length },
                        uColor: { value: new THREE.Color(color) },
                        uLightPosition: { value: new THREE.Vector3(-10, 10, 10) },
                        uLightColor: { value: new THREE.Color(0xffaa33) },
                        uAmbientColor: { value: new THREE.Color(0x003973) },
                        uAmbientIntensity: { value: 0.3 }
                    }
                ]),
                fog: true, // Enable fog support
                vertexShader: `
                    uniform float uTime;
                    uniform float uCurveProgress;
                    uniform sampler2D uCurveTexture;
                    uniform vec3 uBoundingBoxMin;
                    uniform float uLength;

                    varying vec3 vNormal;
                    varying vec3 vPosition;
                    varying float vFogDepth;

                    const float CACHE_SIZE = 2000.0;
                    const float snakeWaveFrequency = 5.0;
                    const float snakeWaveAmplitude = 0.2;
                    const float snakeWaveSpeed = 3.0;

                    // Sample curve data from texture - handles both float and byte textures
                    vec4 sampleCurve(float t, int offset) {
                        float index = t * (CACHE_SIZE - 1.0);
                        float u = (index + 0.5) / CACHE_SIZE;
                        float v = (float(offset) + 0.5) / 4.0; // 4 rows: points, tangents, normals, binormals
                        vec4 data = texture2D(uCurveTexture, vec2(u, v));

                        // Check if data looks normalized (0-1 range) - indicates UnsignedByteType
                        // For positions, absolute values should be > 1 if using floats
                        if (offset == 0 && abs(data.x) < 1.5 && abs(data.y) < 1.5) {
                            // Unpack from byte range (0-255) back to float (-20 to +20 for positions)
                            if (offset == 0) {
                                // Positions
                                return vec4(
                                    data.x * 40.0 - 20.0,
                                    data.y * 40.0 - 20.0,
                                    data.z * 40.0 - 20.0,
                                    1.0
                                );
                            } else if (offset == 1) {
                                // Tangents
                                return vec4(
                                    data.x * 40.0 - 20.0,
                                    data.y * 40.0 - 20.0,
                                    data.z * 40.0 - 20.0,
                                    1.0
                                );
                            } else {
                                // Normals and binormals (-1 to 1)
                                return vec4(
                                    data.x * 2.0 - 1.0,
                                    data.y * 2.0 - 1.0,
                                    data.z * 2.0 - 1.0,
                                    1.0
                                );
                            }
                        }

                        return data;
                    }

                    void main() {
                        vec3 pos = position;

                        // Calculate normalized Z position
                        float normalizedZ = clamp((pos.z - uBoundingBoxMin.z) / uLength, 0.0, 1.0);

                        // Calculate position along curve
                        float t = uCurveProgress + normalizedZ * 0.07;
                        t = clamp(t, 0.0, 1.0);

                        // Sample curve data from texture
                        vec3 curvePoint = sampleCurve(t, 0).xyz;
                        vec3 tangent = normalize(sampleCurve(t, 1).xyz);
                        vec3 normal = normalize(sampleCurve(t, 2).xyz);
                        vec3 binormal = normalize(sampleCurve(t, 3).xyz);

                        // Apply roll variation
                        float rollFrequency = 0.5;
                        float maxRoll = 3.14159 / 4.0; // 45 degrees
                        float rollPhase = uTime * rollFrequency + t * 3.14159 * 2.0;
                        float rollAngle = sin(rollPhase) * maxRoll;

                        float cosRoll = cos(rollAngle);
                        float sinRoll = sin(rollAngle);
                        vec3 rotatedNormal = normal * cosRoll + binormal * sinRoll;
                        vec3 rotatedBinormal = -normal * sinRoll + binormal * cosRoll;

                        // Snake wave animation
                        float wave1 = sin(normalizedZ * snakeWaveFrequency + uTime * snakeWaveSpeed);
                        float wave2 = sin(normalizedZ * (snakeWaveFrequency * 1.7) - uTime * snakeWaveSpeed * 0.6);
                        float wave3 = sin(normalizedZ * (snakeWaveFrequency * 0.5) + uTime * snakeWaveSpeed * 1.3);
                        float combinedWave = (wave1 * 0.6 + wave2 * 0.25 + wave3 * 0.15) * snakeWaveAmplitude;

                        // Depth wave
                        float depthWave = cos(normalizedZ * snakeWaveFrequency * 0.7 + uTime * snakeWaveSpeed * 0.8);
                        float depthMovement = depthWave * snakeWaveAmplitude * 0.4;

                        // Amplitude variation (head subtle, tail moves more)
                        float amplitudeVariation = 0.3 + (1.0 - normalizedZ) * 2.2;

                        // Vertex random - use position hash instead of gl_VertexID for WebGL 1.0 compatibility
                        float vertexRandom = sin((pos.x + pos.y + pos.z) * 100.0) * 0.05;

                        // Build final position
                        vec3 newPosition = curvePoint;
                        newPosition += rotatedNormal * ((pos.x * 0.8) + (combinedWave * amplitudeVariation) + vertexRandom);
                        newPosition += rotatedBinormal * (-pos.y * 0.8);
                        newPosition += tangent * (depthMovement * amplitudeVariation);

                        // Calculate deformed normal for lighting
                        vec3 deformedNormal = normalize(rotatedNormal);

                        vNormal = normalMatrix * deformedNormal;
                        vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
                        vPosition = mvPosition.xyz;
                        vFogDepth = -mvPosition.z; // Fog depth for linear fog

                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    uniform vec3 uLightPosition;
                    uniform vec3 uLightColor;
                    uniform vec3 uAmbientColor;
                    uniform float uAmbientIntensity;
                    uniform vec3 fogColor;
                    uniform float fogNear;
                    uniform float fogFar;

                    varying vec3 vNormal;
                    varying vec3 vPosition;
                    varying float vFogDepth;

                    void main() {
                        vec3 normal = normalize(vNormal);
                        vec3 lightDir = normalize(uLightPosition - vPosition);

                        // Diffuse lighting
                        float diff = max(dot(normal, lightDir), 0.0);
                        vec3 diffuse = diff * uLightColor;

                        // Ambient
                        vec3 ambient = uAmbientColor * uAmbientIntensity;

                        // Final color
                        vec3 finalColor = uColor * (ambient + diffuse);

                        // Apply fog
                        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
                        finalColor = mix(finalColor, fogColor, fogFactor);

                        gl_FragColor = vec4(finalColor, 1.0);
                    }
                `,
                side: THREE.DoubleSide,
                transparent: false,
                depthWrite: true,
                depthTest: true
            })
        }

        const materialRed = createDragonMaterial(0xff0000)
        const materialBlue = createDragonMaterial(0x0066ff)

        console.log('[Dragon Init] Materials created')

        // Create geometries - shared geometry, different materials
        const flowGeometry1 = geometry.clone()
        const flowGeometry2 = geometry.clone()

        const flowObject = new THREE.Mesh(flowGeometry1, materialRed)
        const flowObject2 = new THREE.Mesh(flowGeometry2, materialBlue)

        console.log('[Dragon Init] Meshes created:', {
            vertices: flowGeometry1.attributes.position.count,
            flowObject: flowObject,
            flowObject2: flowObject2,
            visible: flowObject.visible && flowObject2.visible
        })

        return {
            flowObject,
            flowObject2,
            originalGeometry: geometry,
            boundingBox: originalBox,
            length,
            curveTexture1: null, // Will be set after curves are initialized
            curveTexture2: null
        }
    }, [dragonScene])

    // GPU deformation - no worker needed anymore

    const frameCount = useRef(0)

    useFrame(({ clock }, delta) => {
        const time = clock.getElapsedTime()
        frameCount.current++

        if (!flowObject || !flowObject2) {
            if (frameCount.current === 1) {
                console.log('[Dragon Frame] No flowObjects yet')
            }
            return
        }

        // Initialize curves on first frame
        initializeCurves(time)

        if (!dragonCurve1.current || !dragonCurve2.current) {
            if (frameCount.current < 5) {
                console.log('[Dragon Frame] Waiting for curves to initialize...', frameCount.current)
            }
            return
        }

        // Debug log first few frames
        if (frameCount.current <= 3) {
            console.log('[Dragon Frame]', frameCount.current, {
                time,
                progress1: curveProgress1.current,
                progress2: curveProgress2.current,
                hasTexture1: !!flowObject.material.uniforms.uCurveTexture.value,
                hasTexture2: !!flowObject2.material.uniforms.uCurveTexture.value,
                visible1: flowObject.visible,
                visible2: flowObject2.visible
            })
        }

        // Update curve visualizations (debug only)
        if (showDebugLines && dragonCurve1.current && curveLineObject1.geometry) {
            const points = dragonCurve1.current.curve.getPoints(500)
            curveLineObject1.geometry.setFromPoints(points)
            curveLineObject1.geometry.attributes.position.needsUpdate = true

            if (points.length > 0) {
                debugSpheres.curve1Start.position.copy(points[0])
                debugSpheres.curve1End.position.copy(points[points.length - 1])
            }
        }
        if (showDebugLines && dragonCurve2.current && curveLineObject2.geometry) {
            const points = dragonCurve2.current.curve.getPoints(500)
            curveLineObject2.geometry.setFromPoints(points)
            curveLineObject2.geometry.attributes.position.needsUpdate = true

            if (points.length > 0) {
                debugSpheres.curve2Start.position.copy(points[0])
                debugSpheres.curve2End.position.copy(points[points.length - 1])
            }
        }

        // Update progress for both dragons
        curveProgress1.current += animationSpeed * delta
        curveProgress2.current += animationSpeed * delta

        // Reset to start when dragons reach the end for infinite loop
        if (curveProgress1.current > 1.0) {
            curveProgress1.current = -0.15
        }
        if (curveProgress2.current > 1.0) {
            curveProgress2.current = -0.15
        }

        // GPU DEFORMATION - Only update shader uniforms (no CPU work!)
        if (flowObject.material && flowObject.material.uniforms) {
            flowObject.material.uniforms.uTime.value = time
            flowObject.material.uniforms.uCurveProgress.value = curveProgress1.current
        }

        if (flowObject2.material && flowObject2.material.uniforms) {
            flowObject2.material.uniforms.uTime.value = time
            flowObject2.material.uniforms.uCurveProgress.value = curveProgress2.current
        }
    })

    return (
        <>
            {/* Curve visualizations - RED for dragon 1, BLUE for dragon 2 (only shown in debug mode) */}
            {showDebugLines && (
                <>
                    <primitive object={curveLineObject1} />
                    <primitive object={curveLineObject2} />

                    {/* Debug spheres - GREEN = start, RED = end */}
                    <primitive object={debugSpheres.curve1Start} />
                    <primitive object={debugSpheres.curve1End} />
                    <primitive object={debugSpheres.curve2Start} />
                    <primitive object={debugSpheres.curve2End} />
                </>
            )}

            {/* Flow Objects - two dragons with curve deformation */}
            {flowObject && <primitive object={flowObject} ref={flowRef} />}
            {flowObject2 && <primitive object={flowObject2} />}

            {/* Lighting setup like in example */}
            <directionalLight position={[-10, 10, 10]} intensity={1} color={0xffaa33} />
            <ambientLight intensity={0.3} color={0x003973} />
        </>
    )
}

