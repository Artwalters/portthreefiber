import React, { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, useThree, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { gsap } from 'gsap'

// Custom shader material for single repeating image
const createSingleImageMaterial = (texture, isMobile = false) => {
  const aspect = isMobile ? 24 / 3.3 : 30 / 3.3  // Same aspect as FilmStripSlider
  
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      uTexture: { value: texture || new THREE.Texture() },
      uVelo: { value: 0 },
      uIsMobile: { value: isMobile ? 1.0 : 0.0 },
      fogColor: { value: new THREE.Color(0xffffff) },
      fogNear: { value: isMobile ? 8 : 5 },
      fogFar: { value: isMobile ? 15 : 12 },
      fogIntensity: { value: 1.0 }, // Dynamic fog intensity multiplier
      dynamicFogNear: { value: isMobile ? 8 : 5 }, // Dynamic fog near plane
      dynamicFogFar: { value: isMobile ? 15 : 12 } // Dynamic fog far plane
    },
    vertexShader: `
      uniform float uVelo;
      uniform float uIsMobile;
      uniform float time;
      varying vec2 vUv;
      varying float vFogDepth;
      
      #define M_PI 3.1415926535897932384626433832795
      
      void main() {
        vec3 pos = position;
        
        // Simple global deformation like original FilmStripSlider
        if (uIsMobile > 0.5) {
          // Mobile: increased deformation for better visual feedback
          pos.y = pos.y + ((sin(uv.y * M_PI) * uVelo) * 0.0015);
        } else {
          // Desktop: normal deformation
          pos.x = pos.x - ((sin(uv.y * M_PI) * uVelo) * 0.0016);
        }
        
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform sampler2D uTexture;
      uniform float uVelo;
      uniform float uIsMobile;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      uniform float fogIntensity;
      uniform float dynamicFogNear;
      uniform float dynamicFogFar;
      varying vec2 vUv;
      varying float vFogDepth;
      
      void main() {
        // Calculate chromatic aberration
        float baseAberration = 0.0021; // 30% less: 0.003 * 0.7
        float velocityAberration = abs(uVelo) * 0.0007; // 30% less: 0.001 * 0.7
        float aberrationStrength = baseAberration + velocityAberration;
        aberrationStrength = min(aberrationStrength, 0.0042); // 30% less: 0.006 * 0.7
        
        // Define single image bounds (centered) - same as original tiles
        // Original tiles had aspect ratio of (mobile: 24/3.3, desktop: 30/3.3) * 1.2 with gaps
        // After gaps (0.05 on each side), effective width was 0.9 of tile width
        // Each tile was 1/(aspect*1.2) = 1/(8.7) ≈ 0.115 of UV space
        // With gaps removed: 0.115 * 0.9 ≈ 0.103
        float imageWidth = 0.103; // Same width as original tiles
        float imageHeight = 1.0; // Full height
        
        // Calculate position based on time (for animation)
        float scrollOffset = time * 0.01;
        float centerX = 0.5 + scrollOffset;
        
        // Check if current UV is within image bounds
        float leftEdge = centerX - imageWidth * 0.5;
        float rightEdge = centerX + imageWidth * 0.5;
        
        // Discard pixels outside the single image
        if (vUv.x < leftEdge || vUv.x > rightEdge) {
          discard;
        }
        
        // Map UV to texture coordinates (0-1 range within the image)
        vec2 tileUV;
        tileUV.x = (vUv.x - leftEdge) / imageWidth;
        tileUV.y = vUv.y;
        
        // Rotate texture coordinates 90 degrees for mobile
        if (uIsMobile > 0.5) {
          vec2 center = vec2(0.5, 0.5);
          tileUV -= center;
          // Rotate 90 degrees counterclockwise but flip X to fix mirroring
          tileUV = vec2(tileUV.y, tileUV.x);
          tileUV += center;
        }
        
        vec4 tileColor;
        
        // Apply chromatic aberration
        if (aberrationStrength > 0.0) {
          vec2 rUV = tileUV + vec2(aberrationStrength, 0.0);
          vec2 gUV = tileUV;
          vec2 bUV = tileUV - vec2(aberrationStrength, 0.0);
          
          float r = texture2D(uTexture, rUV).r;
          float g = texture2D(uTexture, gUV).g;
          float b = texture2D(uTexture, bUV).b;
          float a = texture2D(uTexture, gUV).a;
          
          tileColor = vec4(r, g, b, a);
        } else {
          tileColor = texture2D(uTexture, tileUV);
        }
        
        // Apply fog with dynamic near/far planes for transition effects
        float fogFactor = smoothstep(dynamicFogNear, dynamicFogFar, vFogDepth);
        // Make fog curve more aggressive in the back
        fogFactor = fogFactor * fogFactor; // Quadratic curve - less fog in front, stronger in back
        
        // Apply dynamic fog intensity during transitions
        fogFactor = fogFactor * fogIntensity;
        fogFactor = min(fogFactor, 0.98); // Cap at 98% for extreme fog
        
        vec3 finalColor = mix(tileColor.rgb, fogColor, fogFactor);
        
        gl_FragColor = vec4(finalColor, tileColor.a);
        gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(1.0/2.2)); // Gamma correction
      }
    `,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    depthTest: true
  })
  
  // Add helper methods
  material.updateTime = function(time) {
    this.uniforms.time.value = time
  }
  
  material.updateVelocity = function(velocity) {
    this.uniforms.uVelo.value = velocity
  }
  
  material.updateTexture = function(texture) {
    if (texture) {
      this.uniforms.uTexture.value = texture
    }
  }
  
  material.updateFogIntensity = function(intensity) {
    this.uniforms.fogIntensity.value = intensity
  }
  
  material.updateDynamicFog = function(nearValue, farValue) {
    this.uniforms.dynamicFogNear.value = nearValue
    this.uniforms.dynamicFogFar.value = farValue
  }
  
  return material
}

