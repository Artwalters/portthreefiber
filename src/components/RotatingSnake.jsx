import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// Import Flow modifier (you might need to install this or include the files)
// import { Flow } from 'three/addons/modifiers/CurveModifier.js'

export default function RotatingSnake() {
    const groupRef = useRef()
    const flowRef = useRef()
    const curveProgress = useRef(0)

    // Load the dragon GLB model
    const { scene: dragonScene } = useGLTF('./models/dragon basev.glb')

    // Create a smooth, simple curve with high resolution
    const curve = useMemo(() => {
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
        return curve
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

    useFrame(({ clock }) => {
        // Even slower movement along curve for very relaxed animation
        curveProgress.current += 0.0005

        const time = clock.getElapsedTime()

        // Optimize: Update at 30fps instead of 60fps for better performance
        if (Math.floor(time * 30) % 1 === 0 && flowObject && originalGeometry) {
            const positionAttribute = flowObject.geometry.attributes.position
            const originalPositions = originalGeometry.attributes.position

            // Get geometry bounds for normalization
            originalGeometry.computeBoundingBox()
            const box = originalGeometry.boundingBox
            const length = box.max.z - box.min.z

            // Apply curve deformation to each vertex
            for (let i = 0; i < positionAttribute.count; i++) {
                // Get original position
                const originalPoint = new THREE.Vector3(
                    originalPositions.getX(i),
                    originalPositions.getY(i),
                    originalPositions.getZ(i)
                )

                // Normalize Z position to curve parameter (0-1)
                const normalizedZ = (originalPoint.z - box.min.z) / length

                // Calculate curve parameter for this vertex (reduced stretching)
                let t = (curveProgress.current + normalizedZ * 0.15) % 1 // Reduced from 0.3 to 0.15

                // Get curve point and direction using uniform spacing
                const curvePoint = curve.getPointAt(t) // getPointAt for uniform arc-length parameterization
                const tangent = curve.getTangentAt(t).normalize() // getTangentAt for consistent direction

                // Create coordinate system at curve point
                const normal = new THREE.Vector3(0, 1, 0)
                const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize()
                normal.crossVectors(binormal, tangent).normalize()

                // Add snake-like zigzag movement
                const snakeWaveFrequency = 10 // Even more waves for very compact zigzag
                const snakeWaveAmplitude = 0.15 // Very small amplitude for tight zigzag
                const snakeWaveSpeed = 4.5 // Moderate speed for natural zigzag

                // Calculate snake wave offset based on position along dragon and time
                const wavePhase = normalizedZ * snakeWaveFrequency + time * snakeWaveSpeed
                const sideOffset = Math.sin(wavePhase) * snakeWaveAmplitude

                // Vary amplitude - head subtle, body snakes more, tail still
                const amplitudeVariation = 0.05 + 0.8 * Math.sin(normalizedZ * Math.PI) // Peak snaking in middle body, quiet at head and tail

                // Transform point to curve space (with snake movement)
                const newPosition = curvePoint.clone()
                newPosition.addScaledVector(binormal, (originalPoint.x * 0.8) + (sideOffset * amplitudeVariation))
                newPosition.addScaledVector(normal, originalPoint.y * 0.8)

                positionAttribute.setXYZ(i, newPosition.x, newPosition.y, newPosition.z)
            }

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

            {/* Flow Object - like scene.add(flow.object3D) in example */}
            {flowObject && <primitive object={flowObject} ref={flowRef} />}

            {/* Lighting setup like in example */}
            <directionalLight position={[-10, 10, 10]} intensity={1} color={0xffaa33} />
            <ambientLight intensity={0.3} color={0x003973} />
        </>
    )
}