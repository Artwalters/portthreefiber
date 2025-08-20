import React, { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Custom shader material for the film strip effect
const createFilmStripMaterial = (tiles = [], isMobile = false) => {
  const tilesCount = Math.max(tiles.length, 1)
  const aspect = 24 / 3.3  // Slightly narrower for perfect square
  
  // Generate texture sampling loop
  const tilesLoop = Array.from({length: tilesCount}, (_, tID) => {
    return `
      if (tileID == ${tID}) { tileColor = texture2D(tiles[${tID}], tileUV); }
    `
  }).join("")
  
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      tiles: { value: tiles.length > 0 ? tiles : [new THREE.Texture()] },
      uVelo: { value: 0 },
      uIsMobile: { value: isMobile ? 1.0 : 0.0 },
      fogColor: { value: new THREE.Color(0xffffff) },
      fogNear: { value: isMobile ? 8 : 5 },
      fogFar: { value: isMobile ? 18 : 15 },
      uIsTransitioning: { value: 0 },
      uSweepPosition: { value: -25 }
    },
    vertexShader: `
      uniform float uVelo;
      uniform float uIsMobile;
      uniform float time;
      varying vec2 vUv;
      varying float vFogDepth;
      varying float vWorldX;
      varying float vWorldY;
      
      #define M_PI 3.1415926535897932384626433832795
      
      void main() {
        vec3 pos = position;
        
        // Simple global deformation like original WebGLSlider
        if (uIsMobile > 0.5) {
          // Mobile: increased deformation for better visual feedback
          pos.y = pos.y + ((sin(uv.y * M_PI) * uVelo) * 0.0015);
        } else {
          // Desktop: normal deformation
          pos.x = pos.x - ((sin(uv.y * M_PI) * uVelo) * 0.0016);
        }
        
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
        vFogDepth = -mvPosition.z;
        vWorldX = worldPosition.x;
        vWorldY = worldPosition.y;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform sampler2D tiles[${tilesCount}];
      uniform float uVelo;
      uniform float uIsMobile;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      uniform float uIsTransitioning;
      uniform float uSweepPosition;
      varying vec2 vUv;
      varying float vFogDepth;
      varying float vWorldX;
      varying float vWorldY;
      
      void main() {
        // Calculate chromatic aberration - always present with base amount
        float baseAberration = 0.003; // Always subtle RGB split
        float velocityAberration = abs(uVelo) * 0.001; // Minimal additional based on movement
        
        // Combine base and velocity-based aberration
        float aberrationStrength = baseAberration + velocityAberration;
        aberrationStrength = min(aberrationStrength, 0.006); // Very low maximum for extreme subtlety
        
        vec2 globalUV = (vUv + vec2(1000. + time * 0.01, 0.));
        vec2 tilesUV = globalUV * vec2(${aspect * 1.2}, 1.);
        float tileIndex = mod(floor(tilesUV.x), ${tilesCount}.0);
        int tileID = int(tileIndex);
        
        vec2 tileUV = fract(tilesUV);
        
        // Create smaller gaps between images with better anti-aliased edges
        float gapSize = 0.05;
        float edgeSmooth = 0.002; // Much smaller for sharper edges
        
        // Use fwidth for pixel-perfect edge smoothing
        float pixelSize = fwidth(tileUV.x);
        float smoothSize = max(edgeSmooth, pixelSize * 1.5); // Less aggressive smoothing for sharper edges
        
        // Smooth discard edges with better transitions
        if (tileUV.x < gapSize + smoothSize) {
          float edgeFactor = smoothstep(gapSize - smoothSize, gapSize + smoothSize, tileUV.x);
          if (edgeFactor < 0.5) discard;
        }
        if (tileUV.x > (1.0 - gapSize - smoothSize)) {
          float edgeFactor = smoothstep(1.0 - gapSize + smoothSize, 1.0 - gapSize - smoothSize, tileUV.x);
          if (edgeFactor < 0.5) discard;
        }
        
        tileUV.x = (tileUV.x - gapSize) / (1.0 - 2.0 * gapSize);
        tileUV.y = vUv.y;
        
        // Rotate texture coordinates 90 degrees counterclockwise for mobile
        if (uIsMobile > 0.5) {
          vec2 center = vec2(0.5, 0.5);
          tileUV -= center;
          
          // Rotate 90 degrees counterclockwise
          tileUV = vec2(-tileUV.y, tileUV.x);
          
          tileUV += center;
        }
        
        vec4 tileColor = vec4(0);
        
        // Always apply chromatic aberration (base + velocity)
        if (aberrationStrength > 0.0) {
          vec4 rChannel = vec4(0);
          vec4 gChannel = vec4(0);
          vec4 bChannel = vec4(0);
          
          vec2 rUV = tileUV + vec2(aberrationStrength, 0.0);
          vec2 gUV = tileUV;
          vec2 bUV = tileUV - vec2(aberrationStrength, 0.0);
          
          // Sample each channel with offset
          ${Array.from({length: tilesCount}, (_, tID) => `
          if (tileID == ${tID}) { 
            rChannel = texture2D(tiles[${tID}], rUV);
            gChannel = texture2D(tiles[${tID}], gUV);
            bChannel = texture2D(tiles[${tID}], bUV);
          }`).join("")}
          
          tileColor = vec4(rChannel.r, gChannel.g, bChannel.b, gChannel.a);
        } else {
          ${tilesLoop}
        }
        
        // Calculate fade transition
        if (uIsTransitioning > 0.5) {
          float fadeWidth = 3.0;
          float sweepAlpha;
          
          if (uIsMobile > 0.5) {
            // Mobile: top-to-bottom fade sweep (vertical)
            sweepAlpha = smoothstep(uSweepPosition - fadeWidth, uSweepPosition, vWorldY);
          } else {
            // Desktop: left-to-right fade sweep (horizontal)
            sweepAlpha = smoothstep(uSweepPosition - fadeWidth, uSweepPosition, vWorldX);
          }
          
          if (sweepAlpha < 0.5) {  // Pixels disappear as sweep passes
            discard;
          }
        }
        
        // Apply fog
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        vec3 finalColor = mix(tileColor.rgb, fogColor, fogFactor);
        
        // Ensure proper gamma correction
        gl_FragColor = vec4(finalColor, tileColor.a);
        gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(1.0/2.2)); // Gamma correction
      }
    `,
    side: THREE.DoubleSide,
    transparent: false, // Keep opaque to prevent double rendering
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
  
  material.updateTiles = function(tiles) {
    if (tiles.length > 0) {
      this.uniforms.tiles.value = tiles
    }
  }
  
  material.updateTransition = function(isTransitioning, progress, isMobile = false) {
    this.uniforms.uIsTransitioning.value = isTransitioning ? 1.0 : 0.0
    
    if (isMobile) {
      // Mobile: sweep from top (-15) to bottom (+15) for vertical orientation
      const sweepPosition = -15 + (progress * 30)
      this.uniforms.uSweepPosition.value = sweepPosition
    } else {
      // Desktop: sweep from left (-25) to right (+25) for horizontal orientation
      const sweepPosition = -25 + (progress * 50)
      this.uniforms.uSweepPosition.value = sweepPosition
    }
  }
  
  // Removed fog color update function
  
  return material
}

