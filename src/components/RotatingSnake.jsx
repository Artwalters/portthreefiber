import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const UPDATE_INTERVAL = 1 / 60

// Import Flow modifier (you might need to install this or include the files)
// import { Flow } from 'three/addons/modifiers/CurveModifier.js'

export default function RotatingSnake() {
    const flowRef = useRef()
    const curveProgress = useRef(0)

    // Load the dragon GLB model
    const { scene: dragonScene } = useGLTF('./models/dragon basev.glb')

    // Create 3 distinct circles overlapping, each rotated, with seamless connection
    const { curve, curveCache } = useMemo(() => {
        const points = []
        const numPointsPerCircle = 120
        const radius = 5
        const numCircles = 3

        // Create 3 circles with smooth interpolated rotation between them
        for (let circleIdx = 0; circleIdx < numCircles; circleIdx++) {
            for (let i = 0; i < numPointsPerCircle; i++) {
                const angle = (i / numPointsPerCircle) * Math.PI * 2

                // Smooth rotation that interpolates between circles
                const circleProgress = (circleIdx + (i / numPointsPerCircle)) / numCircles
                const rotation = circleProgress * Math.PI * 2 // Full rotation over 3 circles for seamless loop

                // Base circle (vertical)
                let x = Math.cos(angle) * radius
                let y = Math.sin(angle) * radius
                let z = 0

                // Apply rotation around Y axis
                const cosRot = Math.cos(rotation)
                const sinRot = Math.sin(rotation)
                const xRotated = x * cosRot - z * sinRot
                const zRotated = x * sinRot + z * cosRot

                points.push(new THREE.Vector3(xRotated, y, zRotated))
            }
        }

        const curve = new THREE.CatmullRomCurve3(points, true) // Closed for seamless loop
        curve.curveType = 'centripetal'
        curve.tension = 0.0

        // OPTIMIZATION 1: Pre-compute curve lookup table + Frenet frames
        const cacheSize = 2000 // Higher resolution cache for smoother deformation
        const curveCache = {
            points: new Array(cacheSize),
            tangents: new Array(cacheSize),
            normals: new Array(cacheSize),
            binormals: new Array(cacheSize)
        }

        const frames = curve.computeFrenetFrames(cacheSize - 1, true)

        for (let i = 0; i < cacheSize; i++) {
            const t = i / (cacheSize - 1)
            curveCache.points[i] = curve.getPointAt(t, new THREE.Vector3())
            curveCache.tangents[i] = frames.tangents[i].clone()
            curveCache.normals[i] = frames.normals[i].clone()
            curveCache.binormals[i] = frames.binormals[i].clone()
        }

        return { curve, curveCache }
    }, [])

    // Simple Flow-like system based on THREE.js example - create TWO dragons
    const { flowObject, flowObject2, originalGeometry, boundingBox, length } = useMemo(() => {
        if (!dragonScene) {
            return { flowObject: null, flowObject2: null, originalGeometry: null, boundingBox: null, length: 0 }
        }

        // Find the first dragon mesh only (prevent duplicates)
        let dragonMesh = null
        dragonScene.traverse((child) => {
            if (child.isMesh && !dragonMesh) {
                dragonMesh = child
            }
        })

        if (!dragonMesh) {
            return { flowObject: null, flowObject2: null, originalGeometry: null, boundingBox: null, length: 0 }
        }

        // Clone and prepare geometry like in THREE.js example
        const geometry = dragonMesh.geometry.clone()

        // Red material for first dragon
        const materialRed = new THREE.MeshStandardMaterial({
            color: 0xff0000, // Red color
            roughness: 0.7,
            metalness: 0.1,
            side: THREE.DoubleSide,
            transparent: false,
            opacity: 1.0,
            depthWrite: true,
            depthTest: true
        })

        // Blue material for second dragon
        const materialBlue = new THREE.MeshStandardMaterial({
            color: 0x0066ff, // Blue color
            roughness: 0.7,
            metalness: 0.1,
            side: THREE.DoubleSide,
            transparent: false,
            opacity: 1.0,
            depthWrite: true,
            depthTest: true
        })

        // Scale and orient
        geometry.scale(0.56, 0.56, 0.56)
        geometry.rotateY(Math.PI) // Turn around 180 degrees to face forward

        // Center geometry
        geometry.computeBoundingBox()
        const box = geometry.boundingBox
        const center = box.getCenter(new THREE.Vector3())
        geometry.translate(-center.x, -center.y, -center.z)
        geometry.computeBoundingBox()

        const flowObject = new THREE.Mesh(geometry.clone(), materialRed)
        const flowObject2 = new THREE.Mesh(geometry.clone(), materialBlue)

        const originalGeometry = geometry.clone()
        originalGeometry.computeBoundingBox()
        const originalBox = originalGeometry.boundingBox.clone()
        const length = Math.max(originalBox.max.z - originalBox.min.z, 1e-6)

        return {
            flowObject,
            flowObject2,
            originalGeometry,
            boundingBox: originalBox,
            length
        }
    }, [dragonScene])

    const workerRef = useRef(null)
    const pendingUpdate = useRef(false)
    const updateQueue = useRef([])
    const lastUpdateTime = useRef(0)
    const scratchVectors = useMemo(() => ({
        binormal: new THREE.Vector3(),
        normal: new THREE.Vector3(),
        newPosition: new THREE.Vector3()
    }), [])

    // 🚀 OPTIMIZATION 3: Initialize WebWorker
    useMemo(() => {
        if (typeof Worker !== 'undefined') {
            workerRef.current = new Worker('/deformationWorker.js')
            workerRef.current.onmessage = (e) => {
                const { newPositions } = e.data
                updateQueue.current.push(newPositions)
                pendingUpdate.current = false
            }
        }
    }, [])

    useFrame(({ clock }) => {
        curveProgress.current = (curveProgress.current + 0.0005) % 1

        const time = clock.getElapsedTime()

        if (!flowObject || !flowObject2 || !originalGeometry || !boundingBox || length <= 0) {
            return
        }

        if (time - lastUpdateTime.current < UPDATE_INTERVAL) {
            return
        }

        lastUpdateTime.current = time

        // Update both dragons - second dragon has offset on curve
        const dragons = [
            { mesh: flowObject, offset: 0 },
            { mesh: flowObject2, offset: 0.5 } // Half curve offset - swimming through each other
        ]

        dragons.forEach(({ mesh, offset }) => {
            if (!pendingUpdate.current) {
                if (false && workerRef.current && typeof Worker !== 'undefined') {
                console.log('Using WebWorker for deformation')
                pendingUpdate.current = true
                workerRef.current.postMessage({
                    originalPositions: originalGeometry.attributes.position.array,
                    curveCache: {
                        points: curveCache.points.map(p => ({ x: p.x, y: p.y, z: p.z })),
                        tangents: curveCache.tangents.map(t => ({ x: t.x, y: t.y, z: t.z })),
                        normals: curveCache.normals.map(n => ({ x: n.x, y: n.y, z: n.z })),
                        binormals: curveCache.binormals.map(b => ({ x: b.x, y: b.y, z: b.z }))
                    },
                    curveProgress: curveProgress.current,
                    time,
                    boundingBox: {
                        min: { x: boundingBox.min.x, y: boundingBox.min.y, z: boundingBox.min.z },
                        max: { x: boundingBox.max.x, y: boundingBox.max.y, z: boundingBox.max.z }
                    },
                    length
                })
            } else {
                const positionAttribute = mesh.geometry.attributes.position
                const originalPositions = originalGeometry.attributes.position
                const originalArray = originalPositions.array
                const count = positionAttribute.count

                const cacheSize = curveCache.points.length
                const minZ = boundingBox.min.z
                const lengthValue = length

                const snakeWaveFrequency = 8
                const snakeWaveAmplitude = 0.35
                const snakeWaveSpeed = 4.5

                const { binormal, normal, newPosition } = scratchVectors

                for (let i = 0; i < count; i++) {
                    const baseIndex = i * 3
                    const ox = originalArray[baseIndex]
                    const oy = originalArray[baseIndex + 1]
                    const oz = originalArray[baseIndex + 2]

                    const normalizedZ = THREE.MathUtils.clamp((oz - minZ) / lengthValue, 0, 1)
                    // Balance between spread and straightness for natural swimming
                    // Add offset for second dragon - reduced for 3x longer curve
                    let t = (curveProgress.current + offset + normalizedZ * 0.15) % 1
                    if (t < 0) t += 1

                    const rawIndex = t * (cacheSize - 1)
                    const index = Math.floor(rawIndex)
                    const nextIndex = (index + 1) % cacheSize
                    const lerpFactor = rawIndex - index

                    // Get position on curve
                    const curvePoint = curveCache.points[index].clone().lerp(curveCache.points[nextIndex], lerpFactor)

                    // Scale position towards center for red dragon (offset 0)
                    const radiusScale = offset === 0 ? 0.85 : 1.0 // Red dragon swims 15% closer to center
                    newPosition.copy(curvePoint).multiplyScalar(radiusScale)
                    binormal.copy(curveCache.binormals[index]).lerp(curveCache.binormals[nextIndex], lerpFactor).normalize()
                    normal.copy(curveCache.normals[index]).lerp(curveCache.normals[nextIndex], lerpFactor).normalize()

                    // Multiple waves with different frequencies for natural variation
                    const wave1 = Math.sin(normalizedZ * snakeWaveFrequency + time * snakeWaveSpeed)
                    const wave2 = Math.sin(normalizedZ * (snakeWaveFrequency * 1.7) - time * snakeWaveSpeed * 0.6)
                    const wave3 = Math.sin(normalizedZ * (snakeWaveFrequency * 0.5) + time * snakeWaveSpeed * 1.3)

                    // Combine waves with different weights for organic movement
                    const combinedWave = (wave1 * 0.6 + wave2 * 0.25 + wave3 * 0.15) * snakeWaveAmplitude

                    // Add depth movement - forward/backward oscillation
                    const depthWave = Math.cos(normalizedZ * snakeWaveFrequency * 0.7 + time * snakeWaveSpeed * 0.8)
                    const depthMovement = depthWave * snakeWaveAmplitude * 0.4 // Less intense than lateral

                    // Add slight randomness that varies per vertex but stays consistent
                    const vertexRandom = Math.sin(i * 0.01) * 0.05

                    // More natural: head moves subtly (0.3), tail moves a lot (2.5)
                    const amplitudeVariation = 0.3 + (1.0 - normalizedZ) * 2.2

                    // Get tangent direction for depth movement
                    const tangent = curveCache.tangents[index].clone().lerp(curveCache.tangents[nextIndex], lerpFactor).normalize()

                    // Rotate dragon 90 degrees by swapping normal/binormal and adjusting signs
                    newPosition.addScaledVector(normal, (ox * 0.8) + (combinedWave * amplitudeVariation) + vertexRandom)
                    newPosition.addScaledVector(binormal, -oy * 0.8)
                    // Add forward/backward depth movement along tangent
                    newPosition.addScaledVector(tangent, depthMovement * amplitudeVariation)

                    positionAttribute.setXYZ(i, newPosition.x, newPosition.y, newPosition.z)
                }

                positionAttribute.needsUpdate = true
                mesh.geometry.computeVertexNormals()
            }
        }
        })  // End forEach

        if (false && updateQueue.current.length > 0 && flowObject) {
            console.log('Processing WebWorker update from queue')
            const newPositions = updateQueue.current.shift()
            const positionAttribute = flowObject.geometry.attributes.position

            positionAttribute.array.set(newPositions)
            positionAttribute.needsUpdate = true

            flowObject.geometry.computeVertexNormals()
        }
    })

    return (
        <>
            {/* Curve visualization - like the green line in the example */}
            <primitive
                object={new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints(curve.getPoints(500)), // Ultra high resolution
                    new THREE.LineBasicMaterial({ color: 0x00ff00 }) // Green like example
                )}
            />

            {/* Flow Objects - two dragons with curve deformation */}
            {flowObject && <primitive object={flowObject} ref={flowRef} />}
            {flowObject2 && <primitive object={flowObject2} />}

            {/* Lighting setup like in example */}
            <directionalLight position={[-10, 10, 10]} intensity={1} color={0xffaa33} />
            <ambientLight intensity={0.3} color={0x003973} />
        </>
    )
}

