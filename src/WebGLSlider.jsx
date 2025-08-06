import { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'

const SlideItem = ({ texture, position, velocity, sliderSpeed, projectData, onHover, onClick, onTouchEnd, onPointerUp, isClicked, isTransitioning, shouldHide, transitionComplete, isInitialExpanding, selectedProject, isScalingDown, isScalingDownForReset, isMobile, externalCurrentImageIndex, onImageIndexChange, isReturningFromGallery, sliderOpacity = 1 }) => {
  const meshRef = useRef()
  const hasTransitionAnimated = useRef(false)
  const hasScaleUpAnimated = useRef(false)
  const hasInitialExpanded = useRef(false)
  const currentSpeed = useRef(0)
  const opacity = useRef(1)
  const [isImageTransitioning, setIsImageTransitioning] = useState(false)
  const transitionProgress = useRef(0)
  
  // Use external currentImageIndex or fallback to 0
  const currentImageIndex = externalCurrentImageIndex !== undefined ? externalCurrentImageIndex : 0
  
  // Load all gallery images for this project - extract src strings from image objects
  const imageSrcs = projectData.images ? projectData.images.map(img => img.src) : [texture]
  const galleryTextures = useTexture(imageSrcs)
  
  // Configure gallery textures
  useEffect(() => {
    galleryTextures.forEach(tex => {
      tex.generateMipmaps = false
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.minFilter = THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
    })
  }, [galleryTextures])
  
  // Simple shader material with curve deformation - memoized to prevent recreation
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTexture1: { value: texture }, // Main texture (cover)
      uTexture2: { value: texture }, // Second texture for transitions
      uVelo: { value: 0 },
      uIsMobile: { value: isMobile ? 1.0 : 0.0 },
      uOpacity: { value: 1.0 },
      uProgress: { value: 0.0 } // For image transitions
    },
    vertexShader: `
      precision mediump float;
      uniform float uVelo;
      uniform float uIsMobile;
      varying vec2 vUv;
      
      #define M_PI 3.1415926535897932384626433832795
      
      void main(){
        vec3 pos = position;
        
        if(uIsMobile > 0.5) {
          // Vertical deformation for mobile - stronger effect
          pos.y = pos.y - ((sin(uv.x * M_PI) * uVelo) * 0.085);
        } else {
          // Horizontal deformation for desktop - stronger effect
          pos.x = pos.x - ((sin(uv.y * M_PI) * uVelo) * 0.085);
        }
        
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform sampler2D uTexture1;
      uniform sampler2D uTexture2;
      uniform float uVelo;
      uniform float uOpacity;
      uniform float uProgress;
      varying vec2 vUv;
      
      void main() {
        // Calculate chromatic aberration based on velocity - more visible
        float aberrationStrength = abs(uVelo) * 0.005; // More visible effect
        aberrationStrength = min(aberrationStrength, 0.015); // Higher maximum for better visibility
        
        vec2 redOffset = vec2(aberrationStrength, 0.0);
        vec2 blueOffset = vec2(-aberrationStrength, 0.0);
        
        // Sample textures with RGB shift for both texture1 and texture2
        vec4 color1, color2;
        
        if (aberrationStrength > 0.0001) {
          // Apply chromatic aberration when moving
          float r1 = texture2D(uTexture1, vUv + redOffset).r;
          float g1 = texture2D(uTexture1, vUv).g;
          float b1 = texture2D(uTexture1, vUv + blueOffset).b;
          float a1 = texture2D(uTexture1, vUv).a;
          color1 = vec4(r1, g1, b1, a1);
          
          float r2 = texture2D(uTexture2, vUv + redOffset).r;
          float g2 = texture2D(uTexture2, vUv).g;
          float b2 = texture2D(uTexture2, vUv + blueOffset).b;
          float a2 = texture2D(uTexture2, vUv).a;
          color2 = vec4(r2, g2, b2, a2);
        } else {
          // No effect when stationary
          color1 = texture2D(uTexture1, vUv);
          color2 = texture2D(uTexture2, vUv);
        }
        
        // Mix textures based on progress (for gallery transitions)
        vec4 color = mix(color1, color2, uProgress);
        
        // Ensure alpha is properly handled
        color.a = max(color1.a, color2.a) * uOpacity;
        gl_FragColor = color;
      }
    `,
    transparent: false,
    side: THREE.DoubleSide
  }), [texture]) // Only recreate if texture changes
  
  // Update texture when it changes
  useEffect(() => {
    if (material.uniforms.uTexture1 && galleryTextures && galleryTextures.length > 0) {
      material.uniforms.uTexture1.value = galleryTextures[currentImageIndex] || texture
      // Also set uTexture2 to the same texture initially
      if (material.uniforms.uTexture2) {
        material.uniforms.uTexture2.value = galleryTextures[currentImageIndex] || texture
      }
    }
  }, [texture, material, galleryTextures, currentImageIndex])

  // Update isMobile uniform without recreating material
  useEffect(() => {
    if (material.uniforms && material.uniforms.uIsMobile) {
      material.uniforms.uIsMobile.value = isMobile ? 1.0 : 0.0
    }
  }, [material, isMobile])

  // Update velocity uniform and position - continue smooth fade even during transition
  useFrame(() => {
    if (meshRef.current && material.uniforms && material.uniforms.uVelo) {
      // During transition, fade to 0, otherwise use slider speed
      const targetSpeed = (isTransitioning || transitionComplete) ? 0 : (sliderSpeed || 0)
      
      // Safeguard against invalid values
      if (isNaN(targetSpeed) || isNaN(currentSpeed.current)) {
        currentSpeed.current = 0
        material.uniforms.uVelo.value = 0
        return
      }
      
      // Extra smooth easing for direction changes
      let ease
      if (isTransitioning || transitionComplete) {
        // During transition, use slow fade out
        ease = 0.02
      } else if (Math.sign(targetSpeed) !== Math.sign(currentSpeed.current) && Math.abs(currentSpeed.current) > 0.01) {
        // Direction change - faster easing for more responsive feel
        ease = 0.04
      } else if (Math.abs(targetSpeed) > Math.abs(currentSpeed.current)) {
        // Speed increase - moderate easing
        ease = 0.05
      } else {
        // Speed decrease - faster easing for quicker recovery
        ease = 0.025
      }
      
      currentSpeed.current += (targetSpeed - currentSpeed.current) * ease
      
      // Clamp to reasonable values
      currentSpeed.current = Math.max(-5, Math.min(5, currentSpeed.current))
      
      material.uniforms.uVelo.value = currentSpeed.current * 0.5 // Reduce effect intensity by 50%
    }
    
    // Update slider opacity
    if (material.uniforms.uOpacity) {
      material.uniforms.uOpacity.value = sliderOpacity
    }
    
    // Ensure uProgress is updated during image transitions
    if (material.uniforms.uProgress && isImageTransitioning) {
      material.uniforms.uProgress.value = transitionProgress.current
    }
    
    // Handle normal positioning only when not expanding, not transitioning, and not returning from gallery
    if (meshRef.current && !isTransitioning && !transitionComplete && !isInitialExpanding && !isReturningFromGallery && !isScalingDown) {
      // Check if this is the selected project for subtle z-positioning
      const isSelectedProject = selectedProject && selectedProject.name === projectData.name
      const zPosition = isSelectedProject ? position[2] + 0.01 : position[2]
      
      meshRef.current.position.set(position[0], position[1], zPosition)
      hasTransitionAnimated.current = false
      hasScaleUpAnimated.current = false
    }
  })

  // Handle transition animation (only once when transition starts)
  useEffect(() => {
    if (meshRef.current && isTransitioning && !hasTransitionAnimated.current) {
      hasTransitionAnimated.current = true
      
      // Animate this slide to screen center - check if mobile for direction
      const isMobile = window.innerWidth <= 768
      gsap.to(meshRef.current.position, {
        x: isMobile ? 0 : 0, // Always center x
        y: isMobile ? 0 : 0, // Always center y
        z: position[2] + (isClicked ? 0.01 : -0.01), // Very minimal z difference
        duration: 1.5, // 25% faster (was 2s)
        ease: "power3.inOut" // Smoother easing
      })
    }
  }, [isTransitioning, isClicked, position])

  // Handle post-transition scaling for selected image
  useEffect(() => {
    
    if (meshRef.current && transitionComplete && isClicked && !hasScaleUpAnimated.current) {
      hasScaleUpAnimated.current = true
      // After transition completes, make the clicked slide larger using actual scale
      gsap.to(meshRef.current.scale, {
        x: 1.75,
        y: 1.75, 
        z: 1.75,
        duration: 0.6,
        ease: "power3.out",
        delay: 0.15,
        onComplete: () => {}
      })
    }
  }, [transitionComplete, isClicked, position])
  
  // Reset opacity when transitioning back to slider
  useEffect(() => {
    if (!transitionComplete && !isTransitioning && opacity.current < 1) {
      opacity.current = 1
      if (material.uniforms.uOpacity) {
        material.uniforms.uOpacity.value = 1
      }
      // Reset to first image when going back to slider
      if (onImageIndexChange) {
        onImageIndexChange(0)
      }
      transitionProgress.current = 0
      if (material.uniforms.uProgress) {
        material.uniforms.uProgress.value = 0
      }
      // Reset scale to normal size
      if (meshRef.current) {
        meshRef.current.scale.set(1, 1, 1)
      }
      // Reset animation flags
      hasTransitionAnimated.current = false
      hasScaleUpAnimated.current = false
      hasInitialExpanded.current = false
    }
  }, [transitionComplete, isTransitioning, material])
  
  // Reset scale up flag when scaling down for reset starts
  useEffect(() => {
    if (isScalingDownForReset && transitionComplete && isClicked) {
      hasScaleUpAnimated.current = false
    }
  }, [isScalingDownForReset, transitionComplete, isClicked])

  // Handle reverse scaling when back is clicked
  useEffect(() => {
    if (meshRef.current && isScalingDown && isClicked) {
      // Scale down the selected image back to normal size
      gsap.to(meshRef.current.position, {
        z: position[2] + 0.01, // Back to subtle forward position
        duration: 0.6, // 25% faster (was 0.8s)
        ease: "power3.inOut" // Smoother easing
      })
    }
  }, [isScalingDown, isClicked, position])

  // Handle scaling down for reset (when back button is clicked)
  useEffect(() => {
    if (meshRef.current && isScalingDownForReset && transitionComplete && isClicked) {
      
      // First, reset to original image if not already there
      if (currentImageIndex !== 0) {
        // Transition back to first image (cover image)
        if (material.uniforms.uTexture1 && material.uniforms.uTexture2 && galleryTextures) {
          material.uniforms.uTexture1.value = galleryTextures[currentImageIndex]
          material.uniforms.uTexture2.value = galleryTextures[0] // Cover image
          
          setIsImageTransitioning(true)
          
          // Start scale down animation parallel with image reset for smooth transition
          if (meshRef.current) {
            gsap.to(meshRef.current.scale, {
              x: 1,
              y: 1,
              z: 1,
              duration: 0.6, // Faster for more responsive feel
              ease: "power3.out", // Smoother easing
              overwrite: 'auto', // Allow interruption
              onComplete: () => {}
            })
          }
          
          gsap.to(transitionProgress, {
            current: 1,
            duration: 0.4,
            ease: "power2.inOut",
            onUpdate: () => {
              if (material.uniforms.uProgress) {
                material.uniforms.uProgress.value = transitionProgress.current
              }
            },
            onComplete: () => {
              if (onImageIndexChange) {
                onImageIndexChange(0)
              }
              if (material.uniforms.uTexture1) {
                material.uniforms.uTexture1.value = galleryTextures[0]
              }
              if (material.uniforms.uProgress) {
                material.uniforms.uProgress.value = 0
              }
              transitionProgress.current = 0
              setIsImageTransitioning(false)
            }
          })
        }
      } else {
        // Already on first image, just do the scale down animation
        gsap.to(meshRef.current.scale, {
          x: 1,
          y: 1,
          z: 1,
          duration: 0.6,
          ease: "power3.out",
          overwrite: 'auto', // Allow interruption
          onComplete: () => {}
        })
      }
    }
  }, [isScalingDownForReset, transitionComplete, isClicked, position, currentImageIndex, material, galleryTextures])


  // Handle initial expand animation (from center to normal positions)
  useEffect(() => {
    if (meshRef.current && isInitialExpanding && !hasInitialExpanded.current) {
      hasInitialExpanded.current = true
      
      // Check if this is the selected project 
      const isSelectedProject = selectedProject && selectedProject.name === projectData.name
      // Selected project animates from scale-down position to subtle forward position, others to normal
      const finalZ = isSelectedProject ? position[2] + 0.01 : position[2]
      
      
      // Start animation immediately with no delay to prevent gaps
      gsap.to(meshRef.current.position, {
        x: position[0], // Should be 0 for mobile
        y: position[1], // Should be the vertical offset for mobile
        z: finalZ, // Reset to normal positions after animation
        duration: 1.2, // Faster for more responsive feel
        ease: "power3.out", // Smoother easing
        overwrite: 'auto', // Allow interruption if user starts dragging
        delay: Math.random() * 0.1 // Reduced delay for faster feel
      })
    }
  }, [isInitialExpanding, position, selectedProject, projectData, isScalingDown, isMobile])

  // Calculate render position - if expanding or returning from gallery, start at center
  const getRenderPosition = () => {
    if (isInitialExpanding || isReturningFromGallery) {
      const isSelectedProject = selectedProject && selectedProject.name === projectData.name
      // Start selected image at scale-down end position (slightly above normal) to prevent jump
      const zPosition = isSelectedProject ? position[2] + 0.02 : position[2]
      // Always start from center (0,0) for both mobile and desktop
      return [0, 0, zPosition]
    }
    return position
  }

  return (
    <mesh 
      ref={meshRef} 
      position={getRenderPosition()} 
      material={material}
      renderOrder={-1}
      visible={true}
      onPointerEnter={() => {
        if (!transitionComplete && onHover) {
          onHover(projectData)
        }
      }}
      onPointerLeave={() => {
        if (!transitionComplete && onHover) {
          onHover(null)
        }
        // Reset cursor
        document.body.style.cursor = 'auto'
      }}
      onClick={(e) => {
        if (transitionComplete && isClicked) {
          // Gallery navigation is now handled at document level
          // This prevents mesh click from interfering
          e.stopPropagation()
        } else if (!transitionComplete && onClick) {
          onClick(projectData)
        }
      }}
      onPointerDown={(e) => {
        // Stop propagation to prevent drag interference on click
        if (!transitionComplete && onClick || (transitionComplete && isClicked)) {
          e.stopPropagation()
        }
      }}
      onTouchStart={(e) => {
        // Ensure touch events work on mobile - don't interfere with click detection
        if (!transitionComplete) {
          e.stopPropagation() // Prevent canvas drag from interfering
        }
      }}
      onTouchEnd={(e) => {
        // Handle touch end for mobile clicks
        if (onTouchEnd) {
          e.stopPropagation() // Prevent canvas drag from interfering
          onTouchEnd(projectData, e)
        }
      }}
      onPointerUp={(e) => {
        // Handle pointer up for cross-platform support
        if (onPointerUp) {
          e.stopPropagation() // Prevent canvas drag from interfering
          onPointerUp(projectData, e)
        }
      }}
    >
      <planeGeometry args={isMobile ? [2, 2, 32, 32] : [3, 3, 32, 32]} />
    </mesh>
  )
}

