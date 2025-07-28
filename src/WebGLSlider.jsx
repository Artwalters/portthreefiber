import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'

const SlideItem = ({ texture, position, velocity, projectData, onHover, onClick, isClicked, isTransitioning, shouldHide, transitionComplete }) => {
  const meshRef = useRef()
  const hasAnimated = useRef(false)
  
  // Use same shader material but without velocity effect after transition complete
  const material = transitionComplete 
    ? new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: texture },
          uVelo: { value: 0 } // Always 0 after transition
        },
        vertexShader: `
          precision mediump float;
          uniform float uVelo;
          varying vec2 vUv;
          
          void main(){
            vec3 pos = position;
            // No curve deformation after transition (uVelo is always 0)
            
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          uniform sampler2D uTexture;
          varying vec2 vUv;
          
          void main() {
            // Keep same texture rendering as during slider
            vec2 uv = vUv;
            
            // Calculate aspect ratios
            vec2 textureSize = vec2(1.0, 1.0);
            vec2 planeSize = vec2(1.0, 1.0);
            
            // Center the UV coordinates and scale to cover
            vec2 ratio = vec2(
              min(planeSize.x / textureSize.x, planeSize.y / textureSize.y),
              max(planeSize.x / textureSize.x, planeSize.y / textureSize.y)
            );
            
            uv = (uv - 0.5) * (textureSize / planeSize) + 0.5;
            
            vec4 texture = texture2D(uTexture, uv);
            gl_FragColor = texture;
          }
        `,
        side: THREE.DoubleSide
      })
    : new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: texture },
          uVelo: { value: 0 }
        },
        vertexShader: `
          precision mediump float;
          uniform float uVelo;
          varying vec2 vUv;
          
          #define M_PI 3.1415926535897932384626433832795
          
          void main(){
            vec3 pos = position;
            pos.x = pos.x + ((sin(uv.y * M_PI) * uVelo) * 0.125);
            
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          uniform sampler2D uTexture;
          varying vec2 vUv;
          
          void main() {
            // Center and crop the texture to maintain aspect ratio (cover behavior)
            vec2 uv = vUv;
            
            // Calculate aspect ratios
            vec2 textureSize = vec2(1.0, 1.0); // Assume square texture for now
            vec2 planeSize = vec2(1.0, 1.0); // Our plane is now square
            
            // Center the UV coordinates and scale to cover
            vec2 ratio = vec2(
              min(planeSize.x / textureSize.x, planeSize.y / textureSize.y),
              max(planeSize.x / textureSize.x, planeSize.y / textureSize.y)
            );
            
            uv = (uv - 0.5) * (textureSize / planeSize) + 0.5;
            
            vec4 texture = texture2D(uTexture, uv);
            gl_FragColor = texture;
          }
        `,
        side: THREE.DoubleSide
      })

  // Update velocity uniform and position - disabled after transition complete
  useFrame(() => {
    if (!transitionComplete && meshRef.current && material.uniforms && material.uniforms.uVelo) {
      material.uniforms.uVelo.value = velocity
    }
    
    // Set normal position when not transitioning and not complete
    if (meshRef.current && !isTransitioning && !transitionComplete) {
      meshRef.current.position.set(position[0], position[1], position[2])
      hasAnimated.current = false
    }
  })

  // Handle transition animation (only once when transition starts)
  useEffect(() => {
    if (meshRef.current && isTransitioning && !hasAnimated.current) {
      hasAnimated.current = true
      
      // Animate this slide to screen center (x = 0) - very subtle z difference
      gsap.to(meshRef.current.position, {
        x: 0,
        y: position[1],
        z: position[2] + (isClicked ? 0.01 : -0.01), // Very minimal z difference
        duration: 2,
        ease: "power2.inOut"
      })
    }
  }, [isTransitioning, isClicked, position])

  return (
    <mesh 
      ref={meshRef} 
      position={position} 
      material={material}
      onPointerEnter={() => !transitionComplete && onHover && onHover(projectData)}
      onPointerLeave={() => !transitionComplete && onHover && onHover(null)}
      onClick={() => !transitionComplete && onClick && onClick(projectData)}
    >
      <planeGeometry args={[3, 3, 32, 32]} />
    </mesh>
  )
}

