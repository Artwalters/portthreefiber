import { useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'

const SlideItem = ({ texture, position, velocity }) => {
  const meshRef = useRef()
  
  // Create shader material with curve effect
  const shaderMaterial = new THREE.ShaderMaterial({
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
        vec4 texture = texture2D(uTexture, vUv);
        gl_FragColor = texture;
      }
    `,
    side: THREE.DoubleSide
  })

  // Update velocity uniform
  useFrame(() => {
    if (meshRef.current && shaderMaterial.uniforms.uVelo) {
      shaderMaterial.uniforms.uVelo.value = velocity
    }
  })

  return (
    <mesh ref={meshRef} position={position} material={shaderMaterial}>
      <planeGeometry args={[2, 2.5, 32, 32]} />
    </mesh>
  )
}

export default function WebGLSlider() {
  const { gl } = useThree()
  const [offset, setOffset] = useState(0)
  const containerRef = useRef()
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, offset: 0 })
  const velocity = useRef(0)
  const targetOffset = useRef(0)
  const lastMoveTime = useRef(0)
  const lastMouseX = useRef(0)
  
  // Load textures
  const textures = useTexture([
    '/img/project-1.png',
    '/img/project-2.png',
    '/img/project-3.png',
    '/img/project-4.png',
    '/img/project-5.png',
    '/img/project-6.png',
    '/img/project-7.png'
  ])

  const itemWidth = 2.5
  const totalItems = textures.length
  const totalWidth = totalItems * itemWidth

  // Smooth animation loop
  useFrame(() => {
    if (!isDragging.current) {
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
    const canvas = gl.domElement

    const handleMouseDown = (e) => {
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
  }, [offset, gl])

  // Create infinite slides
  const slides = []
  const visibleRange = Math.ceil(window.innerWidth / (itemWidth * 100)) + 2

  // Calculate how many full cycles we need to show
  const cycleOffset = Math.floor(offset / totalWidth) * totalWidth
  const startIndex = Math.floor((offset - cycleOffset) / itemWidth) - visibleRange
  const endIndex = startIndex + visibleRange * 2 + totalItems

  for (let i = startIndex; i <= endIndex; i++) {
    const textureIndex = ((i % totalItems) + totalItems) % totalItems
    const position = [cycleOffset + i * itemWidth - offset, 0, 0]
    
    slides.push(
      <SlideItem
        key={`slide-${i}-${Math.floor(offset / totalWidth)}`}
        texture={textures[textureIndex]}
        position={position}
        velocity={velocity.current}
      />
    )
  }

  return (
    <group ref={containerRef}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      {slides}
    </group>
  )
}