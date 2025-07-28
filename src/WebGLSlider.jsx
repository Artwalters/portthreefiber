import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'

const SlideItem = ({ texture, position, velocity, projectData, onHover, onClick, onTouchEnd, onPointerUp, isClicked, isTransitioning, shouldHide, transitionComplete, isInitialExpanding, selectedProject, isScalingDown, isScalingDownForReset, isMobile }) => {
  const meshRef = useRef()
  const hasAnimated = useRef(false)
  const hasInitialExpanded = useRef(false)
  
  // Simple shader material with curve deformation
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: texture },
      uVelo: { value: 0 },
      uIsMobile: { value: isMobile ? 1.0 : 0.0 }
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
          // Vertical deformation for mobile - reversed direction
          pos.y = pos.y - ((sin(uv.x * M_PI) * uVelo) * 0.125);
        } else {
          // Horizontal deformation for desktop - reversed direction
          pos.x = pos.x - ((sin(uv.y * M_PI) * uVelo) * 0.125);
        }
        
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform sampler2D uTexture;
      varying vec2 vUv;
      
      void main() {
        // Use original UV coordinates since both texture and geometry are square
        vec4 color = texture2D(uTexture, vUv);
        gl_FragColor = color;
      }
    `,
    side: THREE.DoubleSide
  })

  // Update velocity uniform and position - disabled after transition complete
  useFrame(() => {
    if (!transitionComplete && meshRef.current && material.uniforms && material.uniforms.uVelo) {
      material.uniforms.uVelo.value = velocity
    }
    
    // Handle normal positioning only when not expanding and not transitioning
    if (meshRef.current && !isTransitioning && !transitionComplete && !isInitialExpanding && !isScalingDown) {
      // Check if this is the selected project for subtle z-positioning
      const isSelectedProject = selectedProject && selectedProject.name === projectData.name
      const zPosition = isSelectedProject ? position[2] + 0.01 : position[2]
      
      meshRef.current.position.set(position[0], position[1], zPosition)
      hasAnimated.current = false
    }
  })

  // Handle transition animation (only once when transition starts)
  useEffect(() => {
    if (meshRef.current && isTransitioning && !hasAnimated.current) {
      hasAnimated.current = true
      
      // Animate this slide to screen center - check if mobile for direction
      const isMobile = window.innerWidth <= 768
      gsap.to(meshRef.current.position, {
        x: isMobile ? 0 : 0, // Always center x
        y: isMobile ? 0 : 0, // Always center y
        z: position[2] + (isClicked ? 0.01 : -0.01), // Very minimal z difference
        duration: 2,
        ease: "power2.inOut"
      })
    }
  }, [isTransitioning, isClicked, position])

  // Handle post-transition scaling for selected image
  useEffect(() => {
    if (meshRef.current && transitionComplete && isClicked) {
      // After transition completes, make the clicked slide larger by moving it forward
      // This creates a 1.5x scale effect through perspective
      gsap.to(meshRef.current.position, {
        z: position[2] + 1, // Move significantly forward for 1.5x effect
        duration: 0.8,
        ease: "power2.out",
        delay: 0.2 // Small delay after transition completes
      })
    }
  }, [transitionComplete, isClicked, position])

  // Handle reverse scaling when back is clicked
  useEffect(() => {
    if (meshRef.current && isScalingDown && isClicked) {
      // Scale down the selected image back to normal size
      gsap.to(meshRef.current.position, {
        z: position[2] + 0.01, // Back to subtle forward position
        duration: 0.8,
        ease: "power2.inOut"
      })
    }
  }, [isScalingDown, isClicked, position])

  // Handle scaling down for reset (when back button is clicked)
  useEffect(() => {
    if (meshRef.current && isScalingDownForReset && transitionComplete && isClicked) {
      const isMobile = window.innerWidth <= 768
      // Move to center for both mobile and desktop
      gsap.to(meshRef.current.position, {
        x: 0, // Always center x
        y: 0, // Always center y
        // Keep z at +1 to maintain size during transition
        duration: 0.8,
        ease: "power2.inOut"
      })
    }
  }, [isScalingDownForReset, transitionComplete, isClicked, position])


  // Handle initial expand animation (from center to normal positions)
  useEffect(() => {
    if (meshRef.current && isInitialExpanding && !hasInitialExpanded.current) {
      hasInitialExpanded.current = true
      
      // Check if this is the selected project 
      const isSelectedProject = selectedProject && selectedProject.name === projectData.name
      // Selected project animates from +1 to subtle forward position, others to normal
      const finalZ = isSelectedProject ? position[2] + 0.01 : position[2]
      
      // Debug log to see positions
      if (isMobile) {
        console.log('Mobile expand animation to:', position[0], position[1], 'for', projectData.name)
      }
      
      // Start animation immediately with no delay to prevent gaps
      gsap.to(meshRef.current.position, {
        x: position[0], // Should be 0 for mobile
        y: position[1], // Should be the vertical offset for mobile
        z: finalZ, // Reset to normal positions after animation
        duration: 2,
        ease: "power2.inOut",
        delay: Math.random() * 0.2 // Small random delay for natural effect
      })
    }
  }, [isInitialExpanding, position, selectedProject, projectData, isScalingDown, isMobile])

  // Calculate render position - if expanding, start at center
  const getRenderPosition = () => {
    if (isInitialExpanding) {
      const isSelectedProject = selectedProject && selectedProject.name === projectData.name
      // Start selected image at same z as scale-down end position to prevent jump
      const zPosition = isSelectedProject ? position[2] + 1 : position[2]
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
      onPointerEnter={() => !transitionComplete && onHover && onHover(projectData)}
      onPointerLeave={() => !transitionComplete && onHover && onHover(null)}
      onClick={() => !transitionComplete && onClick && onClick(projectData)}
      onPointerDown={(e) => {
        // Stop propagation to prevent drag interference on click
        if (!transitionComplete && onClick) {
          e.stopPropagation()
        }
      }}
      onTouchStart={(e) => {
        // Ensure touch events work on mobile
        if (!transitionComplete && onClick) {
          e.stopPropagation()
        }
      }}
      onTouchEnd={(e) => {
        // Handle touch end for mobile clicks
        if (onTouchEnd) {
          onTouchEnd(projectData, e)
        }
      }}
      onPointerUp={(e) => {
        // Handle pointer up for cross-platform support
        if (onPointerUp) {
          onPointerUp(projectData, e)
        }
      }}
    >
      <planeGeometry args={isMobile ? [2, 2, 32, 32] : [3, 3, 32, 32]} />
    </mesh>
  )
}

export default function WebGLSlider({ onHover, onTransitionComplete, selectedProject, isScalingDownForReset, initialOffset = 0 }) {
  const { gl } = useThree()
  const [offset, setOffset] = useState(initialOffset)
  const containerRef = useRef()
  const isDragging = useRef(false)
  const hasDraggedEnough = useRef(false) // Track if drag distance is significant
  const dragStart = useRef({ x: 0, y: 0, offset: 0 })
  const velocity = useRef(0)
  const targetOffset = useRef(initialOffset)
  const currentOffset = useRef(initialOffset) // Smooth interpolated value
  const lastMoveTime = useRef(0)
  const lastMouseX = useRef(0)
  const lastMouseY = useRef(0)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768) // Initialize correctly
  const [hoveredSlide, setHoveredSlide] = useState(null)
  const [clickedSlide, setClickedSlide] = useState(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [hiddenSlides, setHiddenSlides] = useState(new Set())
  const [transitionComplete, setTransitionComplete] = useState(false)
  const [isInitialExpanding, setIsInitialExpanding] = useState(true)
  const [isScalingDown, setIsScalingDown] = useState(selectedProject ? true : false)
  
  // Load textures with correct paths for GitHub Pages
  const textures = useTexture([
    './img/project-1.png',
    './img/project-2.png',
    './img/project-3.png',
    './img/project-4.png',
    './img/project-5.png',
    './img/project-6.png',
    './img/project-7.png'
  ])

  // Configure textures to maintain aspect ratio
  useEffect(() => {
    textures.forEach(texture => {
      texture.generateMipmaps = false
      texture.wrapS = THREE.ClampToEdgeWrap
      texture.wrapT = THREE.ClampToEdgeWrap
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
    })
  }, [textures])

  const itemWidth = isMobile ? 2.3 : 3.5 // Smaller spacing for mobile to match smaller images
  const totalItems = textures.length
  const totalWidth = totalItems * itemWidth

  // Project data
  const projects = [
    { name: 'project-1', description: 'Interactive web experience with modern UI' },
    { name: 'project-2', description: 'E-commerce platform with seamless checkout' },
    { name: 'project-3', description: 'Creative portfolio showcasing visual identity' },
    { name: 'project-4', description: 'Mobile app with intuitive user interface' },
    { name: 'project-5', description: 'Brand identity and logo design system' },
    { name: 'project-6', description: 'Digital marketing campaign visualization' },
    { name: 'project-7', description: 'Art installation with interactive elements' }
  ]

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (onHover) {
      onHover(hoveredSlide)
    }
  }, [hoveredSlide, onHover])

  // Handle slide click - all slides move to screen center, then remove others
  const handleSlideClick = (projectData) => {
    // Only block click if we've actually dragged a significant distance
    if (hasDraggedEnough.current || isTransitioning) return
    
    console.log('Slide clicked:', projectData.name) // Debug log
    
    setClickedSlide(projectData)
    setIsTransitioning(true)
    
    // Stop all slider movement
    velocity.current = 0
    
    // After 2 seconds, hide all slides except the clicked one and complete transition
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
    }, 2000)
  }

  // Handle touch end specifically for mobile clicks
  const handleTouchEnd = (projectData, e) => {
    // Only trigger click if we haven't dragged significantly
    if (!hasDraggedEnough.current && !isTransitioning && !transitionComplete) {
      e.preventDefault()
      e.stopPropagation()
      console.log('Touch end triggered for:', projectData.name) // Debug log
      handleSlideClick(projectData)
    }
  }

  // Handle pointer events for better cross-platform support
  const handlePointerUp = (projectData, e) => {
    // Only trigger click if we haven't dragged significantly and it's not already transitioning
    if (!hasDraggedEnough.current && !isTransitioning && !transitionComplete) {
      e.preventDefault()
      e.stopPropagation()
      console.log('Pointer up triggered for:', projectData.name) // Debug log
      handleSlideClick(projectData)
    }
  }

  // Handle initial expand animation - slides start at center and expand out
  useEffect(() => {
    if (isInitialExpanding) {
      console.log('Starting initial expand animation')
      
      // Simple timer - always 3 seconds total regardless of other states
      const timer = setTimeout(() => {
        console.log('Setting isInitialExpanding to false - slider should be navigatable now')
        setIsInitialExpanding(false)
      }, 3000) // Fixed 3 second delay
      
      return () => clearTimeout(timer)
    }
  }, [isInitialExpanding]) // Remove other dependencies to prevent re-triggers

  // Handle scaling down completion
  useEffect(() => {
    if (isScalingDown) {
      console.log('Starting scale down timer')
      // After scale-down animation completes, stop scaling down
      const timer = setTimeout(() => {
        console.log('Scale down complete')
        setIsScalingDown(false)
      }, 800) // Match the scale-down animation duration
      
      return () => clearTimeout(timer)
    }
  }, [isScalingDown]) // Remove selectedProject dependency

  // Smooth interpolation with easing - much smoother than direct animations
  useFrame(() => {
    if (!isTransitioning && !transitionComplete && !isInitialExpanding && !isScalingDown) {
      // Smooth interpolation between current and target
      const ease = 0.075 // Same as reference slider
      currentOffset.current += (targetOffset.current - currentOffset.current) * ease
      
      // Apply velocity-based momentum
      if (!isDragging.current) {
        velocity.current *= 0.95 // Friction
        targetOffset.current += velocity.current
      }
      
      // Only update state if there's significant change
      if (Math.abs(currentOffset.current - offset) > 0.001) {
        setOffset(currentOffset.current)
      }
    }
  })

  useEffect(() => {
    if (transitionComplete) return // Don't add event listeners after transition complete
    
    const canvas = gl.domElement

    const handleMouseDown = (e) => {
      if (isTransitioning || transitionComplete || isInitialExpanding || isScalingDown) return // Disable drag during expand
      
      e.preventDefault() // Prevent default touch behavior
      
      isDragging.current = true
      hasDraggedEnough.current = false // Reset drag distance check
      velocity.current = 0
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
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
      
      const minDragDistance = 15 // Minimum pixels to consider it a drag (increased for better touch detection)
      
      if (isMobile) {
        // Vertical movement on mobile
        const deltaY = clientY - lastMouseY.current
        const totalDeltaY = clientY - dragStart.current.y
        
        // Check if dragged enough
        if (Math.abs(totalDeltaY) > minDragDistance) {
          hasDraggedEnough.current = true
        }
        
        if (deltaTime > 0) {
          velocity.current = -deltaY * 0.05 // Reversed: added negative sign back
        }
        const dragSpeed = 2
        targetOffset.current = dragStart.current.offset - totalDeltaY * 0.01 * dragSpeed // Reversed: changed plus back to minus
        lastMouseY.current = clientY
      } else {
        // Horizontal movement on desktop
        const deltaX = clientX - lastMouseX.current
        const totalDeltaX = clientX - dragStart.current.x
        
        // Check if dragged enough
        if (Math.abs(totalDeltaX) > minDragDistance) {
          hasDraggedEnough.current = true
        }
        
        if (deltaTime > 0) {
          velocity.current = -deltaX * 0.05 // Calculate velocity for momentum
        }
        const dragSpeed = 2
        targetOffset.current = dragStart.current.offset - totalDeltaX * 0.01 * dragSpeed
        lastMouseX.current = clientX
      }
      
      lastMoveTime.current = currentTime
    }

    const handleMouseUp = () => {
      if (!isDragging.current) return
      
      isDragging.current = false
      canvas.style.cursor = 'grab'
      
      // Reset drag check after a short delay to allow for quick taps
      setTimeout(() => {
        if (!isDragging.current) {
          hasDraggedEnough.current = false
        }
      }, 100)
      
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
      const scrollSpeed = 0.01
      targetOffset.current += e.deltaY * scrollSpeed
      
      // Add small velocity for natural momentum
      velocity.current = e.deltaY * scrollSpeed * 0.5
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
  }, [offset, gl, transitionComplete, isInitialExpanding, isScalingDown])

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
        />
      )
    }
  }

  return (
    <group ref={containerRef}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      {slides}
    </group>
  )
}