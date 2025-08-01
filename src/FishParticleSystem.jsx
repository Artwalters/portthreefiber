import { useGLTF, useAnimations } from '@react-three/drei'
import { useEffect, useRef, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Fish with animation - using SkinnedMesh approach for proper animation
function FishWithAnimation({ scene, animations, fishIndex, fleeState, velocity }) {
  const group = useRef()
  const mixer = useRef()
  const actions = useRef([])
  const currentAnimationSpeed = useRef(1.5)
  const targetAnimationSpeed = useRef(1.5)
  const speedVariation = useRef(Math.random() * 0.4 + 0.8) // 0.8 to 1.2 multiplier for natural variation
  const lastSpeedChangeTime = useRef(0)
  
  // Clone the scene and setup animation mixer
  const clonedScene = useMemo(() => {
    // Use SkeletonUtils for proper cloning if available
    const cloned = scene.clone()
    
    // Clone all meshes properly
    cloned.traverse((child) => {
      if (child.isMesh) {
        // Clone geometry to have independent morph targets
        child.geometry = child.geometry.clone()
        
        // Clone material
        if (child.material) {
          child.material = child.material.clone()
        }
        
        // If it's a SkinnedMesh, clone skeleton
        if (child.isSkinnedMesh && child.skeleton) {
          child.skeleton = child.skeleton.clone()
        }
      }
    })
    
    return cloned
  }, [scene, fishIndex])
  
  useEffect(() => {
    if (!clonedScene || animations.length === 0) return
    
    // Create animation mixer for this specific cloned scene
    mixer.current = new THREE.AnimationMixer(clonedScene)
    
    // Play all animations and store actions
    actions.current = animations.map((clip) => {
      const action = mixer.current.clipAction(clip)
      action.play()
      action.timeScale = 1.5 // Base animation speed
      return action
    })
    
    return () => {
      if (mixer.current) {
        mixer.current.stopAllAction()
      }
    }
  }, [clonedScene, animations, fishIndex])
  
  // Smooth easing function for natural transitions
  const easeInOutCubic = (t) => {
    if (t < 0.5) {
      return 4 * t * t * t
    }
    return 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  // Update animation mixer every frame with ultra-smooth transitions and natural variation
  useFrame((state, delta) => {
    if (mixer.current) {
      // Calculate target animation speed based on velocity
      const speed = velocity ? velocity.length() : 0.3
      
      // Map velocity to animation speed with natural variation
      const baseSpeed = 0.3
      const baseAnimationMultiplier = Math.max(1.0, (speed / baseSpeed) * 1.5)
      
      // Add subtle speed variation that changes over time
      const time = state.clock.elapsedTime
      if (time - lastSpeedChangeTime.current > 3 + Math.random() * 4) { // Change variation every 3-7 seconds
        speedVariation.current = Math.random() * 0.4 + 0.8 // 0.8 to 1.2 multiplier (more subtle)
        lastSpeedChangeTime.current = time
      }
      
      // Apply variation and add subtle sine wave for natural breathing rhythm
      const breathingVariation = Math.sin(time * 1.5 + fishIndex * 0.5) * 0.08 + 1 // Slower, more subtle breathing
      targetAnimationSpeed.current = baseAnimationMultiplier * speedVariation.current * breathingVariation
      
      // Ultra-smooth ease transition with cubic easing
      const transitionSpeed = fleeState ? 4.0 : 1.5 // Slower, more gradual transitions
      const speedDifference = targetAnimationSpeed.current - currentAnimationSpeed.current
      
      // Apply cubic easing for smoother transitions
      const normalizedDiff = Math.abs(speedDifference) / 5.0 // Normalize difference
      const easedTransition = easeInOutCubic(Math.min(normalizedDiff, 1.0))
      const smoothTransition = speedDifference * delta * transitionSpeed * (0.3 + easedTransition * 0.7)
      
      currentAnimationSpeed.current += smoothTransition
      
      // Clamp to reasonable bounds
      currentAnimationSpeed.current = Math.max(0.8, Math.min(6.0, currentAnimationSpeed.current))
      
      // Apply ultra-smooth animation speed with additional smoothing
      actions.current.forEach(action => {
        if (action) {
          // Add slight smoothing to prevent micro-stutters
          const currentTimeScale = action.timeScale || 1.5
          const targetTimeScale = currentAnimationSpeed.current
          const smoothedTimeScale = currentTimeScale + (targetTimeScale - currentTimeScale) * delta * 8.0
          
          action.timeScale = smoothedTimeScale
        }
      })
      
      // Update mixer with clamped delta to prevent large jumps
      mixer.current.update(Math.min(delta, 1/30)) // Max 30fps delta to prevent stutters
    }
  })
  
  return (
    <group ref={group}>
      <primitive 
        object={clonedScene} 
        scale={0.192}
        rotation={[-Math.PI / 2, 0, Math.PI]}
      />
    </group>
  )
}

export default function FishParticleSystem() {
  const { scene, animations } = useGLTF('./models/koi.glb')
  const { camera } = useThree()
  const fishRefs = useRef([])
  const fishActions = useRef([])
  const mousePosition = useRef(new THREE.Vector2(0, 0))
  
  // Animation info logged once
  useEffect(() => {
    console.log(`🐟 Loaded ${animations.length} animations:`, animations.map(a => a.name))
    
    // Debug scene structure
    console.log('Scene structure:')
    scene.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        console.log(`- ${child.name || 'unnamed'}: ${child.type}, isSkinnedMesh: ${child.isSkinnedMesh}`)
        if (child.isSkinnedMesh && child.skeleton) {
          console.log(`  - Has skeleton with ${child.skeleton.bones.length} bones`)
        }
        if (child.morphTargetInfluences) {
          console.log(`  - Has ${child.morphTargetInfluences.length} morph targets`)
        }
        if (child.geometry && child.geometry.morphAttributes) {
          console.log(`  - Morph attributes:`, Object.keys(child.geometry.morphAttributes))
        }
      }
    })
    
    // Debug animation clips
    animations.forEach((clip) => {
      console.log(`Animation "${clip.name}":`)
      clip.tracks.forEach((track) => {
        console.log(`  - Track: ${track.name} (${track.constructor.name})`)
      })
    })
  }, [animations, scene])
  
  // Initialize fish data
  const fishData = useMemo(() => {
    const fish = []
    for (let i = 0; i < 12; i++) { // 12 fish as requested
      // Generate random edge spawn position
      const spawnFromEdge = () => {
        const edge = Math.floor(Math.random() * 4) // 0=top, 1=right, 2=bottom, 3=left
        let startPos, targetPos, initialRotation
        
        switch(edge) {
          case 0: // Top edge
            startPos = new THREE.Vector3(Math.random() * 32 - 16, 8, -2 - Math.random() * 2)
            targetPos = new THREE.Vector3(Math.random() * 20 - 10, Math.random() * 4 - 2, startPos.z)
            break
          case 1: // Right edge  
            startPos = new THREE.Vector3(20, Math.random() * 10 - 5, -2 - Math.random() * 2)
            targetPos = new THREE.Vector3(Math.random() * 15 - 5, Math.random() * 6 - 3, startPos.z)
            break
          case 2: // Bottom edge
            startPos = new THREE.Vector3(Math.random() * 32 - 16, -8, -2 - Math.random() * 2)
            targetPos = new THREE.Vector3(Math.random() * 20 - 10, Math.random() * 4 - 2, startPos.z)
            break
          case 3: // Left edge
            startPos = new THREE.Vector3(-20, Math.random() * 10 - 5, -2 - Math.random() * 2)
            targetPos = new THREE.Vector3(Math.random() * 15 - 5, Math.random() * 6 - 3, startPos.z)
            break
        }
        
        const directionToTarget = targetPos.clone().sub(startPos).normalize()
        // Adjust initial rotation with same offset as movement rotation
        initialRotation = Math.atan2(directionToTarget.y, directionToTarget.x) + Math.PI
        
        return { startPos, targetPos, initialRotation }
      }
      
      const spawn = spawnFromEdge()
      
      fish.push({
        id: i,
        position: spawn.startPos.clone(),
        startPosition: spawn.startPos.clone(),
        targetPosition: spawn.targetPos.clone(),
        velocity: spawn.targetPos.clone().sub(spawn.startPos).normalize().multiplyScalar(0.3), // Slow speed
        rotation: spawn.initialRotation,
        targetRotation: spawn.initialRotation,
        fleeState: false,
        fleeTimer: 0,
        phase: 'entering', // entering, swimming, exiting
        phaseTimer: 5 + Math.random() * 10, // Time to spend in center before exiting
        hasReachedTarget: false,
        spawnDelay: Math.random() * 15, // Stagger fish spawning over longer period
      })
    }
    return fish
  }, [])
  
  // Track mouse position and interaction state
  const mouseDown = useRef(false)
  
  useEffect(() => {
    const handleMouseMove = (event) => {
      // Convert mouse position to world coordinates
      mousePosition.current.x = (event.clientX / window.innerWidth) * 2 - 1
      mousePosition.current.y = -(event.clientY / window.innerHeight) * 2 + 1
    }
    
    const handleMouseDown = () => {
      mouseDown.current = true
    }
    
    const handleMouseUp = () => {
      mouseDown.current = false
    }
    
    // Touch events for mobile
    const handleTouchStart = (event) => {
      mouseDown.current = true
      if (event.touches.length > 0) {
        mousePosition.current.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1
        mousePosition.current.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1
      }
    }
    
    const handleTouchMove = (event) => {
      if (event.touches.length > 0) {
        mousePosition.current.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1
        mousePosition.current.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1
      }
    }
    
    const handleTouchEnd = () => {
      mouseDown.current = false
    }
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchstart', handleTouchStart)
    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('touchend', handleTouchEnd)
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])
  
  useFrame((state, delta) => {
    const worldMouseX = mousePosition.current.x * 16 // Scale to world coordinates
    const worldMouseY = mousePosition.current.y * 8
    
    fishData.forEach((fish, index) => {
      const fishRef = fishRefs.current[index]
      if (!fishRef) return
      
      // Handle spawn delay
      if (fish.spawnDelay > 0) {
        fish.spawnDelay -= delta
        fishRef.visible = false
        return
      } else {
        fishRef.visible = true
      }
      
      // Calculate distance to mouse for flee behavior (applies to all phases)
      const distanceToMouse = Math.sqrt(
        Math.pow(fish.position.x - worldMouseX, 2) + 
        Math.pow(fish.position.y - worldMouseY, 2)
      )
      
      // Flee behavior - works in any phase when mouse is down (clicking/dragging)
      const fleeRadius = 5
      if (mouseDown.current && distanceToMouse < fleeRadius && !fish.fleeState) {
        fish.fleeState = true
        fish.fleeTimer = 3 // Longer flee time
        
        const fleeDirection = new THREE.Vector3(
          fish.position.x - worldMouseX,
          fish.position.y - worldMouseY,
          0
        ).normalize()
        
        // Much faster flee speed
        fish.velocity.copy(fleeDirection.multiplyScalar(2.0))
      }
      
      // Handle flee state across all phases
      if (fish.fleeState) {
        fish.fleeTimer -= delta
        if (fish.fleeTimer <= 0) {
          fish.fleeState = false
          // Return to normal behavior based on current phase
          if (fish.phase === 'entering') {
            const direction = fish.targetPosition.clone().sub(fish.position).normalize()
            fish.velocity.copy(direction.multiplyScalar(0.3))
          } else if (fish.phase === 'swimming') {
            const angle = Math.random() * Math.PI * 2
            fish.velocity.set(
              Math.cos(angle) * 0.15,
              Math.sin(angle) * 0.1,
              0
            )
          }
          // exiting phase keeps its velocity
        }
      } else {
        // Normal phase behavior (only when not fleeing)
        if (fish.phase === 'entering') {
          // Swimming towards target position in center
          const distanceToTarget = fish.position.distanceTo(fish.targetPosition)
          
          if (distanceToTarget < 1) {
            fish.hasReachedTarget = true
            fish.phase = 'swimming'
            // Start gentle random swimming in center area
            const angle = Math.random() * Math.PI * 2
            fish.velocity.set(
              Math.cos(angle) * 0.15,
              Math.sin(angle) * 0.1,
              0
            )
          } else {
            // Continue towards target
            const direction = fish.targetPosition.clone().sub(fish.position).normalize()
            fish.velocity.copy(direction.multiplyScalar(0.3))
          }
          
        } else if (fish.phase === 'swimming') {
          // Gentle swimming in center area
          fish.phaseTimer -= delta
          
          // Gentle direction changes (only when not fleeing)
          if (Math.random() < delta * 0.3) { // 30% chance per second
            const angle = Math.random() * Math.PI * 2
            fish.velocity.set(
              Math.cos(angle) * 0.15,
              Math.sin(angle) * 0.1,
              0
            )
          }
          
          // Time to exit?
          if (fish.phaseTimer <= 0) {
            fish.phase = 'exiting'
            // Pick random exit edge
            const edge = Math.floor(Math.random() * 4)
            let exitTarget
            switch(edge) {
              case 0: exitTarget = new THREE.Vector3(fish.position.x, 10, fish.position.z); break
              case 1: exitTarget = new THREE.Vector3(25, fish.position.y, fish.position.z); break
              case 2: exitTarget = new THREE.Vector3(fish.position.x, -10, fish.position.z); break
              case 3: exitTarget = new THREE.Vector3(-25, fish.position.y, fish.position.z); break
            }
            const exitDirection = exitTarget.sub(fish.position).normalize()
            fish.velocity.copy(exitDirection.multiplyScalar(0.4))
          }
          
        } else if (fish.phase === 'exiting') {
          // Swimming towards edge
          // Check if fish is far enough off screen to respawn
          if (fish.position.x > 25 || fish.position.x < -25 || 
              fish.position.y > 10 || fish.position.y < -10) {
            // Respawn fish
            fish.spawnDelay = 5 + Math.random() * 15 // Wait 5-20 seconds before respawning
            
            // Generate new spawn data
            const spawnFromEdge = () => {
              const edge = Math.floor(Math.random() * 4)
              let startPos, targetPos
              
              switch(edge) {
                case 0: // Top
                  startPos = new THREE.Vector3(Math.random() * 32 - 16, 8, -2 - Math.random() * 2)
                  targetPos = new THREE.Vector3(Math.random() * 20 - 10, Math.random() * 4 - 2, startPos.z)
                  break
                case 1: // Right
                  startPos = new THREE.Vector3(20, Math.random() * 10 - 5, -2 - Math.random() * 2)
                  targetPos = new THREE.Vector3(Math.random() * 15 - 5, Math.random() * 6 - 3, startPos.z)
                  break
                case 2: // Bottom
                  startPos = new THREE.Vector3(Math.random() * 32 - 16, -8, -2 - Math.random() * 2)
                  targetPos = new THREE.Vector3(Math.random() * 20 - 10, Math.random() * 4 - 2, startPos.z)
                  break
                case 3: // Left
                  startPos = new THREE.Vector3(-20, Math.random() * 10 - 5, -2 - Math.random() * 2)
                  targetPos = new THREE.Vector3(Math.random() * 15 - 5, Math.random() * 6 - 3, startPos.z)
                  break
              }
              return { startPos, targetPos }
            }
            
            const newSpawn = spawnFromEdge()
            fish.position.copy(newSpawn.startPos)
            fish.targetPosition.copy(newSpawn.targetPos)
            fish.phase = 'entering'
            fish.phaseTimer = 5 + Math.random() * 10
            fish.hasReachedTarget = false
            
            const direction = fish.targetPosition.clone().sub(fish.position).normalize()
            fish.velocity.copy(direction.multiplyScalar(0.3))
          }
        }
      }
      
      // Update position
      fish.position.add(fish.velocity.clone().multiplyScalar(delta))
      
      // Calculate target rotation based on velocity
      if (fish.velocity.length() > 0.01) {
        // Adjust rotation to ensure fish always swims head-first
        // Add PI because we rotated the model 180 degrees
        fish.targetRotation = Math.atan2(fish.velocity.y, fish.velocity.x) + Math.PI
      }
      
      // Smooth rotation
      let rotationDiff = fish.targetRotation - fish.rotation
      if (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2
      if (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2
      
      fish.rotation += rotationDiff * delta * 3 // Smooth rotation
      
      // Apply position and rotation to mesh
      fishRef.position.copy(fish.position)
      // Keep top-down view: X-rotation for top-down, Z-rotation for direction
      fishRef.rotation.set(0, 0, fish.rotation)
    })
  })
  
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
      
      {/* Render fish instances */}
      {fishData.map((fish, index) => (
        <group key={fish.id} ref={el => fishRefs.current[index] = el} renderOrder={-2}>
          <FishWithAnimation 
            scene={scene} 
            animations={animations} 
            fishIndex={index} 
            fleeState={fish.fleeState}
            velocity={fish.velocity}
          />
        </group>
      ))}
    </>
  )
}

// Preload the model
useGLTF.preload('./models/koi.glb')