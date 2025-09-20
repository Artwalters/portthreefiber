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

    // Create a complex, smooth curve with multiple loops + CACHED LOOKUP
    const { curve, curveCache } = useMemo(() => {
        const points = []
        const numPoints = 48 // Even more points for smoother complex curve
        const baseRadius = 4

        // Create a complex 3D curve with multiple rotations and very smooth transitions
        for (let i = 0; i < numPoints; i++) {
            const t = (i / numPoints) * Math.PI * 6 // Three full rotations instead of one

            // Very gentle radius variation for ultra-smooth curves
            const radiusVariation = 1 + Math.sin(t * 0.2) * 0.15 // Even gentler variation
            const radius = baseRadius * radiusVariation

            // Main circular motion with variations
            const x = Math.cos(t) * radius
            const z = Math.sin(t) * radius

            // Ultra-smooth vertical motion - very gentle waves
            const y = Math.sin(t * 0.5) * 1.2 + Math.cos(t * 0.15) * 0.4

            points.push(new THREE.Vector3(x, y, z))
        }

        const curve = new THREE.CatmullRomCurve3(points, true) // closed curve
        curve.curveType = 'catmullrom' // Smoother curves
        curve.tension = 0.1 // Much lower tension for very smooth curves

        // OPTIMIZATION 1: Pre-compute curve lookup table + Frenet frames
        const cacheSize = 1000 // High resolution cache
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

    // Simple Flow-like system based on THREE.js example
    const { flowObject, originalGeometry, boundingBox, length } = useMemo(() => {
        if (!dragonScene) {
            return { flowObject: null, originalGeometry: null, boundingBox: null, length: 0 }
        }

        // Find the first dragon mesh only (prevent duplicates)
        let dragonMesh = null
        dragonScene.traverse((child) => {
            if (child.isMesh && !dragonMesh) {
                dragonMesh = child
            }
        })

        if (!dragonMesh) {
            return { flowObject: null, originalGeometry: null, boundingBox: null, length: 0 }
        }

        // Clone and prepare geometry like in THREE.js example
        const geometry = dragonMesh.geometry.clone()
        const material = dragonMesh.material.clone()

        // Scale and orient
        geometry.scale(0.56, 0.56, 0.56)
        geometry.rotateY(Math.PI) // Turn around 180 degrees to face forward

        // Center geometry
        geometry.computeBoundingBox()
        const box = geometry.boundingBox
        const center = box.getCenter(new THREE.Vector3())
        geometry.translate(-center.x, -center.y, -center.z)
        geometry.computeBoundingBox()
        const flowObject = new THREE.Mesh(geometry, material)
        const originalGeometry = geometry.clone()
        originalGeometry.computeBoundingBox()
        const originalBox = originalGeometry.boundingBox.clone()
        const length = Math.max(originalBox.max.z - originalBox.min.z, 1e-6)

        return {
            flowObject,
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
        curveProgress.current = (curveProgress.current + 0.0002) % 1

        const time = clock.getElapsedTime()

        if (!flowObject || !originalGeometry || !boundingBox || length <= 0) {
            return
        }

        if (time - lastUpdateTime.current < UPDATE_INTERVAL) {
            return
        }

        lastUpdateTime.current = time

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
                const positionAttribute = flowObject.geometry.attributes.position
                const originalPositions = originalGeometry.attributes.position
                const originalArray = originalPositions.array
                const count = positionAttribute.count

                const cacheSize = curveCache.points.length
                const minZ = boundingBox.min.z
                const lengthValue = length

                const snakeWaveFrequency = 15
                const snakeWaveAmplitude = 0.25
                const snakeWaveSpeed = 6.0

                const { binormal, normal, newPosition } = scratchVectors

                for (let i = 0; i < count; i++) {
                    const baseIndex = i * 3
                    const ox = originalArray[baseIndex]
                    const oy = originalArray[baseIndex + 1]
                    const oz = originalArray[baseIndex + 2]

                    const normalizedZ = THREE.MathUtils.clamp((oz - minZ) / lengthValue, 0, 1)
                    let t = (curveProgress.current + normalizedZ * 0.25) % 1
                    if (t < 0) t += 1

                    const rawIndex = t * (cacheSize - 1)
                    const index = Math.floor(rawIndex)
                    const nextIndex = (index + 1) % cacheSize
                    const lerpFactor = rawIndex - index

                    newPosition.copy(curveCache.points[index]).lerp(curveCache.points[nextIndex], lerpFactor)
                    binormal.copy(curveCache.binormals[index]).lerp(curveCache.binormals[nextIndex], lerpFactor).normalize()
                    normal.copy(curveCache.normals[index]).lerp(curveCache.normals[nextIndex], lerpFactor).normalize()

                    const wavePhase = normalizedZ * snakeWaveFrequency + time * snakeWaveSpeed
                    const sideOffset = Math.sin(wavePhase) * snakeWaveAmplitude
                    const amplitudeVariation = 0.1 + 0.9 * Math.sin(normalizedZ * Math.PI)

                    // Rotate dragon 90 degrees by swapping normal/binormal and adjusting signs
                    newPosition.addScaledVector(normal, (ox * 0.8) + (sideOffset * amplitudeVariation))
                    newPosition.addScaledVector(binormal, -oy * 0.8)

                    positionAttribute.setXYZ(i, newPosition.x, newPosition.y, newPosition.z)
                }

                positionAttribute.needsUpdate = true
                flowObject.geometry.computeVertexNormals()
            }
        }

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
                    new THREE.BufferGeometry().setFromPoints(curve.getPoints(200)), // Much higher resolution
                    new THREE.LineBasicMaterial({ color: 0x00ff00 }) // Green like example
                )}
            />

            {/* Flow Object - single dragon with curve deformation */}
            {flowObject && <primitive object={flowObject} ref={flowRef} />}

            {/* Lighting setup like in example */}
            <directionalLight position={[-10, 10, 10]} intensity={1} color={0xffaa33} />
            <ambientLight intensity={0.3} color={0x003973} />
        </>
    )
}