const FilmStripSlider = ({ projects = [], onHover, waterRef, onTransitionStart, onBackgroundColorChange }) => {
  const meshRef = useRef()
  const [textures, setTextures] = useState([])
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
  
  // Use refs for real-time values like WebGLSlider
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, offset: 0 })
  const targetOffset = useRef(0)
  const currentOffset = useRef(0)
  const velocity = useRef(0)
  const sliderSpeed = useRef(0)
  const smoothedSpeed = useRef(0) // Extra smoothing layer like WebGLSlider
  const lastOffset = useRef(0)
  const lastMouseY = useRef(0)
  const lastMoveTime = useRef(0)
  
  // Center snapping state
  const isSnapping = useRef(false)
  const snapTimeout = useRef(null)
  const lastInteractionTime = useRef(0)
  const snapTarget = useRef(0)
  const swipeDirection = useRef(0) // -1 = left, 1 = right, 0 = no direction
  const isUserInteracting = useRef(false) // Track if user is actively dragging/scrolling
  const momentum = useRef(0) // Track momentum for natural continuation
  
  // Center snapping functions
  const calculateNearestSnapPosition = (currentPos, direction = 0) => {
    const itemWidth = isMobile ? 2.3 : 3.5 // Same spacing as used elsewhere
    
    // The shader maps UV coordinates to tile positions
    // At screen center (vUv.x = 0.5), we want a project to be perfectly centered
    // We need to calculate what offset value will place a project exactly at screen center
    
    // From shader: tilesUV = (vUv + vec2(1000. + time * 0.01, 0.)) * vec2(aspect * 1.2, 1.)
    // At screen center vUv.x = 0.5, so we want: (0.5 + 1000.0 + offset * 0.01) * aspect * 1.2
    // to align with a project boundary
    
    const aspect = 24 / 3.3
    const tileScaling = aspect * 1.2
    
    // Calculate which tile index is currently closest to screen center
    const centerUV = 0.5 + 1000.0 + currentPos * 0.01
    const centerTilePos = centerUV * tileScaling
    
    // We want to snap to the CENTER of a tile, not the edge
    // Tile centers are at 0.5, 1.5, 2.5, etc.
    let targetTileCenter
    
    if (direction > 0) {
      // Swiped right - go to next project (higher index)
      targetTileCenter = Math.ceil(centerTilePos - 0.5) + 0.5
    } else if (direction < 0) {
      // Swiped left - go to previous project (lower index) 
      targetTileCenter = Math.floor(centerTilePos - 0.5) + 0.5
    } else {
      // No clear direction - go to nearest
      targetTileCenter = Math.round(centerTilePos - 0.5) + 0.5
    }
    
    // Calculate what offset would place this tile center perfectly at screen center
    // targetTileCenter = (0.5 + 1000.0 + targetOffset * 0.01) * tileScaling
    // Solve for targetOffset:
    const targetOffset = (targetTileCenter / tileScaling - 0.5 - 1000.0) / 0.01
    
    return targetOffset
  }
  
  const startSnapping = () => {
    if (isSnapping.current) return
    
    const snapPosition = calculateNearestSnapPosition(targetOffset.current, swipeDirection.current)
    snapTarget.current = snapPosition
    isSnapping.current = true
    swipeDirection.current = 0 // Reset direction after snapping
  }
  
  const clearSnapTimeout = () => {
    if (snapTimeout.current) {
      clearTimeout(snapTimeout.current)
      snapTimeout.current = null
    }
  }
  
  const scheduleSnap = () => {
    clearSnapTimeout()
    snapTimeout.current = setTimeout(() => {
      startSnapping()
    }, 300) // Longer delay to let natural movement happen first
  }
  
  // Create curved geometry
  const geometry = useMemo(() => {
    const splineSegments = 300
    const filmWidth = isMobile ? 3.2 : 3.2 // Same size for both mobile and desktop
    
    let curve
    if (isMobile) {
      // Mobile curve - shorter for better mobile fit
      const mobileCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-12, 0, -7.0),   // Far left - off screen (shorter)
        new THREE.Vector3(-8, 0, -4.0),    // Left curve start
        new THREE.Vector3(-4, 0, -0.2),    // Left transition to flat
        new THREE.Vector3(0, 0, 0.2),      // Center flat
        new THREE.Vector3(4, 0, -0.2),     // Right transition from flat
        new THREE.Vector3(8, 0, -4.0),     // Right curve start
        new THREE.Vector3(12, 0, -7.0)     // Far right - off screen (shorter)
      ], false, "catmullrom", 0.5)
      
      // Rotate for mobile: 90 degrees and move forward slightly
      const rotatedPoints = mobileCurve.points.map(point => 
        new THREE.Vector3(0, point.x, point.z + 0.5) // X → Y, Y → 0, Z moved forward by 0.5 units
      )
      curve = new THREE.CatmullRomCurve3(rotatedPoints, false, "catmullrom", 0.5)
    } else {
      // Desktop curve - original size
      curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-18, 0, -7.0),   // Far left - off screen
        new THREE.Vector3(-12, 0, -4.0),   // Left curve start
        new THREE.Vector3(-6, 0, -0.2),    // Left transition to flat
        new THREE.Vector3(0, 0, 0.2),     // Center flat
        new THREE.Vector3(6, 0, -0.2),     // Right transition from flat
        new THREE.Vector3(12, 0, -4.0),    // Right curve start
        new THREE.Vector3(18, 0, -7.0)     // Far right - off screen
      ], false, "catmullrom", 0.5)
    }
    
    const curvePoints = curve.getSpacedPoints(splineSegments)
    
    // Create plane geometry with more subdivisions for better quality
    const geo = new THREE.PlaneGeometry(1, 1, splineSegments, 32)
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
          // For mobile: map curve to Y axis and apply width to X
          positions.setXYZ(
            i, 
            curvePoint.x + vertex.y * filmWidth, 
            curvePoint.y, 
            curvePoint.z
          )
        } else {
          // For desktop: normal horizontal mapping
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
  
  // Create textures from project images
  useEffect(() => {
    if (projects.length === 0) return
    
    const loader = new THREE.TextureLoader()
    const texturePromises = projects.map(project => {
      return new Promise((resolve) => {
        const texture = loader.load(
          project.images?.[0]?.src || '/placeholder.jpg',
          (tex) => {
            // Ensure correct color space for accurate colors
            tex.colorSpace = THREE.SRGBColorSpace
            tex.encoding = THREE.sRGBEncoding
            // Maximum quality texture settings
            tex.generateMipmaps = false // Disable mipmaps for sharper images
            tex.wrapS = THREE.ClampToEdgeWrapping
            tex.wrapT = THREE.ClampToEdgeWrapping
            // Use nearest neighbor for pixel-perfect sharpness
            tex.minFilter = THREE.LinearFilter
            tex.magFilter = THREE.LinearFilter
            // Maximum anisotropic filtering for sharp textures at angles
            tex.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy())
            // Ensure texture updates
            tex.needsUpdate = true
            resolve(tex)
          },
          undefined,
          () => {
            // Fallback texture
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = 256
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#cccccc'
            ctx.fillRect(0, 0, 256, 256)
            const fallbackTexture = new THREE.CanvasTexture(canvas)
            resolve(fallbackTexture)
          }
        )
      })
    })
    
    Promise.all(texturePromises).then(setTextures)
  }, [projects])
  
  // Drag interactions - responsive to mobile/desktop
  useEffect(() => {
    let startX = 0
    let startY = 0
    let startOffset = 0
    let dragging = false
    
    const handleStart = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      startX = clientX
      startY = clientY
      startOffset = currentOffset.current
      dragging = true
      
      // Cancel any ongoing snap
      clearSnapTimeout()
      isSnapping.current = false
      isUserInteracting.current = true
      lastInteractionTime.current = Date.now()
      swipeDirection.current = 0 // Reset swipe direction
      
      // Water effect
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(clientX, clientY, true)
      }
    }
    
    const handleMove = (e) => {
      if (!dragging) return
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      
      // Update interaction time
      lastInteractionTime.current = Date.now()
      
      // Calculate momentum for natural continuation
      const prevOffset = targetOffset.current
      
      if (isMobile) {
        // Mobile: vertical drag = scroll with increased responsiveness (inverted)
        const deltaY = clientY - startY
        targetOffset.current = startOffset + deltaY * 0.05 // More responsive
        // Gradual speed buildup for smoother RGB effect
        const targetSpeed = -deltaY * 0.6
        sliderSpeed.current += (targetSpeed - sliderSpeed.current) * 0.1 // Smooth acceleration
      } else {
        // Desktop: horizontal drag = scroll  
        const deltaX = clientX - startX
        targetOffset.current = startOffset - deltaX * 0.03
        // Gradual speed buildup for smoother RGB effect
        const targetSpeed = -deltaX * 0.5
        sliderSpeed.current += (targetSpeed - sliderSpeed.current) * 0.1 // Smooth acceleration
      }
      
      // Calculate momentum (velocity) for continuation effect
      momentum.current = (targetOffset.current - prevOffset) * 0.8 + momentum.current * 0.2 // Smooth momentum
      
      // Water effect
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(clientX, clientY, true)
      }
    }
    
    const handleEnd = () => {
      dragging = false
      isUserInteracting.current = false
      
      // Use momentum to determine direction and add continuation
      if (Math.abs(momentum.current) > 0.1) { // Only if there's significant momentum
        swipeDirection.current = momentum.current > 0 ? 1 : -1
        
        // Add momentum continuation - slider keeps moving in swipe direction
        const momentumDistance = Math.min(Math.abs(momentum.current) * 15, 8) // Scale and cap momentum
        const continuationOffset = momentumDistance * swipeDirection.current
        targetOffset.current += continuationOffset
        
        // Set momentum to decay naturally
        momentum.current *= 0.3
      } else {
        // Small movement - just center to nearest
        swipeDirection.current = 0
      }
      
      // Schedule snap to center after user stops dragging
      scheduleSnap()
      
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(0, 0, false)
      }
    }
    
    let wheelEndTimeout = null
    
    const handleWheel = (e) => {
      e.preventDefault()
      
      // Clear previous wheel end timeout
      if (wheelEndTimeout) {
        clearTimeout(wheelEndTimeout)
        wheelEndTimeout = null
      }
      
      // Cancel any ongoing snap and mark as interacting
      clearSnapTimeout()
      isSnapping.current = false
      isUserInteracting.current = true
      lastInteractionTime.current = Date.now()
      
      // Smooth wheel scrolling - accumulate wheel delta for smoother movement
      const wheelDelta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) // Cap max delta
      
      const prevOffset = targetOffset.current
      
      if (isMobile) {
        // Mobile: use deltaY for vertical scrolling with increased responsiveness (inverted)
        targetOffset.current -= wheelDelta * 0.012 // More responsive, inverted direction
        sliderSpeed.current = wheelDelta * 0.7 // More deformation for mobile (corrected direction)
      } else {
        // Desktop: use deltaY for horizontal scrolling - smoother
        targetOffset.current += wheelDelta * 0.008
        sliderSpeed.current = wheelDelta * 0.8 // Stronger deformation
      }
      
      // Calculate momentum (velocity) for continuation effect like drag
      momentum.current = (targetOffset.current - prevOffset) * 0.8 + momentum.current * 0.2 // Smooth momentum
      
      // Schedule wheel end handling like drag
      wheelEndTimeout = setTimeout(() => {
        isUserInteracting.current = false
        
        // Use momentum to determine direction and add continuation like drag
        if (Math.abs(momentum.current) > 0.1) { // Only if there's significant momentum
          swipeDirection.current = momentum.current > 0 ? 1 : -1
          
          // Add momentum continuation - slider keeps moving in scroll direction
          const momentumDistance = Math.min(Math.abs(momentum.current) * 15, 8) // Same as drag
          const continuationOffset = momentumDistance * swipeDirection.current
          targetOffset.current += continuationOffset
          
          // Set momentum to decay naturally
          momentum.current *= 0.3
        } else {
          // Small movement - just center to nearest
          swipeDirection.current = 0
        }
        
        // Schedule snap after momentum continuation
        scheduleSnap()
        wheelEndTimeout = null
      }, 150) // Same delay as drag for natural feel
    }
    
    const canvas = gl.domElement
    
    canvas.addEventListener('mousedown', handleStart)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleEnd)
    canvas.addEventListener('touchstart', handleStart, { passive: true })
    window.addEventListener('touchmove', handleMove, { passive: true })
    window.addEventListener('touchend', handleEnd, { passive: true })
    window.addEventListener('wheel', handleWheel, { passive: false })
    
    return () => {
      canvas.removeEventListener('mousedown', handleStart)
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleEnd)
      canvas.removeEventListener('touchstart', handleStart)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
      window.removeEventListener('wheel', handleWheel)
      
      // Cleanup snap timeout
      clearSnapTimeout()
      
      // Cleanup wheel timeout
      if (wheelEndTimeout) {
        clearTimeout(wheelEndTimeout)
      }
    }
  }, [gl, waterRef, isMobile])
  
  // Animation state
  const [isAnimating, setIsAnimating] = useState(false)
  const [isFading, setIsFading] = useState(false)
  const [fadeProgress, setFadeProgress] = useState(0)
  const [sliderProgress, setSliderProgress] = useState(0)
  const fadeStartOffset = useRef(0)
  
  // Project colors - assign unique color to each project
  const projectColors = [
    '#FF6B6B', // Red - project-1
    '#4ECDC4', // Teal - project-2  
    '#45B7D1', // Blue - project-3
    '#96CEB4', // Green - project-4
    '#FFEAA7', // Yellow - project-5
    '#DDA0DD', // Plum - project-6
    '#98D8C8'  // Mint - project-7
  ]
  
  // Click detection state
  const isClickDragging = useRef(false)
  const clickStartPos = useRef({ x: 0, y: 0 })
  const clickThreshold = 5 // pixels
  
  // Click handler - only trigger if not dragging
  const handleMeshClick = (event) => {
    if (isFading || isClickDragging.current) return
    
    // Calculate which project was clicked
    const uv = event.uv
    if (!uv) return
    
    // Calculate project index from UV position
    const aspect = 24 / (2.0 * 4/3)
    const tilesUV = uv.x * aspect * 1.2
    const tileIndex = Math.floor(tilesUV) % projects.length
    
    // Store current offset as start position
    fadeStartOffset.current = currentOffset.current
    
    // Start both animations together (like before)
    setIsFading(true)
    setFadeProgress(0)
    setSliderProgress(0)
    
    // Notify parent to fade out UI (and never bring it back)
    if (onTransitionStart) {
      onTransitionStart(true)
    }
    
    // No background color change
  }
  
  // Pointer events to detect dragging
  const handlePointerDown = (event) => {
    isClickDragging.current = false
    clickStartPos.current = { x: event.clientX, y: event.clientY }
  }
  
  const handlePointerMove = (event) => {
    if (!clickStartPos.current) return
    
    const deltaX = Math.abs(event.clientX - clickStartPos.current.x)
    const deltaY = Math.abs(event.clientY - clickStartPos.current.y)
    
    if (deltaX > clickThreshold || deltaY > clickThreshold) {
      isClickDragging.current = true
    }
  }
  
  const handlePointerUp = () => {
    // Reset after a short delay to allow click event to fire
    setTimeout(() => {
      isClickDragging.current = false
      clickStartPos.current = null
    }, 50)
  }
  
  // Simple animation loop
  useFrame((state) => {
    if (!material) return
    
    // Handle fade animation (both slider and fade together)
    if (isFading) {
      // Calculate eased progress for FADE
      const fadeBaseSpeed = 0.02 // Original base speed
      const fadeEasingFactor = fadeProgress * fadeProgress * fadeProgress * 2.5 // Cubic easing
      const fadeSpeed = fadeBaseSpeed * (0.2 + fadeEasingFactor) // Start at 20% speed
      const fadeDeltaProgress = Math.min(fadeSpeed, fadeBaseSpeed * 5) // Higher cap
      
      // Calculate eased progress for SLIDER - same curve as fade
      const sliderBaseSpeed = 0.0225 // Original slider speed
      const sliderEasingFactor = sliderProgress * sliderProgress * sliderProgress * 2.5 // Cubic easing
      const sliderSpeed = sliderBaseSpeed * (0.2 + sliderEasingFactor) // Start at 20% speed
      const sliderDeltaProgress = Math.min(sliderSpeed, sliderBaseSpeed * 5) // Higher cap
      
      // Update fade progress
      setFadeProgress(prev => {
        const newProgress = prev + fadeDeltaProgress
        if (newProgress >= 1.0) {
          // Fade complete - but DON'T reset UI (never comes back)
          return 1.0 // Stay invisible
        }
        return newProgress
      })
      
      // Update slider progress separately
      setSliderProgress(prev => {
        const newProgress = prev + sliderDeltaProgress
        return newProgress // Don't cap slider
      })
      
      // Use slider progress for movement
      const slideDistance = 67
      const animatedOffset = fadeStartOffset.current - (sliderProgress * slideDistance)
      currentOffset.current = animatedOffset
      targetOffset.current = animatedOffset
      
    } else {
      // Always use smooth interpolation between current and target
      const lerpSpeed = isUserInteracting.current ? 0.15 : 0.08 // Faster during interaction, slower when settling
      currentOffset.current += (targetOffset.current - currentOffset.current) * lerpSpeed
      
      // Handle very subtle snapping only when not interacting
      if (isSnapping.current && !isUserInteracting.current) {
        const snapDistance = snapTarget.current - currentOffset.current
        
        // Extremely gentle snap influence - barely noticeable
        const snapInfluence = 0.006 // Much weaker snap force
        const snapDirection = Math.sign(snapDistance)
        const snapForce = Math.min(Math.abs(snapDistance) * snapInfluence, 0.02) // Cap maximum snap force
        
        // Apply gentle bias toward snap target
        targetOffset.current += snapDirection * snapForce
        
        // Stop snapping when reasonably close
        if (Math.abs(snapDistance) < 0.02) {
          isSnapping.current = false
        }
      }
      
      // Apply momentum decay when not interacting
      if (!isUserInteracting.current && Math.abs(momentum.current) > 0.001) {
        momentum.current *= 0.95 // Gradual momentum decay
        targetOffset.current += momentum.current // Continue movement from momentum
      }
      
      // Very subtle continuous centering when idle (almost imperceptible)
      if (!isUserInteracting.current && !isSnapping.current && Math.abs(momentum.current) < 0.01) {
        const continuousSnapTarget = calculateNearestSnapPosition(currentOffset.current, 0)
        const centeringForce = 0.002 // Extremely weak centering
        targetOffset.current += (continuousSnapTarget - targetOffset.current) * centeringForce
      }
      
      // Fade deformation effect - extremely smooth decay for gradual RGB fade
      if (isMobile) {
        sliderSpeed.current *= 0.97  // Much slower fade out (was 0.92)
      } else {
        sliderSpeed.current *= 0.98  // Much slower fade out (was 0.96)
      }
      
      // Hover events
      if (projects.length > 0) {
        const currentProjectIndex = Math.floor(Math.abs(currentOffset.current * 10) % projects.length)
        const currentProject = projects[currentProjectIndex]
        if (currentProject && onHover) {
          onHover(currentProject)
        }
      }
    }
    
    // Update material
    material.updateTime(currentOffset.current)
    material.updateVelocity(sliderSpeed.current)
    material.updateTransition(isFading, fadeProgress, isMobile)
    // No fog color update needed
  })
  
  // Create material with textures
  const material = useMemo(() => {
    if (textures.length === 0) return null
    const mat = createFilmStripMaterial(textures, isMobile)
    return mat
  }, [textures, isMobile])
  
  if (!material) return null
  
  return (
    <mesh 
      ref={meshRef} 
      geometry={geometry} 
      material={material} 
      onClick={handleMeshClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  )
}

export default FilmStripSlider