const GallerySlider = ({ initialImageIndex = 0, waterRef, selectedProject, currentImageIndex, setCurrentImageIndex, shouldExit = false }) => {
  const meshRef = useRef()
  const [texture, setTexture] = useState(null)
  const [projectImages, setProjectImages] = useState([])
  const { gl } = useThree()
  
  // Detect mobile
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  // Use refs for real-time values
  const currentOffset = useRef(-100) // Start off-screen to the left
  const sliderSpeed = useRef(0)

  // Animation states for fly-in and exit effects
  const [isAnimating, setIsAnimating] = useState(true)
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const animationProgress = useRef(0)
  const exitProgress = useRef(0)
  const exitStartPosition = useRef(0) // Track position when exit animation starts
  const [fogIntensity, setFogIntensity] = useState(3.0) // Start with 3x fog intensity for fly-in

  // Fog smoothing refs
  const currentFogNear = useRef(1.0) // Start at 1.0 for fly-in
  const currentFogFar = useRef(isMobile ? 9 : 6) // Start close for fly-in
  
  // GSAP animation refs
  const flyInTween = useRef(null)
  const exitTween = useRef(null)
  
  // Update current image index when initial index changes and reset animation
  useEffect(() => {
    if (setCurrentImageIndex && selectedProject) {
      setCurrentImageIndex(0) // Always start at first image when component mounts
    }
    setIsVisible(false) // Reset visibility
    // Reset animation state when initialImageIndex changes
    currentOffset.current = -100 // Reset to off-screen position
    animationProgress.current = 0 // Reset animation progress
    setIsAnimating(true) // Start animation again
    
    // Kill any existing fly-in animation
    if (flyInTween.current) {
      flyInTween.current.kill()
    }
    
    // Start GSAP fly-in animation with very dramatic curve
    const animObj = { progress: 0 }
    flyInTween.current = gsap.to(animObj, {
      progress: 1,
      duration: 1.8, // Slightly longer for more drama
      ease: "expo.in", // VERY dramatic: slow start → explosive fast arrival
      onUpdate: () => {
        animationProgress.current = animObj.progress
      },
      onComplete: () => {
        setIsAnimating(false)
      }
    })
  }, [selectedProject]) // Only run when selected project changes
  
  // Make visible after short delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 250) // 1/4 second delay before becoming visible
    
    return () => clearTimeout(timer)
  }, [selectedProject]) // Reset timer when selected project changes
  
  // Use images from selected project only
  useEffect(() => {
    if (selectedProject && selectedProject.images) {
      setProjectImages(selectedProject.images)
    }
  }, [selectedProject])
  
  // Handle exit animation trigger
  useEffect(() => {
    if (shouldExit && !isExiting) {
      setIsExiting(true)
      exitProgress.current = 0
      // Capture current position when exit starts (smooth transition)
      exitStartPosition.current = currentOffset.current
      // Stop fly-in animation if still running
      setIsAnimating(false)
      
      // Kill any existing fly-in animation
      if (flyInTween.current) {
        flyInTween.current.kill()
      }
      
      // Start GSAP exit animation with very dramatic curve
      const animObj = { progress: 0 }
      exitTween.current = gsap.to(animObj, {
        progress: 1,
        duration: 1.0, // Shorter for explosive acceleration
        ease: "expo.in", // VERY dramatic: very slow start → explosive acceleration
        onUpdate: () => {
          exitProgress.current = animObj.progress
        }
      })
    }
  }, [shouldExit, isExiting])
  
  
  
  // Create curved geometry like FilmStripSlider
  const geometry = useMemo(() => {
    const splineSegments = isMobile ? 100 : 150 // Reduced segments for performance
    const filmWidth = isMobile ? 3.2 : 3.2
    
    let curve
    if (isMobile) {
      const mobileCurve = new THREE.CatmullRomCurve3([
       new THREE.Vector3(-12, 0, -7.0),   // Far left - off screen (shorter)
             new THREE.Vector3(-8, 0, -4.0),    // Left curve start
             new THREE.Vector3(-4, 0, -0.2),    // Left transition to flat
             new THREE.Vector3(0, 0, 0.2),      // Center flat
             new THREE.Vector3(4, 0, -0.2),     // Right transition from flat
             new THREE.Vector3(8, 0, -4.0),     // Right curve start
             new THREE.Vector3(12, 0, -7.0)    // Moved closer to center and further back
      ], false, "catmullrom", 0.5)
      
      const rotatedPoints = mobileCurve.points.map(point => 
        new THREE.Vector3(0, point.x, point.z + 0.8)
      )
      curve = new THREE.CatmullRomCurve3(rotatedPoints, false, "catmullrom", 0.5)
    } else {
      curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3, 0, -10.0),   // RED - First outer point left back
        new THREE.Vector3(-2, 0, -7.0),    // ORANGE - Second point left back
        new THREE.Vector3(-6, 0, -4.0),    // YELLOW - Third point left mid
        new THREE.Vector3(-3.5, 0, 0.4),   // GREEN - Fourth point left forward
        new THREE.Vector3(0, 0, 1.4),      // CYAN - Center point (closest to camera)
        new THREE.Vector3(3.5, 0, 0.4),    // BLUE - Sixth point right forward
        new THREE.Vector3(6, 0, -4.0),     // PURPLE - Seventh point right mid
        new THREE.Vector3(2, 0, -7.0),     // MAGENTA - Eighth point right back
        new THREE.Vector3(3, 0, -10.0)     // DARKRED - Last outer point right back
      ], false, "catmullrom", 0.5)
    }
    
    
    const curvePoints = curve.getSpacedPoints(splineSegments)
    
    const geo = new THREE.PlaneGeometry(1, 1, splineSegments, 16) // Reduced height segments
      .translate(0.5, 0, 0)
      .scale(splineSegments, 1, 1)
    
    const positions = geo.attributes.position
    const vertex = new THREE.Vector3()
    
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i)
      const idx = Math.round(vertex.x)
      const curvePoint = curvePoints[idx]
      
      if (curvePoint) {
        if (isMobile) {
          positions.setXYZ(
            i, 
            curvePoint.x + vertex.y * filmWidth, 
            curvePoint.y, 
            curvePoint.z
          )
        } else {
          positions.setXYZ(
            i, 
            curvePoint.x, 
            curvePoint.y + vertex.y * filmWidth, 
            curvePoint.z
          )
        }
      }
    }
    
    geo.computeVertexNormals()
    return geo
  }, [isMobile])
  
  // Load texture based on current image index
  useEffect(() => {
    if (projectImages.length === 0) return
    
    const currentImage = projectImages[currentImageIndex]
    if (!currentImage) return
    
    const loader = new THREE.TextureLoader()
    loader.load(
      currentImage.src,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        // tex.encoding = THREE.sRGBEncoding // Deprecated in Three.js r152+
        tex.generateMipmaps = isMobile ? false : true // Disable mipmaps on mobile for faster loading
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.minFilter = isMobile ? THREE.NearestFilter : THREE.LinearFilter // Faster filtering on mobile
        tex.magFilter = THREE.LinearFilter
        tex.anisotropy = Math.min(isMobile ? 4 : 8, gl.capabilities.getMaxAnisotropy()) // Reduced for performance
        tex.needsUpdate = true
        setTexture(tex)
      },
      undefined,
      () => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 256
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#cccccc'
        ctx.fillRect(0, 0, 256, 256)
        const fallbackTexture = new THREE.CanvasTexture(canvas)
        setTexture(fallbackTexture)
      }
    )
  }, [currentImageIndex, projectImages, gl])
  
  // Click handler to cycle through images - optimized for mobile
  useEffect(() => {
    const handleTouchStart = (e) => {
      // Only forward to water shader, navigation is handled in index.jsx
      if (waterRef?.current?.updateMouse && e.touches.length > 0) {
        waterRef.current.updateMouse(e.touches[0].clientX, e.touches[0].clientY, true)
      }
    }
    
    const handleTouchEnd = (e) => {
      // Only forward to water shader, navigation is handled in index.jsx
      if (waterRef?.current?.updateMouse && e.changedTouches.length > 0) {
        waterRef.current.updateMouse(e.changedTouches[0].clientX, e.changedTouches[0].clientY, false)
      }
    }
    
    // Drag state
    let isDragging = false
    let dragStartX = 0
    let dragStartY = 0
    let dragStartTime = 0
    let hasDraggedForSwipe = false
    
    const handleMouseDown = (e) => {
      isDragging = true
      dragStartX = e.clientX
      dragStartY = e.clientY
      dragStartTime = Date.now()
      hasDraggedForSwipe = false
      
      // Forward mouse down to water shader
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(e.clientX, e.clientY, true)
      }
    }
    
    const handleMouseUp = (e) => {
      if (isDragging) {
        const dragEndX = e.clientX
        const dragEndY = e.clientY
        const dragDuration = Date.now() - dragStartTime
        const deltaX = dragEndX - dragStartX
        const deltaY = dragEndY - dragStartY
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        
        // Navigation is handled in index.jsx, no navigation logic here
      }
      
      isDragging = false
      
      // Forward mouse up to water shader
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(e.clientX, e.clientY, false)
      }
    }
    
    const handleMouseMove = (e) => {
      // Forward mouse move events to water shader with drag state
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(e.clientX, e.clientY, isDragging)
      }
      
      // Track if we've moved enough to count as a drag
      if (isDragging) {
        const deltaX = Math.abs(e.clientX - dragStartX)
        const deltaY = Math.abs(e.clientY - dragStartY)
        if (deltaX > 10 || deltaY > 10) {
          hasDraggedForSwipe = true
        }
      }
    }
    
    const handleTouchMove = (e) => {
      // Forward touch move events to water shader for drag effect
      if (waterRef?.current?.updateMouse && e.touches.length > 0) {
        waterRef.current.updateMouse(e.touches[0].clientX, e.touches[0].clientY, true)
      }
    }
    
    const canvas = gl.domElement
    
    
    // Add mouse events for water shader drag effect (on window for proper drag detection)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('mousemove', handleMouseMove)
    
    // Touch events for mobile (fastest response)
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchend', handleTouchEnd)
      canvas.removeEventListener('touchmove', handleTouchMove)
    }
  }, [gl, projectImages])

  // Animation loop
  useFrame((state, delta) => {
    if (!material) return
    
    // Calculate target fog values based on animation states
    let targetFogIntensity = 1.0
    let targetFogNear = isMobile ? 8 : 5
    let targetFogFar = isMobile ? 15 : 12

    if (isAnimating) {
      // Start with 3x fog, decrease smoothly during fly-in - much slower retreat
      // Use slower progress and easeOut curve for natural fog retreat
      const slowerProgress = animationProgress.current * 0.65 // Much slower fog retreat - only 65% speed
      const easedProgress = 1 - Math.pow(1 - slowerProgress, 2) // EaseOut curve
      targetFogIntensity = 3.0 - (easedProgress * 2.0) // From 3x down to 1x (normal)

      // Fog starts close and moves back to normal position - much slower
      const baseFogNear = isMobile ? 8 : 5
      const baseFogFar = isMobile ? 15 : 12
      targetFogNear = 1.0 + (easedProgress * (baseFogNear - 1.0)) // Start at 1.0, move back
      targetFogFar = (baseFogFar - 6) + (easedProgress * 6) // Far plane moves back
    } else if (isExiting) {
      // Slower fog increase during exit for smoother transition
      const slowProgress = Math.min(exitProgress.current * 0.85, 1.0) // Much slower - only 85% speed
      targetFogIntensity = 1.0 + (slowProgress * 2.0) // From 1x up to 3x

      // Move fog closer to camera during exit - slower and smoother
      const baseFogNear = isMobile ? 8 : 5
      const baseFogFar = isMobile ? 15 : 12
      targetFogNear = baseFogNear - (slowProgress * (baseFogNear - 1.0)) // Fog moves to 1.0
      targetFogFar = baseFogFar - (slowProgress * 6) // Far plane comes forward
    }

    // Smooth interpolation to target fog values (very smooth lerp)
    const fogLerpSpeed = 0.08 // Smooth interpolation
    currentFogNear.current += (targetFogNear - currentFogNear.current) * fogLerpSpeed
    currentFogFar.current += (targetFogFar - currentFogFar.current) * fogLerpSpeed

    // Update fog intensity with smooth transition
    setFogIntensity(prev => prev + (targetFogIntensity - prev) * fogLerpSpeed)

    // Apply smoothed fog values to slider material only
    if (material) {
      material.updateDynamicFog(currentFogNear.current, currentFogFar.current)
    }
    
    // Handle GSAP-driven exit animation - plane completes curve to right
    if (isExiting) {
      // Animate from CURRENT position to right side (100) - smooth transition
      const startPos = exitStartPosition.current // Use captured position instead of hardcoded 0
      const endPos = 100
      currentOffset.current = startPos + (endPos - startPos) * exitProgress.current
      
      // Add velocity effect during exit for curve deformation
      sliderSpeed.current = 150 * exitProgress.current // Increase deformation as it moves along curve
      
    } else if (isAnimating) {
      // Handle GSAP-driven fly-in animation on page load
      // Animate from left (-100) to center (0)
      const startPos = -100
      const endPos = 0
      currentOffset.current = startPos + (endPos - startPos) * animationProgress.current
      
      // Add some velocity effect during animation for deformation
      if (animationProgress.current < 0.9) {
        sliderSpeed.current = 150 * (1 - animationProgress.current) // Deformation during fly-in
      }
    } else if (!isExiting) {
      // After animation completes, keep at center position
      currentOffset.current = 0
    }
    
    // Fade deformation effect - stop updating when very small (but not during exit)
    if (!isExiting && Math.abs(sliderSpeed.current) > 0.01) {
      if (isMobile) {
        sliderSpeed.current *= 0.97
      } else {
        sliderSpeed.current *= 0.98
      }
    } else if (!isExiting) {
      sliderSpeed.current = 0 // Stop updating when negligible
    }
    
    // Update material
    material.updateTime(currentOffset.current)
    material.updateVelocity(sliderSpeed.current)
    material.updateFogIntensity(fogIntensity)
  })
  
  // Create material only once (without texture dependency)
  const material = useMemo(() => {
    const mat = createSingleImageMaterial(null, isMobile)
    return mat
  }, [isMobile])
  
  // Update texture separately when it changes (without recreating material)
  useEffect(() => {
    if (material && texture) {
      material.updateTexture(texture)
      // Preserve current animation state when texture changes
      material.updateTime(currentOffset.current)
      material.updateVelocity(sliderSpeed.current)
    }
  }, [texture, material])
  
  if (!material) return null
  
  // Cleanup GSAP animations on unmount
  useEffect(() => {
    return () => {
      if (flyInTween.current) {
        flyInTween.current.kill()
      }
      if (exitTween.current) {
        exitTween.current.kill()
      }
    }
  }, [])

  return (
    <>
      <mesh 
        ref={meshRef} 
        geometry={geometry} 
        material={material}
        visible={isVisible}
        onPointerOver={() => document.body.style.cursor = 'pointer'}
        onPointerOut={() => document.body.style.cursor = 'auto'}
      />
    </>
  )
}

export default GallerySlider