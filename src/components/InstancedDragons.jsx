import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// 🚀 OPTIMIZATION 4: Instanced Geometry for multiple dragons
export default function InstancedDragons({ count = 3 }) {
    const { scene: dragonScene } = useGLTF('./models/dragon basev.glb')
    const instancedMeshRef = useRef()
    const dummy = useMemo(() => new THREE.Object3D(), [])

    // Create curves for each dragon instance
    const curves = useMemo(() => {
        return Array.from({ length: count }, (_, index) => {
            const offset = index * (Math.PI * 2 / count) // Distribute around circle
            const radius = 2 + index * 0.5 // Different radii
            const points = []

            for (let i = 0; i < 16; i++) {
                const t = (i / 16) * Math.PI * 2
                const x = Math.cos(t + offset) * radius
                const y = Math.sin(t * 2) * 1.5 + index * 0.5 // Different heights
                const z = Math.sin(t + offset) * radius
                points.push(new THREE.Vector3(x, y, z))
            }

            const curve = new THREE.CatmullRomCurve3(points, true)
            curve.curveType = 'centripetal'
            return curve
        })
    }, [count])

    // Prepare instanced dragon geometry
    const { instancedGeometry, material } = useMemo(() => {
        if (!dragonScene) return { instancedGeometry: null, material: null }

        let dragonMesh = null
        dragonScene.traverse((child) => {
            if (child.isMesh) {
                dragonMesh = child
            }
        })

        if (!dragonMesh) return { instancedGeometry: null, material: null }

        // Create instanced geometry
        const geometry = dragonMesh.geometry.clone()
        geometry.scale(0.1, 0.1, 0.1)
        geometry.rotateY(Math.PI)

        // Center geometry
        geometry.computeBoundingBox()
        const box = geometry.boundingBox
        const center = box.getCenter(new THREE.Vector3())
        geometry.translate(-center.x, -center.y, -center.z)

        return {
            instancedGeometry: geometry,
            material: dragonMesh.material.clone()
        }
    }, [dragonScene])

    const progressRefs = useRef(Array.from({ length: count }, () => 0))

    useFrame(({ clock }) => {
        const time = clock.getElapsedTime()

        if (instancedMeshRef.current && curves) {
            // Update each dragon instance
            curves.forEach((curve, index) => {
                progressRefs.current[index] += 0.0005 * (1 + index * 0.2) // Different speeds

                const progress = progressRefs.current[index] % 1
                const position = curve.getPointAt(progress)
                const tangent = curve.getTangentAt(progress)

                // Update dummy object
                dummy.position.copy(position)
                dummy.lookAt(position.clone().add(tangent))
                dummy.rotateX(Math.PI / 2)

                // Set instance matrix
                dummy.updateMatrix()
                instancedMeshRef.current.setMatrixAt(index, dummy.matrix)
            })

            instancedMeshRef.current.instanceMatrix.needsUpdate = true
        }
    })

    if (!instancedGeometry || !material) return null

    return (
        <instancedMesh
            ref={instancedMeshRef}
            args={[instancedGeometry, material, count]}
            castShadow
            receiveShadow
        />
    )
}