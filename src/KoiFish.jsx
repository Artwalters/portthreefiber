import { useGLTF, useAnimations, PerspectiveCamera } from '@react-three/drei'
import { useEffect, useRef, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export default function KoiFish() {
  const group = useRef()
  const fishCameraRef = useRef()
  const { scene, animations } = useGLTF('./models/koi.glb')
  const { actions } = useAnimations(animations, group)
  const { camera } = useThree()
  const [speedMultiplier, setSpeedMultiplier] = useState(1)
  const [isSpeedBoosting, setIsSpeedBoosting] = useState(false)
  const speedBoostStartTime = useRef(0)
  const [isVisible, setIsVisible] = useState(true)
  const [waitTime, setWaitTime] = useState(0)
  const cycleStartTime = useRef(0)
  const lastClickTime = useRef(0)
  const currentProgress = useRef(0)
  const clickCircleRef = useRef()
  
  // Create straight line geometry - much longer
  const lineGeometry = useMemo(() => {
    const points = []
    for (let i = 0; i <= 100; i++) {
      const progress = i / 100
      const x = -16 + progress * 32 // From -16 to +16 - double distance
      const y = -1.5 // Move down to 1/4 from bottom of screen
      points.push(new THREE.Vector3(x, y, -2))
    }
    const curve = new THREE.CatmullRomCurve3(points)
    return new THREE.TubeGeometry(curve, 100, 0.01, 8, false)
  }, [])
  
  // Create click detection circle geometry
  const clickCircleGeometry = useMemo(() => {
    return new THREE.CircleGeometry(3, 32) // Radius of 3 units to match detection
  }, [])
  
  useEffect(() => {
    // Play all available animations with faster speed
    Object.keys(actions).forEach(key => {
      if (actions[key]) {
        actions[key].play()
        
        // Make animation slower to match new swimming speed
        actions[key].timeScale = 0.8 // 3x slower base animation
      }
    })
  }, [actions])
  
  useFrame((state) => {
    if (group.current) {
      // Handle speed boost with ease in/out
      if (isSpeedBoosting) {
        const elapsed = performance.now() / 1000 - speedBoostStartTime.current
        const duration = 4 // 4 seconds for longer boost
        
        if (elapsed < duration) {
          // Ease in/out curve
          const progress = elapsed / duration
          const easeInOut = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2
          
          // Direct speed boost - moderate effect that works
          const boostAmount = 3.0 * Math.sin(progress * Math.PI) * easeInOut
          setSpeedMultiplier(1 + boostAmount)
        } else {
          // Speed boost finished
          setIsSpeedBoosting(false)
          setSpeedMultiplier(1)
        }
      }
      
      const currentTime = state.clock.elapsedTime
      
      // Check if we need to start a new cycle - only when fish is completely done
      const cycleElapsed = currentTime - cycleStartTime.current
      const baseCycleDuration = 10 / 0.5625 // Base time without speed multiplier
      
      if (currentProgress.current >= 1 && cycleElapsed >= baseCycleDuration + waitTime) {
        // Start new cycle with random wait time - only when fish finished crossing
        cycleStartTime.current = currentTime
        setWaitTime(1 + Math.random() * 4) // Random 1-5 seconds
        setIsVisible(false) // Hide during wait
        currentProgress.current = 0 // Reset progress
      }
      
      // Calculate progress increment based on speed - slower base speed
      const deltaTime = state.clock.getDelta()
      const progressIncrement = (deltaTime * 1.0) * speedMultiplier // Slower base speed
      
      if (cycleElapsed >= waitTime && currentProgress.current < 1) {
        // Only move forward, never backwards
        currentProgress.current = Math.min(1, currentProgress.current + progressIncrement)
        
        // Speed up fish animation during boost
        Object.keys(actions).forEach(key => {
          if (actions[key]) {
            actions[key].timeScale = 2.5 * speedMultiplier // Base 2.5x + speed boost
          }
        })
      }
      
      const cycleProgress = currentProgress.current
      
      if (cycleElapsed < waitTime) {
        // Still waiting, hide fish  
        console.log(`Fish waiting - elapsed: ${cycleElapsed.toFixed(2)}, wait: ${waitTime.toFixed(2)}`)
        setIsVisible(false)
      } else if (currentProgress.current < 1) {
        // Fish is swimming across
        console.log(`Fish swimming - progress: ${currentProgress.current.toFixed(3)}`)
        setIsVisible(true)
        const x = -16 + cycleProgress * 32 // Move from -16 (left) to +16 (right) - double distance
        const y = -1.5 // Move down to 1/4 from bottom of screen
        group.current.position.set(x, y, -2)
        
        // Update click detection circle position
        if (clickCircleRef.current) {
          clickCircleRef.current.position.set(x, y, -1.9) // Slightly in front of fish
        }
        
      } else {
        // Fish has finished crossing, hide until next cycle
        console.log(`Fish finished - progress: ${currentProgress.current.toFixed(3)}`)
        setIsVisible(false)
      }
      
      
      // Rotate the fish camera
      if (fishCameraRef.current) {
        const rotationSpeed = 0.5
        fishCameraRef.current.rotation.z = state.clock.elapsedTime * rotationSpeed
      }
    }
  })
  
  // Handle click/drag interaction
  const handleInteraction = (event) => {
    if (!group.current) {
      return
    }
    
    // Get click position in world coordinates
    const mouse = new THREE.Vector2()
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, camera)
    
    // Simple approach: convert mouse coordinates to world space
    const fishPosition = group.current.position
    
    // Convert normalized mouse coordinates (-1 to 1) to world coordinates
    // Match the fish path range (-16 to +16)
    const worldX = mouse.x * 16  // Match fish X range
    const worldY = mouse.y * 8   // Increase Y range for better detection
    
    // Only check X and Y distance, ignore Z
    const distance2D = Math.sqrt(
      Math.pow(fishPosition.x - worldX, 2) + 
      Math.pow(fishPosition.y - worldY, 2)
    )
    
    // Check cooldown - prevent rapid multiple clicks
    const currentTime = performance.now() / 1000
    const timeSinceLastClick = currentTime - lastClickTime.current
    
    // If interaction is within 3 units of fish and not in cooldown (matches circle size)
    if (distance2D < 3 && timeSinceLastClick > 0.1 && isVisible) {
      console.log('Clicked inside circle!')
      console.log(`Current speed multiplier: ${speedMultiplier}`)
      if (isSpeedBoosting) {
        // Already boosting - increase the boost instead of starting new one
        const currentProgress = (currentTime - speedBoostStartTime.current) / 4
        if (currentProgress < 0.8) { // Only if boost is not almost finished
          setSpeedMultiplier(prev => Math.min(prev + 0.5, 6.0)) // More moderate boost for multiple clicks
          console.log('Speed boost increased!')
        }
      } else {
        // Start new speed boost
        setIsSpeedBoosting(true)
        speedBoostStartTime.current = currentTime
        setSpeedMultiplier(4.0) // More moderate boost that works
        console.log('Speed boost activated!')
      }
      lastClickTime.current = currentTime
    }
  }
  
  // Add interaction listeners
  useEffect(() => {
    const handleClick = (event) => handleInteraction(event)
    const handleMouseMove = (event) => {
      if (event.buttons > 0) { // Only if dragging
        handleInteraction(event)
      }
    }
    
    window.addEventListener('click', handleClick)
    window.addEventListener('mousemove', handleMouseMove)
    
    return () => {
      window.removeEventListener('click', handleClick)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [camera])
  
  return (
    <>
      
      {/* Lighting for the fish */}
      <ambientLight intensity={0.4} />
      <directionalLight 
        position={[5, 5, 5]} 
        intensity={1} 
        castShadow
      />
      <pointLight 
        position={[0, 0, 8]} 
        intensity={0.8} 
        color="white"
      />
      
      {/* Straight line path visualization */}
      <mesh geometry={lineGeometry}>
        <meshBasicMaterial color="lightblue" transparent opacity={0.3} />
      </mesh>
      
      {/* Click detection circle - only visible when fish is visible */}
      <mesh ref={clickCircleRef} geometry={clickCircleGeometry} visible={isVisible} renderOrder={-1}>
        <meshBasicMaterial color="red" transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
      
      {/* Koi fish */}
      <group ref={group} renderOrder={-2} visible={isVisible}>
        <primitive 
          object={scene} 
          scale={0.1}
          rotation={[Math.PI / 2, 0, 0]}
        />
      </group>
    </>
  )
}

// Preload the model
useGLTF.preload('./models/koi.glb')