import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import InstancedDragons from './InstancedDragons.jsx'

// Import Flow modifier (you might need to install this or include the files)
// import { Flow } from 'three/addons/modifiers/CurveModifier.js'

export default function RotatingSnake({ useInstanced = false, instanceCount = 3 }) {
    const groupRef = useRef()
    const flowRef = useRef()
    const curveProgress = useRef(0)

    // Load the dragon GLB model
    const { scene: dragonScene } = useGLTF('./models/dragon basev.glb')

    // Create a smooth, simple curve with high resolution + CACHED LOOKUP
    const { curve, curveCache } = useMemo(() => {
        const points = []
        const numPoints = 16 // More points but simpler shape
        const radius = 3

        // Create a simple but smooth 3D curve - no random variations
        for (let i = 0; i < numPoints; i++) {
            const t = (i / numPoints) * Math.PI * 2 // One full rotation
            const x = Math.cos(t) * radius
            const y = Math.sin(t * 2) * 1.5 // Gentle up-down motion
            const z = Math.sin(t) * radius

            points.push(new THREE.Vector3(x, y, z))
        }

        const curve = new THREE.CatmullRomCurve3(points, true) // closed curve
        curve.curveType = 'centripetal' // Like in the example

        // 🚀 OPTIMIZATION 1: Pre-compute curve lookup table
        const cacheSize = 1000 // High resolution cache
        const curveCache = {
            points: [],
            tangents: []
        }

        for (let i = 0; i < cacheSize; i++) {
            const t = i / (cacheSize - 1)
            curveCache.points[i] = curve.getPointAt(t)
            curveCache.tangents[i] = curve.getTangentAt(t).normalize()
        }

        return { curve, curveCache }
    }, [])

    // Simple Flow-like system based on THREE.js example
    const { flowObject, originalGeometry } = useMemo(() => {
        if (!dragonScene) return { flowObject: null, originalGeometry: null }

        // Find the dragon mesh
        let dragonMesh = null
        dragonScene.traverse((child) => {
            if (child.isMesh) {
                dragonMesh = child
            }
        })

        if (!dragonMesh) return { flowObject: null, originalGeometry: null }

        // Clone and prepare geometry like in THREE.js example
        const geometry = dragonMesh.geometry.clone()
        const material = dragonMesh.material.clone()

        // Scale and orient
        geometry.scale(0.1, 0.1, 0.1)
        geometry.rotateY(Math.PI) // Turn around 180 degrees to face forward

        // Center geometry
        geometry.computeBoundingBox()
        const box = geometry.boundingBox
        const center = box.getCenter(new THREE.Vector3())
        geometry.translate(-center.x, -center.y, -center.z)

        // Create the flow object (like objectToCurve in example)
        const flowObject = new THREE.Mesh(geometry, material)

        return {
            flowObject,
            originalGeometry: geometry.clone()
        }
    }, [dragonScene])

    const snakeProgress = useRef(0)
    const workerRef = useRef(null)
    const pendingUpdate = useRef(false)
    const updateQueue = useRef([])
    const lastUpdateTime = useRef(0)

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
        // Even slower movement along curve for very relaxed animation
        curveProgress.current += 0.0005

        const time = clock.getElapsedTime()

        // 🚀 OPTIMIZATION 2 + 3: Batched Updates + WebWorker with Fallback
        if (Math.floor(time * 60) % 1 === 0 && flowObject && originalGeometry && !pendingUpdate.current) {
            // Get geometry bounds for normalization
            originalGeometry.computeBoundingBox()
            const box = originalGeometry.boundingBox
            const length = box.max.z - box.min.z

            if (false && workerRef.current && typeof Worker !== 'undefined') {
                // Send work to WebWorker
                console.log('Using WebWorker for deformation')
                pendingUpdate.current = true
                workerRef.current.postMessage({
                    originalPositions: originalGeometry.attributes.position.array,
                    curveCache: {
                        points: curveCache.points.map(p => ({ x: p.x, y: p.y, z: p.z })),
                        tangents: curveCache.tangents.map(t => ({ x: t.x, y: t.y, z: t.z }))
                    },
                    curveProgress: curveProgress.current,
                    time: time,
                    boundingBox: {
                        min: { x: box.min.x, y: box.min.y, z: box.min.z },
                        max: { x: box.max.x, y: box.max.y, z: box.max.z }
                    },
                    length: length
                })
            } else {
                // Fallback to main thread processing
                const positionAttribute = flowObject.geometry.attributes.position
                const originalPositions = originalGeometry.attributes.position

                for (let i = 0; i < positionAttribute.count; i++) {
                    const originalPoint = new THREE.Vector3(
                        originalPositions.getX(i),
                        originalPositions.getY(i),
                        originalPositions.getZ(i)
                    )

                    const normalizedZ = (originalPoint.z - box.min.z) / length
                    let t = (curveProgress.current + normalizedZ * 0.15) % 1

                    // Use cached curve data
                    const cacheIndex = Math.floor(t * (curveCache.points.length - 1))
                    const curvePoint = curveCache.points[cacheIndex]
                    const tangent = curveCache.tangents[cacheIndex]

                    // Create coordinate system
                    const normal = new THREE.Vector3(0, 1, 0)
                    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize()
                    normal.crossVectors(binormal, tangent).normalize()

                    // Snake zigzag movement
                    const snakeWaveFrequency = 10
                    const snakeWaveAmplitude = 0.15
                    const snakeWaveSpeed = 4.5

                    const wavePhase = normalizedZ * snakeWaveFrequency + time * snakeWaveSpeed
                    const sideOffset = Math.sin(wavePhase) * snakeWaveAmplitude
                    const amplitudeVariation = 0.05 + 0.8 * Math.sin(normalizedZ * Math.PI)

                    const newPosition = curvePoint.clone()
                    newPosition.addScaledVector(binormal, (originalPoint.x * 0.8) + (sideOffset * amplitudeVariation))
                    newPosition.addScaledVector(normal, originalPoint.y * 0.8)

                    positionAttribute.setXYZ(i, newPosition.x, newPosition.y, newPosition.z)
                }

                positionAttribute.needsUpdate = true
                flowObject.geometry.computeVertexNormals()
            }
        }

        // 🚀 OPTIMIZATION 2: Process batched updates from WebWorker - DISABLED
        if (false && updateQueue.current.length > 0 && flowObject) {
            console.log('Processing WebWorker update from queue')
            const newPositions = updateQueue.current.shift()
            const positionAttribute = flowObject.geometry.attributes.position

            // Batch update all vertices at once
            positionAttribute.array.set(newPositions)
            positionAttribute.needsUpdate = true

            // Only compute normals when needed
            flowObject.geometry.computeVertexNormals()
        }
    })

    return (
        <>
            {/* Curve visualization - like the green line in the example */}
            <primitive
                object={new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints(curve.getPoints(200)), // Much higher resolution
                    new THREE.LineBasicMaterial({ color: 0x00ff00 }) // Green like example
                )}
            />

            {/* 🚀 OPTIMIZATION 4: Choose between single dragon with deformation or multiple instanced dragons */}
            {useInstanced ? (
                <InstancedDragons count={instanceCount} />
            ) : (
                /* Flow Object - like scene.add(flow.object3D) in example */
                flowObject && <primitive object={flowObject} ref={flowRef} />
            )}

            {/* Lighting setup like in example */}
            <directionalLight position={[-10, 10, 10]} intensity={1} color={0xffaa33} />
            <ambientLight intensity={0.3} color={0x003973} />
        </>
    )
}