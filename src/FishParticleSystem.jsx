import { useGLTF, useAnimations } from '@react-three/drei'
import { useEffect, useRef, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Fish with animation - using SkinnedMesh approach for proper animation
function FishWithAnimation({ scene, animations, fishIndex }) {
  const group = useRef()
  const mixer = useRef()
  
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
        
        // Check for morph targets
        if (child.morphTargetInfluences) {
          console.log(`Fish ${fishIndex} has ${child.morphTargetInfluences.length} morph targets`)
        }
      }
    })
    
    return cloned
  }, [scene, fishIndex])
  
  useEffect(() => {
    if (!clonedScene || animations.length === 0) return
    
    console.log(`Setting up animation for fish ${fishIndex}`)
    
    // Create animation mixer for this specific cloned scene
    mixer.current = new THREE.AnimationMixer(clonedScene)
    
    // Play all animations
    animations.forEach((clip) => {
      const action = mixer.current.clipAction(clip)
      action.play()
      action.timeScale = 1.5
      console.log(`Playing animation: ${clip.name} on fish ${fishIndex}`)
    })
    
    return () => {
      if (mixer.current) {
        mixer.current.stopAllAction()
      }
    }
  }, [clonedScene, animations, fishIndex])
  
  // Update animation mixer every frame
  useFrame((state, delta) => {
    if (mixer.current) {
      mixer.current.update(delta)
    }
  })
  
  return (
    <group ref={group}>
      <primitive 
        object={clonedScene} 
        scale={0.16}
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
    for (let i = 0; i < 6; i++) { // 6 fish as requested
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
  
  // Track mouse position
  useEffect(() => {
    const handleMouseMove = (event) => {
      // Convert mouse position to world coordinates
      mousePosition.current.x = (event.clientX / window.innerWidth) * 2 - 1
      mousePosition.current.y = -(event.clientY / window.innerHeight) * 2 + 1
    }
    
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
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
      
      // Phase management
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
        
        // Calculate distance to mouse for flee behavior
        const distanceToMouse = Math.sqrt(
          Math.pow(fish.position.x - worldMouseX, 2) + 
          Math.pow(fish.position.y - worldMouseY, 2)
        )
        
        // Flee behavior
        const fleeRadius = 4
        if (distanceToMouse < fleeRadius && !fish.fleeState) {
          fish.fleeState = true
          fish.fleeTimer = 2
          
          const fleeDirection = new THREE.Vector3(
            fish.position.x - worldMouseX,
            fish.position.y - worldMouseY,
            0
          ).normalize()
          
          fish.velocity.copy(fleeDirection.multiplyScalar(1.0))
        }
        
        if (fish.fleeState) {
          fish.fleeTimer -= delta
          if (fish.fleeTimer <= 0) {
            fish.fleeState = false
            // Return to gentle swimming
            const angle = Math.random() * Math.PI * 2
            fish.velocity.set(
              Math.cos(angle) * 0.15,
              Math.sin(angle) * 0.1,
              0
            )
          }
        } else {
          // Gentle direction changes
          if (Math.random() < delta * 0.3) { // 30% chance per second
            const angle = Math.random() * Math.PI * 2
            fish.velocity.set(
              Math.cos(angle) * 0.15,
              Math.sin(angle) * 0.1,
              0
            )
          }
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
          <FishWithAnimation scene={scene} animations={animations} fishIndex={index} />
        </group>
      ))}
    </>
  )
}

// Preload the model
useGLTF.preload('./models/koi.glb')