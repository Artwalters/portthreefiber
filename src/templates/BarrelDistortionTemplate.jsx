import React, { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Lenis from 'lenis'

// Define shaders inline (since we don't have raw imports configured)
const vertexShader = `
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uCursor;
uniform float uScrollVelocity;
uniform sampler2D uTexture;
uniform vec2 uTextureSize;
uniform vec2 uQuadSize;

varying vec2 vUv;
varying vec2 vUvCover;

#define PI 3.1415926535897932384626433832795

// Utility function for object-fit: cover behavior
vec2 getCoverUvVert(vec2 uv, vec2 textureSize, vec2 quadSize) {
  vec2 ratio = vec2(
    min((quadSize.x / quadSize.y) / (textureSize.x / textureSize.y), 1.0),
    min((quadSize.y / quadSize.x) / (textureSize.y / textureSize.x), 1.0)
  );

  return vec2(
    uv.x * ratio.x + (1.0 - ratio.x) * 0.5,
    uv.y * ratio.y + (1.0 - ratio.y) * 0.5
  );
}

// Barrel distortion curve function
vec3 deformationCurve(vec3 position, vec2 uv) {
  // Create barrel distortion based on scroll velocity
  position.y = position.y - (sin(uv.x * PI) * min(abs(uScrollVelocity), 5.0) * sign(uScrollVelocity) * -0.01);
  
  return position;
}

void main() {
  vUv = uv;
  vUvCover = getCoverUvVert(uv, uTextureSize, uQuadSize);

  vec3 deformedPosition = deformationCurve(position, vUvCover);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(deformedPosition, 1.0);
}
`

const fragmentShader = `
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uCursor;
uniform float uScrollVelocity;
uniform sampler2D uTexture;
uniform vec2 uTextureSize;
uniform vec2 uQuadSize;

varying vec2 vUv;
varying vec2 vUvCover;

void main() {
  // Simple texture display with cover behavior
  vec4 texture = texture2D(uTexture, vUvCover);
  
  gl_FragColor = texture;
}
`

// Utility functions (adapted from codrops)
const lerp = (start, end, factor) => start * (1 - factor) + end * factor

const calcFov = (cameraPos) => 2 * Math.atan((window.innerHeight / 2) / cameraPos) * 180 / Math.PI

export default function BarrelDistortionTemplate({ waterRef }) {
  const { scene, camera, gl } = useThree()
  const [mediaStore, setMediaStore] = useState([])
  const [scroll, setScroll] = useState({ scrollY: 0, scrollVelocity: 0 })
  const [cursorPos, setCursorPos] = useState({ x: 0.5, y: 0.5 })
  const observerRef = useRef()
  const CAMERA_POS = 500

  // Create shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uTime: { value: 0 },
        uCursor: { value: new THREE.Vector2(0.5, 0.5) },
        uScrollVelocity: { value: 0 },
        uTexture: { value: null },
        uTextureSize: { value: new THREE.Vector2(100, 100) },
        uQuadSize: { value: new THREE.Vector2(100, 100) }
      },
      vertexShader,
      fragmentShader,
      transparent: true
    })
  }, [])

  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(1, 1, 100, 100)
  }, [])

  // Setup intersection observer for performance
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = parseInt(entry.target.dataset.index)
          if (!isNaN(index) && mediaStore[index]) {
            setMediaStore(prev => {
              const newStore = [...prev]
              if (newStore[index]) {
                newStore[index].isInView = entry.isIntersecting
              }
              return newStore
            })
          }
        })
      },
      { rootMargin: '1000px 0px 1000px 0px' } // Bigger margin to detect earlier
    )

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [mediaStore])

  // Setup Lenis smooth scroll
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
      infinite: false,
    })

    // Update scroll state when Lenis scrolls
    lenis.on('scroll', (e) => {
      setScroll({
        scrollY: e.animatedScroll || window.scrollY,
        scrollVelocity: e.velocity || 0
      })
    })

    // RAF loop for Lenis
    let rafId
    function raf(time) {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [])

  // Setup mouse tracking with drag support like in FilmStripSlider
  useEffect(() => {
    let isDragging = false
    
    const handleMouseMove = (e) => {
      setCursorPos({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight
      })
      
      // Update water shader mouse position - always send mouse move, dragging state in down/up
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(e.clientX, e.clientY, isDragging)
      }
    }
    
    const handleMouseDown = (e) => {
      isDragging = true
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(e.clientX, e.clientY, true)
      }
    }
    
    const handleMouseUp = (e) => {
      isDragging = false
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(e.clientX, e.clientY, false)
      }
    }
    
    // Touch events for mobile
    const handleTouchStart = (e) => {
      if (e.touches.length > 0) {
        isDragging = true
        const touch = e.touches[0]
        if (waterRef?.current?.updateMouse) {
          waterRef.current.updateMouse(touch.clientX, touch.clientY, true)
        }
      }
    }
    
    const handleTouchMove = (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0]
        setCursorPos({
          x: touch.clientX / window.innerWidth,
          y: touch.clientY / window.innerHeight
        })
        
        if (waterRef?.current?.updateMouse) {
          waterRef.current.updateMouse(touch.clientX, touch.clientY, isDragging)
        }
      }
    }
    
    const handleTouchEnd = (e) => {
      isDragging = false
      if (waterRef?.current?.updateMouse) {
        // Use last known position
        waterRef.current.updateMouse(0, 0, false)
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('mousedown', handleMouseDown, { passive: true })
    window.addEventListener('mouseup', handleMouseUp, { passive: true })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [waterRef])

  // Initialize media store from HTML images
  useEffect(() => {
    const initializeMediaStore = () => {
      const mediaElements = document.querySelectorAll('[data-webgl-media]')
      const newMediaStore = []

      mediaElements.forEach((media, index) => {
        // Set up observer
        if (observerRef.current) {
          media.dataset.index = String(index)
          observerRef.current.observe(media)
        }

        const bounds = media.getBoundingClientRect()
        const imageMaterial = material.clone()
        const imageMesh = new THREE.Mesh(geometry, imageMaterial)

        // Create texture from image - wait for load
        const texture = new THREE.Texture()
        
        // Create a canvas to ensure we can access image data
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        const loadTexture = () => {
          if (media.complete && media.naturalWidth > 0) {
            canvas.width = media.naturalWidth
            canvas.height = media.naturalHeight
            ctx.drawImage(media, 0, 0)
            
            texture.image = canvas
            texture.needsUpdate = true
            texture.flipY = true  // Fix upside down images
            texture.format = THREE.RGBAFormat
          } else {
            // Wait for image to load
            media.onload = loadTexture
          }
        }
        
        loadTexture()

        // Set uniforms
        imageMaterial.uniforms.uTexture.value = texture
        imageMaterial.uniforms.uTextureSize.value.set(media.naturalWidth, media.naturalHeight)
        imageMaterial.uniforms.uQuadSize.value.set(bounds.width, bounds.height)

        // Scale mesh to match image dimensions
        imageMesh.scale.set(bounds.width, bounds.height, 1)

        // Hide mesh for main camera (only visible during scene capture by water shader)
        imageMesh.visible = false

        scene.add(imageMesh)

        newMediaStore.push({
          media,
          material: imageMaterial,
          mesh: imageMesh,
          width: bounds.width,
          height: bounds.height,
          top: bounds.top + scroll.scrollY,
          left: bounds.left,
          isInView: true // Always set to true initially, let observer handle it
        })
      })

      setMediaStore(newMediaStore)
    }

    // Wait for images to load
    const timeout = setTimeout(initializeMediaStore, 100)
    
    return () => {
      clearTimeout(timeout)
      // Clean up meshes when component unmounts
      mediaStore.forEach(item => {
        if (item.mesh) {
          scene.remove(item.mesh)
          item.mesh.geometry.dispose()
          item.material.dispose()
        }
      })
    }
  }, [scene, material, geometry])

  // Set mesh positions to match HTML elements
  const setPositions = () => {
    mediaStore.forEach((object) => {
      // Always position meshes at their HTML element location
      object.mesh.position.x = object.left - window.innerWidth / 2 + object.width / 2
      object.mesh.position.y = -object.top + window.innerHeight / 2 - object.height / 2 + scroll.scrollY
      
      // Keep meshes invisible for main camera (only visible during water shader scene capture)
      object.mesh.visible = false
    })
  }

  // Setup camera
  useEffect(() => {
    camera.position.z = CAMERA_POS
    camera.fov = calcFov(CAMERA_POS)
    camera.updateProjectionMatrix()
  }, [camera])

  // Render loop
  useFrame((state) => {
    const time = state.clock.elapsedTime

    // Update uniforms for ALL meshes (not just visible ones)
    mediaStore.forEach((object) => {
      object.material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight)
      object.material.uniforms.uTime.value = time
      object.material.uniforms.uCursor.value.set(cursorPos.x, cursorPos.y)
      object.material.uniforms.uScrollVelocity.value = scroll.scrollVelocity
    })

    // Update positions
    setPositions()
  })

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const fov = calcFov(CAMERA_POS)
      camera.fov = fov
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()

      // Update media store bounds
      setMediaStore(prev => prev.map(object => {
        const bounds = object.media.getBoundingClientRect()
        object.mesh.scale.set(bounds.width, bounds.height, 1)
        
        const newObject = {
          ...object,
          width: bounds.width,
          height: bounds.height,
          top: bounds.top + scroll.scrollY,
          left: bounds.left,
          isInView: bounds.top >= -500 && bounds.top <= window.innerHeight + 500
        }

        // Update uniforms
        object.material.uniforms.uQuadSize.value.set(bounds.width, bounds.height)
        
        return newObject
      }))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [camera, scroll.scrollY])

  return null // This component doesn't render any JSX, it manipulates the Three.js scene directly
}