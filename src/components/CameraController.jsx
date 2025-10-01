import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export default function CameraController() {
    const { camera } = useThree()
    const keys = useRef({
        w: false,
        a: false,
        s: false,
        d: false,
        arrowUp: false,
        arrowDown: false,
        arrowLeft: false,
        arrowRight: false
    })

    const velocity = useRef(new THREE.Vector3())
    const direction = useRef(new THREE.Vector3())

    // Movement settings
    const baseMoveSpeed = 12
    const moveSpeed = useRef(12)
    const damping = 0.9

    // Mouse look settings
    const mouseRef = useRef({ x: 0, y: 0 })
    const isMouseLocked = useRef(false)

    useEffect(() => {
        const handleKeyDown = (event) => {
            switch (event.code) {
                case 'KeyW':
                    keys.current.w = true
                    break
                case 'KeyA':
                    keys.current.a = true
                    break
                case 'KeyS':
                    keys.current.s = true
                    break
                case 'KeyD':
                    keys.current.d = true
                    break
                case 'KeyF':
                    // Toggle pointer lock with F key
                    if (document.pointerLockElement) {
                        document.exitPointerLock()
                    } else {
                        document.body.requestPointerLock()
                    }
                    break
                case 'ArrowUp':
                    keys.current.arrowUp = true
                    break
                case 'ArrowDown':
                    keys.current.arrowDown = true
                    break
                case 'ArrowLeft':
                    keys.current.arrowLeft = true
                    break
                case 'ArrowRight':
                    keys.current.arrowRight = true
                    break
            }
        }

        const handleKeyUp = (event) => {
            switch (event.code) {
                case 'KeyW':
                    keys.current.w = false
                    break
                case 'KeyA':
                    keys.current.a = false
                    break
                case 'KeyS':
                    keys.current.s = false
                    break
                case 'KeyD':
                    keys.current.d = false
                    break
                case 'ArrowUp':
                    keys.current.arrowUp = false
                    break
                case 'ArrowDown':
                    keys.current.arrowDown = false
                    break
                case 'ArrowLeft':
                    keys.current.arrowLeft = false
                    break
                case 'ArrowRight':
                    keys.current.arrowRight = false
                    break
            }
        }

        const handleMouseMove = (event) => {
            if (!isMouseLocked.current) return

            const sensitivity = 0.002
            mouseRef.current.x -= event.movementX * sensitivity
            mouseRef.current.y -= event.movementY * sensitivity

            // Limit vertical rotation
            mouseRef.current.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, mouseRef.current.y))
        }

        const handlePointerLockChange = () => {
            isMouseLocked.current = document.pointerLockElement === document.body
        }

        const handleWheel = (event) => {
            event.preventDefault()

            // Adjust movement speed based on scroll direction
            const scrollDelta = event.deltaY
            const speedChange = scrollDelta > 0 ? -2 : 2 // Scroll down = slower, scroll up = faster

            moveSpeed.current = Math.max(1, Math.min(50, moveSpeed.current + speedChange))

            console.log(`Movement speed: ${moveSpeed.current.toFixed(1)}`)
        }

        document.addEventListener('keydown', handleKeyDown)
        document.addEventListener('keyup', handleKeyUp)
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('pointerlockchange', handlePointerLockChange)
        document.addEventListener('wheel', handleWheel, { passive: false })

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.removeEventListener('keyup', handleKeyUp)
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('pointerlockchange', handlePointerLockChange)
            document.removeEventListener('wheel', handleWheel)
        }
    }, [])

    useFrame((state, delta) => {
        // Calculate movement direction
        direction.current.set(0, 0, 0)

        // WASD movement
        if (keys.current.w || keys.current.arrowUp) {
            direction.current.z -= 1
        }
        if (keys.current.s || keys.current.arrowDown) {
            direction.current.z += 1
        }
        if (keys.current.a || keys.current.arrowLeft) {
            direction.current.x -= 1
        }
        if (keys.current.d || keys.current.arrowRight) {
            direction.current.x += 1
        }

        // Normalize direction vector
        direction.current.normalize()

        // Apply movement relative to camera rotation
        direction.current.applyQuaternion(camera.quaternion)

        // Update velocity with acceleration
        velocity.current.addScaledVector(direction.current, moveSpeed.current * delta)

        // Apply damping
        velocity.current.multiplyScalar(damping)

        // Update camera position
        camera.position.addScaledVector(velocity.current, delta)

        // Apply mouse look rotation
        if (isMouseLocked.current) {
            camera.rotation.order = 'YXZ'
            camera.rotation.y = mouseRef.current.x
            camera.rotation.x = mouseRef.current.y
        }
    })

    return null // This component doesn't render anything
}