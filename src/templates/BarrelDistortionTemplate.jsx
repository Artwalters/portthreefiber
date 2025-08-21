import React, { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Lenis from 'lenis'
// Import troika text - tutorial style
// @ts-ignore
import { Text } from 'troika-three-text'

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

  // Setup Lenis smooth scroll with mobile-specific optimizations
  useEffect(() => {
    const isMobile = window.innerWidth <= 768 || 'ontouchstart' in window
    
    const lenis = new Lenis({
      duration: isMobile ? 0.8 : 1.2, // Faster response on mobile
      easing: isMobile ? 
        (t) => 1 - Math.pow(1 - t, 3) : // Simpler easing for mobile 
        (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: !isMobile, // Disable smooth wheel on mobile - let native scroll handle it
      wheelMultiplier: isMobile ? 0.5 : 1, // Reduce wheel sensitivity on mobile
      touchMultiplier: isMobile ? 1.0 : 1.5, // More conservative touch multiplier
      infinite: false,
      normalizeWheel: !isMobile, // Only normalize on desktop
      lerp: isMobile ? 0.05 : 0.1, // More responsive on mobile
      syncTouch: isMobile, // Better touch sync on mobile
      touchInertiaMultiplier: isMobile ? 15 : 35 // Lighter inertia on mobile
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

  // Initialize media store from HTML images and text elements
  useEffect(() => {
    // Wait for fonts to be ready before initializing text meshes
    const initializeMediaStore = async () => {
      await document.fonts.ready
      const mediaElements = document.querySelectorAll('[data-webgl-media]')
      const textElements = document.querySelectorAll('[data-webgl-text]')
      const newMediaStore = []
      let globalIndex = 0

      // Process image elements
      mediaElements.forEach((media) => {
        // Set up observer
        if (observerRef.current) {
          media.dataset.index = String(globalIndex)
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

        // Hide mesh immediately and keep it hidden for main camera
        imageMesh.visible = false
        imageMesh.frustumCulled = false // Prevent culling issues

        scene.add(imageMesh)

        newMediaStore.push({
          type: 'image',
          media,
          material: imageMaterial,
          mesh: imageMesh,
          width: bounds.width,
          height: bounds.height,
          top: bounds.top + scroll.scrollY,
          left: bounds.left,
          isInView: true // Always set to true initially, let observer handle it
        })

        globalIndex++
      })

      // Process text elements
      textElements.forEach((textElement, index) => {
        // Set up observer
        if (observerRef.current) {
          textElement.dataset.index = String(globalIndex)
          observerRef.current.observe(textElement)
        }

        const bounds = textElement.getBoundingClientRect()
        const computedStyle = window.getComputedStyle(textElement)
        
        // Create text mesh using troika-three-text
        const textMesh = new Text()
        
        // Copy text content and apply CSS styles - tutorial method
        textMesh.text = textElement.innerText
        
        // Font size - scale based on device for better visibility
        const fontSizeNum = parseFloat(computedStyle.fontSize)
        const isMobile = window.innerWidth <= 768
        textMesh.fontSize = fontSizeNum * (isMobile ? 0.3 : 0.6) // 6x larger than before
        
        // Color - convert CSS color to THREE color, handle transparent colors
        const cssColor = computedStyle.color
        if (cssColor === 'transparent' || cssColor.includes('rgba(0, 0, 0, 0)')) {
          textMesh.color = new THREE.Color('#333333') // Default dark color for transparent text
        } else {
          textMesh.color = new THREE.Color(cssColor)
        }
        
        // Text alignment
        textMesh.textAlign = computedStyle.textAlign
        
        // Max width for text wrapping
        textMesh.maxWidth = bounds.width
        
        // Text mesh created successfully
        
        // Don't set font for now - let troika use default
        // textMesh.font = 'Arial' // This was causing the font loading error
        
        // Anchor based on CSS text alignment
        textMesh.anchorX = computedStyle.textAlign === 'center' ? '50%' : 
                          computedStyle.textAlign === 'right' ? '100%' : '0%'
        textMesh.anchorY = "50%" // Tutorial uses "50%" for middle
        
        // Line spacing - tutorial method
        const lineHeight = parseFloat(computedStyle.lineHeight)
        if (!isNaN(lineHeight)) {
          textMesh.lineHeight = lineHeight / fontSizeNum
        }
        
        // Letter spacing - tutorial method  
        const letterSpacing = parseFloat(computedStyle.letterSpacing) 
        if (!isNaN(letterSpacing)) {
          textMesh.letterSpacing = letterSpacing / fontSizeNum
        }
        
        // White space behavior
        textMesh.whiteSpace = computedStyle.whiteSpace

        // Add marker so water shader can find this text mesh
        textMesh.userData = { 
          type: 'webgl-text',
          originalText: textMesh.text 
        }

        // Hide mesh BEFORE adding to scene to prevent any flash
        textMesh.visible = false
        textMesh.frustumCulled = false // Prevent culling issues
        
        // Force sync after setting visibility to prevent flash
        textMesh.sync(() => {
          // Text is ready and invisible - safe to add to scene
          scene.add(textMesh)
        })

        // Add to store immediately (mesh will be added to scene asynchronously)
        newMediaStore.push({
          type: 'text',
          media: textElement,
          mesh: textMesh,
          computedStyle,
          width: bounds.width,
          height: bounds.height,
          top: bounds.top + scroll.scrollY,
          left: bounds.left,
          isInView: true
        })

        globalIndex++
      })

      // Text setup complete

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
          
          if (item.type === 'image') {
            item.mesh.geometry.dispose()
            item.material.dispose()
          } else if (item.type === 'text') {
            // Troika text meshes have their own disposal method
            item.mesh.dispose()
          }
        }
      })
    }
  }, [scene, material, geometry])

  // Set mesh positions to match HTML elements
  const setPositions = () => {
    mediaStore.forEach((object) => {
      // Convert pixel positions to world coordinates for perspective camera
      const vFov = camera.fov * Math.PI / 180
      const height = 2 * Math.tan(vFov / 2) * camera.position.z
      const width = height * camera.aspect
      
      // Position meshes based on HTML element positions
      const x = ((object.left + object.width / 2) / window.innerWidth - 0.5) * width
      const y = -((object.top - scroll.scrollY + object.height / 2) / window.innerHeight - 0.5) * height
      
      // Text positioning calculated
      
      object.mesh.position.x = x
      object.mesh.position.y = y
      object.mesh.position.z = 0
      
      if (object.type === 'image') {
        // Scale image mesh to match screen size at camera distance
        const scaleX = (object.width / window.innerWidth) * width
        const scaleY = (object.height / window.innerHeight) * height
        object.mesh.scale.set(scaleX, scaleY, 1)
      } else if (object.type === 'text') {
        // For text, we don't scale the mesh itself, but ensure font size matches screen
        // Troika handles text sizing internally based on fontSize property
        // We just need to position it correctly
        const pixelsPerUnit = window.innerHeight / height
        const isMobile = window.innerWidth <= 768
        const newFontSize = parseFloat(object.computedStyle.fontSize) / pixelsPerUnit * (isMobile ? 0.3 : 0.6)
        object.mesh.fontSize = newFontSize
        object.mesh.maxWidth = object.width / pixelsPerUnit
        
        // Ensure text stays hidden for main camera
        // Will only be visible during water scene capture
      }
      
      // Force meshes to stay invisible for main camera (only visible during water shader scene capture)
      object.mesh.visible = false
      object.mesh.frustumCulled = false
    })
  }

  // Don't override camera - use the camera position from Canvas

  // Render loop
  useFrame((state) => {
    const time = state.clock.elapsedTime

    // Update uniforms for image meshes only (text meshes don't have material uniforms)
    mediaStore.forEach((object) => {
      if (object.type === 'image' && object.material && object.material.uniforms) {
        object.material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight)
        object.material.uniforms.uTime.value = time
        object.material.uniforms.uCursor.value.set(cursorPos.x, cursorPos.y)
        object.material.uniforms.uScrollVelocity.value = scroll.scrollVelocity
      }
    })

    // Update positions for both images and text
    setPositions()
  })

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      // Don't override camera settings

      // Update media store bounds
      setMediaStore(prev => prev.map(object => {
        const bounds = object.media.getBoundingClientRect()
        
        if (object.type === 'image') {
          object.mesh.scale.set(bounds.width, bounds.height, 1)
        } else if (object.type === 'text') {
          // Update text properties from CSS
          const computedStyle = window.getComputedStyle(object.media)
          const isMobile = window.innerWidth <= 768
          object.mesh.fontSize = parseFloat(computedStyle.fontSize) * (isMobile ? 0.3 : 0.6)
          object.mesh.maxWidth = bounds.width
          object.computedStyle = computedStyle
        }
        
        const newObject = {
          ...object,
          width: bounds.width,
          height: bounds.height,
          top: bounds.top + scroll.scrollY,
          left: bounds.left,
          isInView: bounds.top >= -500 && bounds.top <= window.innerHeight + 500
        }

        // Update uniforms for images only
        if (object.type === 'image' && object.material && object.material.uniforms) {
          object.material.uniforms.uQuadSize.value.set(bounds.width, bounds.height)
        }
        
        return newObject
      }))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [camera, scroll.scrollY])

  return null // This component doesn't render any JSX, it manipulates the Three.js scene directly
}