export default function WebGLSlider({ onHover }) {
  const { gl } = useThree()
  const [offset, setOffset] = useState(0)
  const containerRef = useRef()
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, offset: 0 })
  const velocity = useRef(0)
  const targetOffset = useRef(0)
  const lastMoveTime = useRef(0)
  const lastMouseX = useRef(0)
  const [hoveredSlide, setHoveredSlide] = useState(null)
  const [clickedSlide, setClickedSlide] = useState(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [hiddenSlides, setHiddenSlides] = useState(new Set())
  const [transitionComplete, setTransitionComplete] = useState(false)
  
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

  const itemWidth = 3.5
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

  useEffect(() => {
    if (onHover) {
      onHover(hoveredSlide)
    }
  }, [hoveredSlide, onHover])

  // Handle slide click - all slides move to screen center, then remove others
  const handleSlideClick = (projectData) => {
    if (isDragging.current || isTransitioning) return
    
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
      }, 100) // Small delay to let slides disappear
    }, 2000)
  }

  // Smooth animation loop - disabled when transitioning or complete
  useFrame(() => {
    if (!isDragging.current && !isTransitioning && !transitionComplete) {
      // Apply momentum/inertia with smoother friction
      velocity.current *= 0.98 // less friction for longer momentum
      targetOffset.current += velocity.current
      
      // Much smoother interpolation
      const diff = targetOffset.current - offset
      if (Math.abs(diff) > 0.0001) {
        setOffset(offset + diff * 0.15) // faster interpolation
      }
      
      // Stop very small movements
      if (Math.abs(velocity.current) < 0.0001) {
        velocity.current = 0
      }
    }
  })

  useEffect(() => {
    if (transitionComplete) return // Don't add event listeners after transition complete
    
    const canvas = gl.domElement

    const handleMouseDown = (e) => {
      if (isTransitioning || transitionComplete) return // Disable drag when transitioning or complete
      
      isDragging.current = true
      velocity.current = 0
      dragStart.current = {
        x: e.clientX,
        offset: offset
      }
      lastMouseX.current = e.clientX
      lastMoveTime.current = Date.now()
      targetOffset.current = offset
      canvas.style.cursor = 'grabbing'
    }

    const handleMouseMove = (e) => {
      if (!isDragging.current) return
      
      const currentTime = Date.now()
      const deltaTime = currentTime - lastMoveTime.current
      const deltaX = e.clientX - lastMouseX.current
      
      if (deltaTime > 0) {
        velocity.current = -deltaX * 0.002 / deltaTime * 16 // more responsive velocity
      }
      
      const totalDeltaX = e.clientX - dragStart.current.x
      const dragSensitivity = 0.008 // smoother drag sensitivity
      const newOffset = dragStart.current.offset - totalDeltaX * dragSensitivity
      
      setOffset(newOffset)
      targetOffset.current = newOffset
      
      lastMouseX.current = e.clientX
      lastMoveTime.current = currentTime
    }

    const handleMouseUp = () => {
      if (!isDragging.current) return
      
      isDragging.current = false
      canvas.style.cursor = 'grab'
      
      // Apply momentum based on final velocity
      velocity.current *= 3 // stronger momentum for smoother feel
    }

    const handleMouseLeave = () => {
      if (isDragging.current) {
        handleMouseUp()
      }
    }

    const handleWheel = (e) => {
      if (isTransitioning || transitionComplete) return // Disable scroll when transitioning or complete
      
      e.preventDefault()
      const scrollSensitivity = 0.0015 // smoother scroll sensitivity
      
      // Add to velocity for smooth scroll with easing
      const scrollVelocity = e.deltaY * scrollSensitivity * 0.3
      velocity.current += scrollVelocity
      
      // Cap velocity with wider range for smoother experience
      velocity.current = Math.max(-0.8, Math.min(0.8, velocity.current))
    }

    canvas.style.cursor = 'grab'
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('wheel', handleWheel)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [offset, gl, transitionComplete])

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
    const position = [cycleOffset + i * itemWidth - offset, 0, 0]
    
    // Only render slides that are within or close to viewport bounds
    const slideLeftEdge = position[0] - itemWidth/2
    const slideRightEdge = position[0] + itemWidth/2
    const viewportLeft = -viewportWidth/2
    const viewportRight = viewportWidth/2
    
    // Skip slides that are completely outside viewport bounds
    if (slideRightEdge < viewportLeft - itemWidth || slideLeftEdge > viewportRight + itemWidth) {
      continue
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
          isClicked={isClicked}
          isTransitioning={isTransitioning}
          shouldHide={shouldHide}
          transitionComplete={transitionComplete}
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