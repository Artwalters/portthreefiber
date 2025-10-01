import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const UPDATE_INTERVAL = 1 / 60

// Import Flow modifier (you might need to install this or include the files)
// import { Flow } from 'three/addons/modifiers/CurveModifier.js'

export default function RotatingSnake() {
    const flowRef = useRef()

    // Load the dragon GLB model
    const { scene: dragonScene } = useGLTF('./models/dragon basev.glb')

    // Complete curves for each dragon (2 loops + exit)
    const dragonCurve1 = useRef(null) // Red dragon - starts left, exits right
    const dragonCurve2 = useRef(null) // Blue dragon - starts right, exits left
    const curveProgress1 = useRef(-0.15) // Individual progress for dragon 1 - starts before curve (off screen)
    const curveProgress2 = useRef(-0.15) // Individual progress for dragon 2 - starts before curve (off screen)

    const curveGeometryRef = useRef()
    const curvesInitialized = useRef(false)

    // Get swimming loop point with interweaving spiral pattern
    const getLoopPoint = (time, t, yBaseHeight = 5, spiralOffset = 0) => {
        const numCircles = 3
        const baseRadius = 8 // BIGGER loops - more screen space
        const zDepthOffset = -10 // Move entire loop backwards (much further back)

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
        let y = Math.sin(angle + twist) * radius
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
        const spiralAmplitude = 2.5 // BIGGER height variation - more vertical space
        const spiralPhase = t * Math.PI * 2 * spiralFrequency + spiralOffset
        const spiralY = Math.sin(spiralPhase) * spiralAmplitude

        // LARGER radius variation to keep them apart - prevent overlap
        const radiusVariation = Math.cos(spiralPhase) * 0.8
        const adjustedX = xRotated * (1 + radiusVariation * 0.25) // Increased from 0.1 to 0.25
        const adjustedZ = zRotated * (1 + radiusVariation * 0.25) + zDepthOffset

        return new THREE.Vector3(adjustedX, y + yBaseHeight + spiralY, adjustedZ)
    }

    // Create complete dragon path: entrance -> loops in center -> exit
    const createDragonCurve = (time, direction, loopStartOffset = 0, spiralOffset = 0, yHeight = -0.5) => {
        const points = []

        // Section 1: Entrance - arc OVER and AROUND the slider curve from the side
        const entrancePoints = 200
        const startX = direction === 1 ? -35 : 35 // Start at far edge

        // Get loop entry point
        const loopPoint0 = getLoopPoint(time, loopStartOffset, yHeight, spiralOffset)

        // Create arcing path that goes OVER slider, staying at edge longer
        // Slider is at y=0, so we need HIGH y values (2-4) to go OVER it
        // Path: Start at edge HIGH → stay at edge while arcing OVER → descend and curve inward
        const cp0 = new THREE.Vector3(startX, 2.5, 0) // START: far edge, HIGH (2.5 above slider!), at slider depth

        // Control 1: Stay at edge, arc OVER the slider at HIGHEST point
        const cp1 = new THREE.Vector3(startX * 0.95, 3.5, 0) // Still at edge, HIGHEST point (3.5!), at slider depth

        // Control 2: Still at edge but starting to descend after passing over slider
        const cp2 = new THREE.Vector3(startX * 0.85, 2.0, -2) // Edge, descending but still above slider, moving back

        // Control 3: Still descending, getting closer to slider level
        const cp3 = new THREE.Vector3(startX * 0.75, 1.0, -4) // Still quite far out, above slider, further back

        // Control 4: Now at slider level, start curving inward toward center
        const cp4 = new THREE.Vector3(startX * 0.5, 0.0, -6) // Slider level, moving back

        // Control 5: Descending to loop level, halfway to loop
        const cp5 = new THREE.Vector3(startX * 0.3, yHeight * 0.5, -8) // Transition to loop height

        // Control 6: Approach loop depth at loop height
        const cp6 = new THREE.Vector3(loopPoint0.x * 0.7, yHeight, -10) // At loop height, near loop depth

        // Control 7: Final approach to loop
        const cp7 = loopPoint0.clone()

        // Generate smooth curve through all control points using Catmull-Rom spline
        const entranceCurve = new THREE.CatmullRomCurve3([cp0, cp1, cp2, cp3, cp4, cp5, cp6, cp7], false, 'catmullrom', 0.2)

        for (let i = 0; i < entrancePoints; i++) {
            const t = i / entrancePoints
            const point = entranceCurve.getPoint(t)
            points.push(point)
        }

        // Section 2: Loop in center (360 points = 1 complete loop)
        const loopPoints = 360
        const numLoops = 1

        for (let loop = 0; loop < numLoops; loop++) {
            for (let i = 0; i < loopPoints; i++) {
                const t = (i / loopPoints + loopStartOffset) % 1
                const point = getLoopPoint(time, t, yHeight, spiralOffset)
                points.push(point)
            }
        }

        // Section 3: Exit - ultra smooth using tangent matching
        const exitPoints = 100
        const endX = direction === 1 ? 25 : -25

        // Get last few positions to calculate smooth tangent direction
        const p0 = points[points.length - 3].clone()
        const p1 = points[points.length - 2].clone()
        const p2 = points[points.length - 1].clone()

        // Calculate exit tangent direction from loop
        const exitTangent = new THREE.Vector3()
            .subVectors(p2, p1)
            .normalize()

        // End position
        const endPos = new THREE.Vector3(endX, yHeight, -12)

        // End tangent (pointing towards exit direction)
        const endTangent = new THREE.Vector3(direction, 0, 0).normalize()

        // Create smooth Bezier-like curve using 4 control points
        const exitDistance = endPos.distanceTo(p2)

        // Control point 0: last loop point
        const exitCp0 = p2.clone()

        // Control point 1: extend tangent from last loop point
        const exitCp1 = p2.clone().addScaledVector(exitTangent, exitDistance * 0.4)

        // Control point 2: approach end from its tangent
        const exitCp2 = endPos.clone().addScaledVector(endTangent, -exitDistance * 0.4)

        // Control point 3: end point
        const exitCp3 = endPos.clone()

        // Generate smooth cubic Bezier curve for exit
        for (let i = 1; i <= exitPoints; i++) {
            const t = i / exitPoints

            // Cubic Bezier interpolation
            const t1 = 1 - t
            const t1_2 = t1 * t1
            const t1_3 = t1_2 * t1
            const t_2 = t * t
            const t_3 = t_2 * t

            const point = new THREE.Vector3()
            point.x = t1_3 * exitCp0.x + 3 * t1_2 * t * exitCp1.x + 3 * t1 * t_2 * exitCp2.x + t_3 * exitCp3.x
            point.y = t1_3 * exitCp0.y + 3 * t1_2 * t * exitCp1.y + 3 * t1 * t_2 * exitCp2.y + t_3 * exitCp3.y
            point.z = t1_3 * exitCp0.z + 3 * t1_2 * t * exitCp1.z + 3 * t1 * t_2 * exitCp2.z + t_3 * exitCp3.z

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

            // Compute normal by crossing tangent with up vector
            let normal = new THREE.Vector3().crossVectors(tangent, upVector).normalize()

            // If tangent is parallel to up, use a fallback
            if (normal.length() < 0.0001) {
                normal = new THREE.Vector3(1, 0, 0)
            }

            normals.push(normal.clone())

            // Compute binormal
            const binormal = new THREE.Vector3().crossVectors(normal, tangent).normalize()
            binormals.push(binormal.clone())
        }

        return { tangents, normals, binormals }
    }

    // Initialize complete curves once
    const initializeCurves = (time) => {
        if (curvesInitialized.current) return

        console.log('Initializing complete curves...')

        // Dragon 1 (RED): Starts LEFT, travels RIGHT - LOWER everywhere (links laag, rechts laag)
        // loopStartOffset = 0, spiralOffset = 0 (spirals upward first), yHeight = -3.0 (LOWER)
        const points1 = createDragonCurve(time, 1, 0, 0, -3.0)
        const curve1 = new THREE.CatmullRomCurve3(points1, false)
        curve1.curveType = 'centripetal'
        curve1.tension = 0.0

        // Dragon 2 (BLUE): Starts RIGHT, travels LEFT - HIGHER everywhere (rechts hoog, links hoog)
        // loopStartOffset = 0.5 (opposite side of loop), spiralOffset = Math.PI (opposite spiral direction), yHeight = -1.0 (HIGHER)
        const points2 = createDragonCurve(time, -1, 0.5, Math.PI, -1.0)
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
        geometry.rotateZ(Math.PI / 2) // Rotate 90 degrees (quarter turn) to swim horizontally

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
        const time = clock.getElapsedTime()

        if (!flowObject || !flowObject2 || !originalGeometry || !boundingBox || length <= 0) {
            return
        }

        // Initialize curves on first frame
        initializeCurves(time)

        if (!dragonCurve1.current || !dragonCurve2.current) {
            return
        }

        // Update curve visualizations
        if (dragonCurve1.current && curveLineObject1.geometry) {
            const points = dragonCurve1.current.curve.getPoints(500)
            curveLineObject1.geometry.setFromPoints(points)
            curveLineObject1.geometry.attributes.position.needsUpdate = true
        }
        if (dragonCurve2.current && curveLineObject2.geometry) {
            const points = dragonCurve2.current.curve.getPoints(500)
            curveLineObject2.geometry.setFromPoints(points)
            curveLineObject2.geometry.attributes.position.needsUpdate = true
        }

        // Update progress for both dragons (0 to 1 over entire curve including exit)
        // Speed: 20% slower than original
        const speed = 0.00016
        curveProgress1.current += speed
        curveProgress2.current += speed

        // Reset to start when dragons reach the end for infinite loop
        if (curveProgress1.current > 1.0) {
            curveProgress1.current = -0.15
        }
        if (curveProgress2.current > 1.0) {
            curveProgress2.current = -0.15
        }

        if (time - lastUpdateTime.current < UPDATE_INTERVAL) {
            return
        }

        lastUpdateTime.current = time

        // Update both dragons with their own curves
        const dragons = [
            { mesh: flowObject, curveData: dragonCurve1.current, progress: curveProgress1.current },
            { mesh: flowObject2, curveData: dragonCurve2.current, progress: curveProgress2.current }
        ]

        dragons.forEach(({ mesh, curveData, progress }) => {
            const activeCurve = curveData
            const curveT = progress

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

                const cacheSize = activeCurve.points.length
                const minZ = boundingBox.min.z
                const lengthValue = length

                const snakeWaveFrequency = 8
                const snakeWaveAmplitude = 0.35
                const snakeWaveSpeed = 2.0

                const { binormal, normal, newPosition } = scratchVectors

                for (let i = 0; i < count; i++) {
                    const baseIndex = i * 3
                    const ox = originalArray[baseIndex]
                    const oy = originalArray[baseIndex + 1]
                    const oz = originalArray[baseIndex + 2]

                    const normalizedZ = THREE.MathUtils.clamp((oz - minZ) / lengthValue, 0, 1)

                    // Calculate position along curve - spread dragon along curve
                    let t = curveT + normalizedZ * 0.07
                    // Allow negative t for off-screen starting position
                    if (t < 0) {
                        t = 0 // Use first point of curve when before start
                    } else {
                        t = Math.min(t, 1) // Clamp to curve range
                    }

                    const rawIndex = t * (cacheSize - 1)
                    const index = Math.floor(rawIndex)
                    const nextIndex = Math.min(index + 1, cacheSize - 1)
                    const lerpFactor = rawIndex - index

                    // Get position on curve
                    const curvePoint = activeCurve.points[index].clone().lerp(activeCurve.points[nextIndex], lerpFactor)

                    newPosition.copy(curvePoint)
                    binormal.copy(activeCurve.binormals[index]).lerp(activeCurve.binormals[nextIndex], lerpFactor).normalize()
                    normal.copy(activeCurve.normals[index]).lerp(activeCurve.normals[nextIndex], lerpFactor).normalize()

                    // Add roll variation (limited to -90 to +90 degrees to prevent flipping upside down)
                    const rollFrequency = 0.5 // How fast the dragon rolls
                    const maxRoll = Math.PI / 2 // 90 degrees max
                    const rollPhase = time * rollFrequency + t * Math.PI * 2 // Varies with time and position
                    const rollAngle = Math.sin(rollPhase) * maxRoll

                    // Rotate normal and binormal around tangent
                    const cosRoll = Math.cos(rollAngle)
                    const sinRoll = Math.sin(rollAngle)
                    const originalNormal = normal.clone()
                    const originalBinormal = binormal.clone()

                    normal.copy(originalNormal).multiplyScalar(cosRoll).addScaledVector(originalBinormal, sinRoll)
                    binormal.copy(originalNormal).multiplyScalar(-sinRoll).addScaledVector(originalBinormal, cosRoll)

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
                    const tangent = activeCurve.tangents[index].clone().lerp(activeCurve.tangents[nextIndex], lerpFactor).normalize()

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
            {/* Curve visualizations - RED for dragon 1, BLUE for dragon 2 */}
            <primitive object={curveLineObject1} />
            <primitive object={curveLineObject2} />

            {/* Flow Objects - two dragons with curve deformation */}
            {flowObject && <primitive object={flowObject} ref={flowRef} />}
            {flowObject2 && <primitive object={flowObject2} />}

            {/* Lighting setup like in example */}
            <directionalLight position={[-10, 10, 10]} intensity={1} color={0xffaa33} />
            <ambientLight intensity={0.3} color={0x003973} />
        </>
    )
}