export default function WebGLSlider({ projects, onHover, onTransitionComplete, onTransitionStart, selectedProject, isScalingDownForReset, initialOffset = 0, currentImageIndex: externalCurrentImageIndex, onImageIndexChange, isReturningFromGallery = false, hasPlayedIntroAnimation = false, waterRef }) {
  const { gl } = useThree()
  const [offset, setOffset] = useState(initialOffset)
  const containerRef = useRef()
  const isDragging = useRef(false)
  const hasDraggedEnough = useRef(false) // Track if drag distance is significant
  const dragStart = useRef({ x: 0, y: 0, offset: 0 })
  const velocity = useRef(0)
  const targetOffset = useRef(initialOffset)
  const currentOffset = useRef(initialOffset) // Smooth interpolated value
  const sliderSpeed = useRef(0) // Track actual slider movement speed
  const lastOffset = useRef(initialOffset) // Track last offset for speed calculation
  const smoothedSpeed = useRef(0) // Extra smoothing layer for direction changes
  const lastMoveTime = useRef(0)
  const lastMouseX = useRef(0)
  const lastMouseY = useRef(0)
  const [isMobile, setIsMobile] = useState(() => {
    // Initialize correctly on first render to prevent double flash
    return typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  })
  const [hoveredSlide, setHoveredSlide] = useState(null)
  const [clickedSlide, setClickedSlide] = useState(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [hiddenSlides, setHiddenSlides] = useState(new Set())
  const [transitionComplete, setTransitionComplete] = useState(false)
  const [isInitialExpanding, setIsInitialExpanding] = useState(false)
  const [isScalingDown, setIsScalingDown] = useState(selectedProject ? true : false)
  const [sliderOpacity, setSliderOpacity] = useState(hasPlayedIntroAnimation ? 1 : 0)
  
  // Load cover textures from projects data
  const coverImages = projects.map(project => project.images[0].src)
  const textures = useTexture(coverImages)

  // Configure textures to maintain aspect ratio
  useEffect(() => {
    textures.forEach(texture => {
      texture.generateMipmaps = false
      texture.wrapS = THREE.ClampToEdgeWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
    })
  }, [textures])

  const itemWidth = isMobile ? 2.3 : 3.5 // Smaller spacing for mobile to match smaller images
  const totalItems = textures.length
  const totalWidth = totalItems * itemWidth

  // Check if mobile only on resize (not on mount to prevent double flash)
  useEffect(() => {
    const checkMobile = () => {
      const newIsMobile = window.innerWidth <= 768
      if (newIsMobile !== isMobile) {
        setIsMobile(newIsMobile)
      }
    }
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [isMobile])

  // Handle return from gallery - only activate animation when explicitly returning
  useEffect(() => {
    if (isReturningFromGallery && !isInitialExpanding) {
      setIsInitialExpanding(true)
    }
  }, [isReturningFromGallery, isInitialExpanding])

  // Start fade-in only on first page load (not returning from gallery)
  useEffect(() => {
    if (!hasPlayedIntroAnimation && !isReturningFromGallery && !selectedProject && !isTransitioning && !transitionComplete) {
      // Start fade-in animation only on first load
      setTimeout(() => {
        setSliderOpacity(1)
      }, 100) // Small delay for smooth start
    } else {
      // If returning from gallery or animation already played, show immediately without animation
      setSliderOpacity(1)
    }
  }, [hasPlayedIntroAnimation, isReturningFromGallery, selectedProject, isTransitioning, transitionComplete])

  useEffect(() => {
    if (onHover) {
      onHover(hoveredSlide)
    }
  }, [hoveredSlide, onHover])

  // Handle slide click - all slides move to screen center, then remove others
  const handleSlideClick = (projectData) => {
    // Block if transitioning
    if (isTransitioning) {
      return
    }
    
    // Refined drag detection: only block if significant drag occurred
    if (hasDraggedEnough.current) {
      return
    }
    
    // Trigger UI fade-out
    if (onTransitionStart) {
      onTransitionStart()
    }
    
    setClickedSlide(projectData)
    setIsTransitioning(true)
    
    // Stop all slider movement
    velocity.current = 0
    targetOffset.current = currentOffset.current // Stop the slider where it is
    sliderSpeed.current = 0 // Immediately set speed to 0 for smooth shader fade
    
    // After 1.5 seconds, hide all slides except the clicked one and complete transition
    setTimeout(() => {
      const newHiddenSlides = new Set()
      projects.forEach(project => {
        if (project.name !== projectData.name) {
          newHiddenSlides.add(project.name)
        }
      })
      setHiddenSlides(newHiddenSlides)
      
      // Mark transition as complete to disable all slider effects
      setTimeout(() => {
        setTransitionComplete(true)
        // Notify parent component about transition completion
        if (onTransitionComplete) {
          onTransitionComplete(projectData, true)
        }
      }, 100) // Small delay to let slides disappear
    }, 1500) // 25% faster (was 2000ms)
  }

  // Handle touch end specifically for mobile clicks
  const handleTouchEnd = (projectData, e) => {
    if (!isTransitioning && !transitionComplete) {
      handleSlideClick(projectData)
    }
  }

  // Handle pointer events for better cross-platform support
  const handlePointerUp = (projectData, e) => {
    if (!isTransitioning && !transitionComplete) {
      handleSlideClick(projectData)
    }
  }

  // Handle initial expand animation - slides start at center and expand out
  useEffect(() => {
    if (isInitialExpanding) {
      
      // Simple timer - always 3 seconds total regardless of other states
      const timer = setTimeout(() => {
        setIsInitialExpanding(false)
      }, 2250) // 25% faster (was 3000ms)
      
      return () => clearTimeout(timer)
    }
  }, [isInitialExpanding]) // Remove other dependencies to prevent re-triggers

  // Handle scaling down completion
  useEffect(() => {
    if (isScalingDown) {
      // After scale-down animation completes, stop scaling down
      const timer = setTimeout(() => {
        setIsScalingDown(false)
      }, 600) // Match the scale-down animation duration (25% faster)
      
      return () => clearTimeout(timer)
    }
  }, [isScalingDown]) // Remove selectedProject dependency

  // Smooth interpolation with easing - much smoother than direct animations
  useFrame(() => {
    if (!isTransitioning && !transitionComplete && !isInitialExpanding && !isScalingDown) {
      // Smooth interpolation between current and target
      const ease = 0.05 // Reduced from 0.075 for smoother, more controlled movement
      currentOffset.current += (targetOffset.current - currentOffset.current) * ease
      
      // Calculate actual slider speed (difference between frames)
      const speedDiff = currentOffset.current - lastOffset.current
      const rawSpeed = speedDiff * 60 // Multiply by 60 for consistent speed regardless of framerate
      
      // Apply extra smoothing for direction changes
      // Only treat as direction change if both values are non-zero and have different signs
      const hasDirectionChange = smoothedSpeed.current !== 0 && rawSpeed !== 0 && Math.sign(rawSpeed) !== Math.sign(smoothedSpeed.current)
      const speedEase = hasDirectionChange ? 0.06 : 0.1
      smoothedSpeed.current += (rawSpeed - smoothedSpeed.current) * speedEase
      
      // Safeguard against NaN or extreme values
      if (isNaN(smoothedSpeed.current) || Math.abs(smoothedSpeed.current) > 10) {
        smoothedSpeed.current = 0
      }
      
      sliderSpeed.current = smoothedSpeed.current
      lastOffset.current = currentOffset.current
      
      // Apply velocity-based momentum
      if (!isDragging.current) {
        velocity.current *= 0.88 // Higher friction for faster shader fade-out
        targetOffset.current += velocity.current * 0.3 // Reduce momentum impact
      }
      
      // Only update state if there's significant change
      if (Math.abs(currentOffset.current - offset) > 0.001) {
        setOffset(currentOffset.current)
      }
    }
  })

  useEffect(() => {
    const canvas = gl.domElement

    const handleMouseDown = (e) => {
      if (isTransitioning || transitionComplete || isInitialExpanding) return // Block during transition and expand
      
      e.preventDefault() // Prevent default touch behavior
      
      isDragging.current = true
      hasDraggedEnough.current = false // Reset drag distance check
      velocity.current = 0
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      
      // Start water effect interaction
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(clientX, clientY, true)
      }
      
      dragStart.current = {
        x: clientX,
        y: clientY,
        offset: targetOffset.current, // Use target offset for smooth continuation
        time: Date.now() // Track start time
      }
      lastMouseX.current = clientX
      lastMouseY.current = clientY
      lastMoveTime.current = Date.now()
      canvas.style.cursor = 'grabbing'
    }

    const handleMouseMove = (e) => {
      if (!isDragging.current) return
      
      e.preventDefault() // Prevent default touch behavior
      const currentTime = Date.now()
      const deltaTime = currentTime - lastMoveTime.current
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      
      // Update water effect with touch/mouse position
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(clientX, clientY, true)
      }
      
      const minDragDistance = isMobile ? 20 : 10 // Higher threshold for mobile, lower for desktop
      
      if (isMobile) {
        // Vertical movement on mobile
        const deltaY = clientY - lastMouseY.current
        const totalDeltaY = clientY - dragStart.current.y
        
        // Check if dragged enough in the correct direction (vertical for mobile)
        const totalDeltaX = clientX - dragStart.current.x
        const isDragIntentional = Math.abs(totalDeltaY) > Math.abs(totalDeltaX) * 0.7 // Mostly vertical movement
        
        if (Math.abs(totalDeltaY) > minDragDistance && isDragIntentional) {
          hasDraggedEnough.current = true
        }
        
        if (deltaTime > 0) {
          velocity.current = deltaY * 0.02 // Reduced from 0.05 for smoother movement
        }
        const dragSpeed = 0.8 // Reduced from 2 for smoother drag
        targetOffset.current = dragStart.current.offset + totalDeltaY * 0.01 * dragSpeed // Fixed: swipe up moves cards up
        lastMouseY.current = clientY
      } else {
        // Horizontal movement on desktop
        const deltaX = clientX - lastMouseX.current
        const totalDeltaX = clientX - dragStart.current.x
        
        // Check if dragged enough in the correct direction (horizontal for desktop)
        const totalDeltaY = clientY - dragStart.current.y
        const isDragIntentional = Math.abs(totalDeltaX) > Math.abs(totalDeltaY) * 0.7 // Mostly horizontal movement
        
        if (Math.abs(totalDeltaX) > minDragDistance && isDragIntentional) {
          hasDraggedEnough.current = true
        }
        
        if (deltaTime > 0) {
          velocity.current = -deltaX * 0.02 // Reduced from 0.05 for smoother movement
        }
        const dragSpeed = 0.8 // Reduced from 2 for smoother drag
        targetOffset.current = dragStart.current.offset - totalDeltaX * 0.01 * dragSpeed
        lastMouseX.current = clientX
      }
      
      lastMoveTime.current = currentTime
    }

    const handleMouseUp = () => {
      if (!isDragging.current) return
      
      isDragging.current = false
      canvas.style.cursor = 'grab'
      
      // Stop water effect interaction
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(0, 0, false)
      }
      
      // Time-based check: if interaction was very short, likely a tap/click
      const interactionTime = Date.now() - dragStart.current.time
      const wasQuickTap = interactionTime < 200 // Less than 200ms
      
      // Reset drag check with timing consideration
      if (wasQuickTap && !hasDraggedEnough.current) {
        // Quick tap without drag - definitely allow click
        hasDraggedEnough.current = false
      } else {
        // Longer interaction or with drag - use normal reset timing
        setTimeout(() => {
          hasDraggedEnough.current = false
        }, 50) // Short delay to prevent immediate clicks after drag
      }
      
      // Velocity is already being applied in the render loop
      // No need for additional animation
    }

    const handleMouseLeave = () => {
      if (isDragging.current) {
        handleMouseUp()
      }
    }

    const handleWheel = (e) => {
      if (isTransitioning || transitionComplete || isInitialExpanding || isScalingDown || isMobile) return // Disable scroll on mobile
      
      e.preventDefault()
      
      // Direct target update for instant response
      const scrollSpeed = 0.0002 // Extremely reduced for very gentle scrolling
      targetOffset.current += e.deltaY * scrollSpeed
      
      // Add velocity for shader deformation (separate from momentum)
      velocity.current = e.deltaY * 0.01 // Reduced shader intensity
    }

    canvas.style.cursor = 'grab'
    
    // Mouse events
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    
    // Touch events for mobile
    canvas.addEventListener('touchstart', handleMouseDown, { passive: false })
    window.addEventListener('touchmove', handleMouseMove, { passive: false })
    window.addEventListener('touchend', handleMouseUp, { passive: false })

    return () => {
      // Remove mouse events
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('wheel', handleWheel)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      
      // Remove touch events
      canvas.removeEventListener('touchstart', handleMouseDown)
      window.removeEventListener('touchmove', handleMouseMove)
      window.removeEventListener('touchend', handleMouseUp)
    }
  }, [offset, gl, isTransitioning, transitionComplete, isInitialExpanding, isScalingDown])

  // Create infinite slides - only show slides within viewport
  const slides = []
  const viewportWidth = window.innerWidth / 100 // Convert to Three.js units
  const visibleRange = Math.ceil(viewportWidth / itemWidth) + 1 // Reduce range

  // Calculate how many full cycles we need to show
  const cycleOffset = Math.floor(offset / totalWidth) * totalWidth
  const startIndex = Math.floor((offset - cycleOffset) / itemWidth) - visibleRange
  const endIndex = startIndex + visibleRange * 2 + totalItems

  for (let i = startIndex; i <= endIndex; i++) {
    const textureIndex = ((i % totalItems) + totalItems) % totalItems
    const position = isMobile 
      ? [0, cycleOffset + i * itemWidth - offset, 0] // Vertical on mobile
      : [cycleOffset + i * itemWidth - offset, 0, 0] // Horizontal on desktop
    
    // Only render slides that are within or close to viewport bounds
    if (isMobile) {
      // Vertical bounds check for mobile
      const slideTopEdge = position[1] - itemWidth/2
      const slideBottomEdge = position[1] + itemWidth/2
      const viewportTop = -viewportWidth/2
      const viewportBottom = viewportWidth/2
      
      if (slideBottomEdge < viewportTop - itemWidth || slideTopEdge > viewportBottom + itemWidth) {
        continue
      }
    } else {
      // Horizontal bounds check for desktop
      const slideLeftEdge = position[0] - itemWidth/2
      const slideRightEdge = position[0] + itemWidth/2
      const viewportLeft = -viewportWidth/2
      const viewportRight = viewportWidth/2
      
      if (slideRightEdge < viewportLeft - itemWidth || slideLeftEdge > viewportRight + itemWidth) {
        continue
      }
    }
    
    const isClicked = clickedSlide && clickedSlide.name === projects[textureIndex].name
    const projectName = projects[textureIndex].name
    const shouldHide = hiddenSlides.has(projectName)
    
    if (!shouldHide) {
      slides.push(
        <SlideItem
          key={`slide-${i}-${Math.floor(offset / totalWidth)}`}
          texture={textures[textureIndex]}
          position={position}
          velocity={velocity.current}
          sliderSpeed={sliderSpeed.current}
          projectData={projects[textureIndex]}
          onHover={setHoveredSlide}
          onClick={handleSlideClick}
          onTouchEnd={handleTouchEnd}
          onPointerUp={handlePointerUp}
          isClicked={isClicked}
          isTransitioning={isTransitioning}
          shouldHide={shouldHide}
          transitionComplete={transitionComplete}
          isInitialExpanding={isInitialExpanding}
          selectedProject={selectedProject}
          isScalingDown={isScalingDown}
          isScalingDownForReset={isScalingDownForReset}
          isMobile={isMobile}
          externalCurrentImageIndex={externalCurrentImageIndex}
          onImageIndexChange={onImageIndexChange}
          isReturningFromGallery={isReturningFromGallery}
          sliderOpacity={sliderOpacity}
        />
      )
    }
  }

  return (
    <group ref={containerRef}>
      {slides}
    </group>
  )
}