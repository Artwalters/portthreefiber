import React, { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { isMobileDevice } from '../utils/deviceDetection'
import { gsap } from 'gsap'

// Custom shader material for the film strip effect
const createFilmStripMaterial = (tiles = [], isMobile = false) => {
  // Critical: Limit uniform array size for mobile Safari compatibility
  const maxUniforms = isMobile ? 8 : 16 // Mobile Safari limit: ~64 fragment uniforms total
  const tilesCount = Math.min(Math.max(tiles.length, 1), maxUniforms)
  const aspect = isMobile ? 24 / 3.3 : 30 / 3.3  // Mobile: original, Desktop: more square
  
  // Slice tiles array to respect mobile limits
  const limitedTiles = tiles.slice(0, tilesCount)
  
  // Generate texture sampling loop
  const tilesLoop = Array.from({length: tilesCount}, (_, tID) => {
    return `
      if (tileID == ${tID}) { tileColor = texture2D(tiles[${tID}], tileUV); }
    `
  }).join("")
  
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      tiles: { value: limitedTiles.length > 0 ? limitedTiles : [new THREE.Texture()] },
      uVelo: { value: 0 },
      uIsMobile: { value: isMobile ? 1.0 : 0.0 },
      fogColor: { value: new THREE.Color(0xffffff) },
      fogNear: { value: isMobile ? 8 : 5 },
      fogFar: { value: isMobile ? 15 : 12 },
      fogIntensity: { value: 1.0 }, // Dynamic fog intensity multiplier
      dynamicFogNear: { value: isMobile ? 8 : 5 }, // Dynamic fog near plane
      dynamicFogFar: { value: isMobile ? 15 : 12 }, // Dynamic fog far plane
      uIsTransitioning: { value: 0 },
      uSweepPosition: { value: -25 },
      uIsFlyingIn: { value: 0 },
      uFlyInPosition: { value: -25 },
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
        
        // Simple global deformation like original WebGLSlider - 50% less intense
        if (uIsMobile > 0.5) {
          // Mobile: reduced deformation intensity
          pos.y = pos.y + ((sin(uv.y * M_PI) * uVelo) * 0.00075);
        } else {
          // Desktop: reduced deformation intensity  
          pos.x = pos.x - ((sin(uv.y * M_PI) * uVelo) * 0.0008);
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
      #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
      #else
        precision mediump float;
      #endif
      
      uniform float time;
      uniform sampler2D tiles[${tilesCount}];
      uniform float uVelo;
      uniform float uIsMobile;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      uniform float fogIntensity;
      uniform float dynamicFogNear;
      uniform float dynamicFogFar;
      uniform float uIsTransitioning;
      uniform float uSweepPosition;
      uniform float uIsFlyingIn;
      uniform float uFlyInPosition;
      varying vec2 vUv;
      varying float vFogDepth;
      varying float vWorldX;
      varying float vWorldY;
      
      void main() {
        // Calculate chromatic aberration - always present with base amount
        float baseAberration = 0.0008; // Very subtle RGB split (reduced from 0.0021)
        float velocityAberration = abs(uVelo) * 0.0003; // Minimal additional based on movement (reduced from 0.0007)
        
        // Combine base and velocity-based aberration
        float aberrationStrength = baseAberration + velocityAberration;
        aberrationStrength = min(aberrationStrength, 0.0015); // Very low maximum for extreme subtlety (reduced from 0.0042)
        
        vec2 globalUV = (vUv + vec2(1000. + time * 0.01, 0.));
        vec2 tilesUV = globalUV * vec2(${aspect * 1.2}, 1.);
        float tileIndex = mod(floor(tilesUV.x), ${tilesCount}.0);
        int tileID = int(tileIndex);
        
        vec2 tileUV = fract(tilesUV);
        
        // Dynamic gap size based on movement - smaller gaps when moving
        float baseGapSize = 0.035; // Reduced from 0.05 for tighter spacing
        float movementFactor = abs(uVelo) * 0.001; // Scale movement to gap reduction
        float gapSize = baseGapSize * (1.0 - min(movementFactor, 0.9)); // Reduce gaps up to 90% during movement
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
          
          // Rotate 90 degrees counterclockwise but flip X to fix mirroring
          tileUV = vec2(tileUV.y, tileUV.x);
          
          tileUV += center;
        }
        
        // Zoom in on the texture to cover the entire plane and eliminate artifacts
        vec2 center = vec2(0.5, 0.5);
        tileUV -= center;
        float baseZoom = 0.85; // Base zoom to cover plane - all images normal size
        tileUV *= baseZoom;
        tileUV += center;
        
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
        
        // Calculate fly-in transition (reverse leegloop effect)
        if (uIsFlyingIn > 0.5) {
          float fadeWidth = 3.0;
          float flyInAlpha;
          
          if (uIsMobile > 0.5) {
            // Mobile: top-to-bottom fly-in sweep (vertical) - REVERSE smoothstep
            flyInAlpha = 1.0 - smoothstep(uFlyInPosition - fadeWidth, uFlyInPosition, vWorldY);
          } else {
            // Desktop: left-to-right fly-in sweep (horizontal) - REVERSE smoothstep
            flyInAlpha = 1.0 - smoothstep(uFlyInPosition - fadeWidth, uFlyInPosition, vWorldX);
          }
          
          if (flyInAlpha < 0.5) {  // Now pixels appear as sweep passes
            discard;
          }
        }
        
        // Apply fog with dynamic near/far planes for transition effects
        float fogFactor = smoothstep(dynamicFogNear, dynamicFogFar, vFogDepth);
        // Make fog curve more aggressive in the back
        fogFactor = fogFactor * fogFactor; // Quadratic curve - less fog in front, stronger in back
        
        // Apply dynamic fog intensity during transitions
        fogFactor = fogFactor * fogIntensity;
        fogFactor = min(fogFactor, 0.98); // Cap at 98% for extreme fog
        
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
  
  material.updateFlyIn = function(isFlyingIn, progress) {
    this.uniforms.uIsFlyingIn.value = isFlyingIn ? 1.0 : 0.0
    
    // Determine if mobile based on existing uniform
    const isMobile = this.uniforms.uIsMobile.value > 0.5
    
    if (isMobile) {
      // Mobile: sweep from top (-15) to bottom (+15) for vertical orientation
      const flyInPosition = -15 + (progress * 30)
      this.uniforms.uFlyInPosition.value = flyInPosition
    } else {
      // Desktop: sweep from left (-25) to right (+25) for horizontal orientation  
      const flyInPosition = -25 + (progress * 50)
      this.uniforms.uFlyInPosition.value = flyInPosition
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

const IndexSlider = ({ projects = [], onHover, waterRef, onTransitionStart, onTransitionComplete, onBackgroundColorChange, onImageSelect, isReturningFromGallery = false, onFlyInComplete, onFogUpdate }) => {
  const meshRef = useRef()
  const [textures, setTextures] = useState([])
  const { gl } = useThree()
  
  // Comprehensive mobile detection using deviceDetection utility
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => {
      // Use comprehensive device detection instead of just screen width
      const mobileDetected = isMobileDevice()
      setIsMobile(mobileDetected)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  // Use refs for real-time values
  const targetOffset = useRef(0)
  const currentOffset = useRef(0)
  const sliderSpeed = useRef(0)
  const userInfluenceFactor = useRef(1) // Gradual build-up of user control (0 = no control, 1 = full control)
  const animationEndTime = useRef(0) // When animation ended for gradual build-up
  const isAnimationCancelled = useRef(false) // Direct flag for immediate cancellation

  // Center snapping state
  const isSnapping = useRef(false)
  const snapTimeout = useRef(null)
  const lastInteractionTime = useRef(0)
  const snapTarget = useRef(0)
  const swipeDirection = useRef(0) // -1 = left, 1 = right, 0 = no direction
  const isUserInteracting = useRef(false) // Track if user is actively dragging/scrolling
  const momentum = useRef(0) // Track momentum for natural continuation

  // Drag state - must be ref to persist across re-renders
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartY = useRef(0)
  const dragStartOffset = useRef(0)
  
  
  // Center snapping functions
  const calculateNearestSnapPosition = (currentPos, direction = 0) => {
    const itemWidth = isMobile ? 2.3 : 3.5 // Same spacing as used elsewhere
    
    // The shader maps UV coordinates to tile positions
    // At screen center (vUv.x = 0.5), we want a project to be perfectly centered
    // We need to calculate what offset value will place a project exactly at screen center
    
    // From shader: tilesUV = (vUv + vec2(1000. + time * 0.01, 0.)) * vec2(aspect * 1.2, 1.)
    // At screen center vUv.x = 0.5, so we want: (0.5 + 1000.0 + offset * 0.01) * aspect * 1.2
    // to align with a project boundary
    
    const aspect = isMobile ? 24 / 3.3 : 30 / 3.3
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
    const splineSegments = isMobile ? 100 : 150 // Reduced segments for performance
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
      
      // Rotate for mobile: 90 degrees and move forward subtly closer to camera
      const rotatedPoints = mobileCurve.points.map(point => 
        new THREE.Vector3(0, point.x, point.z + 0.8) // X → Y, Y → 0, Z moved forward by 0.8 units (subtly closer)
      )
      curve = new THREE.CatmullRomCurve3(rotatedPoints, false, "catmullrom", 0.5)
    } else {
      // Desktop curve - subtle extension
      curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-20, 0, -7.5),   // Far left - slightly further off screen
        new THREE.Vector3(-12, 0, -4.0),   // Left curve start
        new THREE.Vector3(-6, 0, -0.2),    // Left transition to flat
        new THREE.Vector3(0, 0, 0.2),      // Center flat
        new THREE.Vector3(6, 0, -0.2),     // Right transition from flat
        new THREE.Vector3(12, 0, -4.0),    // Right curve start
        new THREE.Vector3(20, 0, -7.5)     // Far right - slightly further off screen
      ], false, "catmullrom", 0.5)
    }
    
    const curvePoints = curve.getSpacedPoints(splineSegments)
    
    // Create plane geometry with optimized subdivisions
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
            // Maximum quality texture settings
            tex.generateMipmaps = true // Enable mipmaps for better performance
            tex.wrapS = THREE.RepeatWrapping // Allow texture to repeat and cover full plane
            tex.wrapT = THREE.RepeatWrapping // Prevents edge artifacts
            // Use nearest neighbor for pixel-perfect sharpness
            tex.minFilter = THREE.LinearFilter
            tex.magFilter = THREE.LinearFilter
            // Maximum anisotropic filtering for sharp textures at angles
            tex.anisotropy = Math.min(isMobile ? 4 : 8, gl.capabilities.getMaxAnisotropy()) // Reduced for performance
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
    const handleStart = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      dragStartX.current = clientX
      dragStartY.current = clientY
      dragStartOffset.current = currentOffset.current // Use current position as baseline, not target
      isDragging.current = true

      // Cancel any ongoing snap
      clearSnapTimeout()
      isSnapping.current = false
      isUserInteracting.current = true
      lastInteractionTime.current = Date.now()
      swipeDirection.current = 0 // Reset swipe direction

      // KILL ANIMATION COMPLETELY - take full control
      if (flyInTween.current) {
        // CRITICAL: Set cancellation flag FIRST before anything else
        isAnimationCancelled.current = true

        // Force user control immediately to prevent useFrame race condition
        isUserInteracting.current = true
        userInfluenceFactor.current = 1

        // Ensure mesh is visible when taking control
        setIsInitiallyVisible(true)

        // Capture current animated position BEFORE killing
        const currentAnimatedOffset = currentOffset.current

        // KILL GSAP completely - stop all animations
        try {
          flyInTween.current.kill()
          flyInTween.current = null
          setIsFlyingIn(false)
        } catch (e) {
          console.warn('GSAP kill error:', e)
          flyInTween.current = null
          setIsFlyingIn(false)
        }

        // Freeze position at current location
        currentOffset.current = currentAnimatedOffset // Lock current position
        targetOffset.current = currentAnimatedOffset // Lock target position
        dragStartOffset.current = currentAnimatedOffset // Update drag start to current position

        sliderSpeed.current = 0
        animationEndTime.current = 0 // Reset animation timing

        // Reset momentum and snapping for clean transition
        momentum.current = 0
        swipeDirection.current = 0
        isSnapping.current = false
        clearSnapTimeout()
      }

      // Also stop build-up if it's still running (extra safety)
      if (animationEndTime.current > 0) {
        animationEndTime.current = 0
        userInfluenceFactor.current = 1
      }
      
      // Water effect
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(clientX, clientY, true)
      }
    }
    
    const handleMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY

      // Mouse position updates are handled in handleMouseMove

      if (!isDragging.current) return

      // Update interaction time
      lastInteractionTime.current = Date.now()

      // Calculate momentum for natural continuation
      const prevOffset = targetOffset.current

      // Normal drag handling - always allow user control
      let newTargetOffset
      let dragDelta = 0

      if (isMobile) {
        // Mobile: vertical drag = scroll with increased responsiveness (inverted)
        const deltaY = clientY - dragStartY.current
        dragDelta = deltaY * 0.05
        newTargetOffset = dragStartOffset.current + dragDelta // More responsive
        // Gradual speed buildup for smoother RGB effect - 50% less intense
        const targetSpeed = -deltaY * 0.3
        sliderSpeed.current += (targetSpeed - sliderSpeed.current) * 0.1 // Smooth acceleration
      } else {
        // Desktop: horizontal drag = scroll
        const deltaX = clientX - dragStartX.current
        dragDelta = -deltaX * 0.03
        newTargetOffset = dragStartOffset.current + dragDelta
        // Gradual speed buildup for smoother RGB effect - 50% less intense
        const targetSpeed = -deltaX * 0.25
        sliderSpeed.current += (targetSpeed - sliderSpeed.current) * 0.1 // Smooth acceleration
      }
      
      // Always apply full user control during interaction
      targetOffset.current = newTargetOffset
      
      // Calculate momentum (velocity) for continuation effect
      momentum.current = (targetOffset.current - prevOffset) * 0.8 + momentum.current * 0.2 // Smooth momentum
      
      // Water effect
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(clientX, clientY, true)
      }
    }
    
    const handleEnd = () => {
      isDragging.current = false
      isUserInteracting.current = false
      
      // No special fly-in handling needed - animation is cancelled on interaction
      
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

      // KILL ANIMATION COMPLETELY - take full control
      if (flyInTween.current) {
        // CRITICAL: Set cancellation flag FIRST before anything else
        isAnimationCancelled.current = true

        // Force user control immediately to prevent useFrame race condition
        isUserInteracting.current = true
        userInfluenceFactor.current = 1

        // Ensure mesh is visible when taking control
        setIsInitiallyVisible(true)

        // Capture current animated position BEFORE killing
        const currentAnimatedOffset = currentOffset.current

        // KILL GSAP completely - stop all animations
        try {
          flyInTween.current.kill()
          flyInTween.current = null
          setIsFlyingIn(false)
        } catch (e) {
          console.warn('GSAP kill error:', e)
          flyInTween.current = null
          setIsFlyingIn(false)
        }

        // Freeze position at current location
        currentOffset.current = currentAnimatedOffset // Lock current position
        targetOffset.current = currentAnimatedOffset // Lock target position

        sliderSpeed.current = 0
        animationEndTime.current = 0 // Reset animation timing

        // Reset momentum and snapping for clean transition
        momentum.current = 0
        swipeDirection.current = 0
        isSnapping.current = false
        clearSnapTimeout()
      }

      // Also stop build-up if it's still running (extra safety)
      if (animationEndTime.current > 0) {
        animationEndTime.current = 0
        userInfluenceFactor.current = 1
      }
      
      // Smooth wheel scrolling - accumulate wheel delta for smoother movement
      const wheelDelta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) // Cap max delta
      
      const prevOffset = targetOffset.current
      let scrollDelta = 0
      
      if (isMobile) {
        // Mobile: use deltaY for vertical scrolling with increased responsiveness (inverted)
        scrollDelta = -wheelDelta * 0.012
        targetOffset.current += scrollDelta // Always update, even during animations
        sliderSpeed.current = wheelDelta * 0.35 // 50% less intense barrel distortion
      } else {
        // Desktop: use deltaY for horizontal scrolling - smoother
        scrollDelta = wheelDelta * 0.008
        targetOffset.current += scrollDelta // Always update, even during animations
        sliderSpeed.current = wheelDelta * 0.8 // Stronger deformation
      }
      
      // No special fly-in handling - animation gets cancelled above
      
      let scrollAmount = 0
      if (isMobile) {
        // Mobile: use deltaY for vertical scrolling with increased responsiveness (inverted)
        scrollAmount = -wheelDelta * 0.012
        // Only update sliderSpeed if not during fly-in animation
        if (!isFlyingIn) {
          sliderSpeed.current = wheelDelta * 0.35 // 50% less intense barrel distortion
        }
      } else {
        // Desktop: use deltaY for horizontal scrolling - smoother
        scrollAmount = wheelDelta * 0.008
        // Only update sliderSpeed if not during fly-in animation
        if (!isFlyingIn) {
          sliderSpeed.current = wheelDelta * 0.4 // 50% less intense barrel distortion
        }
      }
      
      // Always apply full user control during scroll
      targetOffset.current += scrollAmount
      
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
  const [isFading, setIsFading] = useState(false)
  const [fadeProgress, setFadeProgress] = useState(0)
  const [sliderProgress, setSliderProgress] = useState(0)
  const fadeStartOffset = useRef(0)
  const hasCompletionFired = useRef(false)
  const isAnimationEnding = useRef(false) // For smooth velocity fade-out after animations
  const [fogIntensity, setFogIntensity] = useState(1.0) // Dynamic fog intensity
  
  // Fly-in animation state with GSAP
  const [isFlyingIn, setIsFlyingIn] = useState(false)
  const [flyInProgress, setFlyInProgress] = useState(0)
  const flyInStartOffset = useRef(0)
  const flyInTween = useRef(null) // GSAP tween reference
  const [isInitiallyVisible, setIsInitiallyVisible] = useState(true) // Track initial visibility
  
  // Initialize user influence for normal usage (not after animation)
  useEffect(() => {
    if (!isReturningFromGallery && !isFlyingIn) {
      userInfluenceFactor.current = 1 // Full control for normal usage
      animationEndTime.current = 0
    }
  }, [isReturningFromGallery, isFlyingIn])
  
  // Handle fly-in animation when returning from gallery
  useEffect(() => {
    if (isReturningFromGallery && !isFlyingIn) {
      // Hide mesh first to prevent flicker
      setIsInitiallyVisible(false)

      // Force slider to start position BEFORE making visible
      const slideDistance = 67
      flyInStartOffset.current = slideDistance // Start from right side
      currentOffset.current = slideDistance // Force immediate position update
      targetOffset.current = slideDistance // Ensure target matches

      // Reset animation state
      isAnimationCancelled.current = false // Reset cancellation flag
      clearSnapTimeout()
      isSnapping.current = false

      // Kill any existing tween
      if (flyInTween.current) {
        flyInTween.current.kill()
      }

      // Start animation state immediately
      setIsFlyingIn(true)

      // Create GSAP animation for perfect smooth fly-in - 2 seconds for good balance
      const animObj = { progress: 0, velocity: 0 }
      flyInTween.current = gsap.timeline()
          .to(animObj, {
            progress: 1,
            duration: 2, // Perfect balance - not too fast, not too slow
            ease: "power3.out", // Super smooth ease-out
            onUpdate: () => {
              setFlyInProgress(animObj.progress)
            }
          })
          .to(animObj, {
            velocity: 0,
            duration: 2, // Same 2 seconds duration
            ease: "power2.inOut",
            onUpdate: () => {
              // Update velocity for barrel distortion effects
              const targetVelocity = (1 - animObj.progress) * 400
              sliderSpeed.current += (targetVelocity - sliderSpeed.current) * 0.2
            },
            onComplete: () => {
              // Mark animation as complete
              setIsFlyingIn(false)
              flyInTween.current = null
              sliderSpeed.current = 0
              isAnimationEnding.current = false
              
              // Start gradual user influence build-up
              animationEndTime.current = Date.now()
              userInfluenceFactor.current = 0 // Start with no user control
              
              // Reset any accumulated momentum/movement
              momentum.current = 0
              swipeDirection.current = 0
              
              // Notify parent that fly-in is complete
              if (onFlyInComplete) {
                onFlyInComplete()
              }
            }
          }, 0) // Start at same time as progress animation

      // Wait 2 frames for position to stabilize, then make visible
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsInitiallyVisible(true)
        })
      })
    }
  }, [isReturningFromGallery, isFlyingIn])
  
  // Cleanup GSAP on unmount
  useEffect(() => {
    return () => {
      if (flyInTween.current) {
        flyInTween.current.kill()
      }
    }
  }, [])
  
  // Project colors - assign unique color to each project
  
  // Click detection state
  const isClickDragging = useRef(false)
  const clickStartPos = useRef({ x: 0, y: 0 })
  const clickThreshold = 5 // pixels
  
  // Click handler - allow clicks during fly-in but interrupt animation
  const handleMeshClick = (event) => {
    if (isFading || isClickDragging.current) return
    
    // If clicking during fly-in, interrupt the animation first
    if (isFlyingIn) {
      // Immediate cancellation to prevent useFrame from overriding position
      isAnimationCancelled.current = true

      // Ensure mesh is visible when taking control
      setIsInitiallyVisible(true)

      // Stop GSAP animation immediately
      if (flyInTween.current) {
        flyInTween.current.kill()
        flyInTween.current = null
      }

      // Capture and freeze current position
      const currentAnimatedOffset = currentOffset.current
      targetOffset.current = currentAnimatedOffset

      // Clean up fly-in state
      setIsFlyingIn(false)
      animationEndTime.current = 0
      userInfluenceFactor.current = 1 // Full control immediately
      sliderSpeed.current = 0

      // Reset any momentum
      momentum.current = 0
      swipeDirection.current = 0

      // Continue with click processing after interruption
    }
    
    // Calculate which project was clicked
    const uv = event.uv
    if (!uv) return
    
    // Use exact same logic as fragment shader to calculate tile
    const aspect = isMobile ? 24 / 3.3 : 30 / 3.3
    const globalUV = uv.x + 1000.0 + currentOffset.current * 0.01
    const tilesUV = globalUV * aspect * 1.2
    const tileIndex = Math.floor(tilesUV) % Math.max(textures.length, 1)
    
    // Check if we're actually clicking on a visible texture (not a gap)
    let tileUV = { 
      x: (tilesUV - Math.floor(tilesUV)), 
      y: uv.y 
    }
    
    // Apply mobile rotation if needed (same as shader)
    if (isMobile) {
      const center = { x: 0.5, y: 0.5 }
      tileUV.x -= center.x
      tileUV.y -= center.y
      // Rotate 90 degrees counterclockwise but flip X: (x,y) -> (y,x)  
      const rotatedX = tileUV.y
      const rotatedY = tileUV.x
      tileUV.x = rotatedX + center.x
      tileUV.y = rotatedY + center.y
    }
    
    // Same gap logic as shader
    const gapSize = 0.035
    const isInTexture = (tileUV.x >= gapSize && tileUV.x <= (1.0 - gapSize))
    
    // Only process click if we're actually on a texture (not a gap)
    if (!isInTexture || tileIndex < 0 || tileIndex >= textures.length) {
      return // Clicked on gap or invalid area
    }
    
    
    // Pass the project index (tileIndex is the project index)
    if (onImageSelect) {
      onImageSelect(tileIndex)
    }
    
    // Store current offset as start position
    fadeStartOffset.current = currentOffset.current
    
    // Reset completion flag for new animation
    hasCompletionFired.current = false
    
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
  useFrame((state, delta) => {
    if (!material) return
    
    // Update fog intensity and position based on animation states
    if (isFading) {
      // Accelerate fog intensification - reach peak faster, at 80% of animation
      const acceleratedProgress = Math.min(fadeProgress * 1.25, 1.0)
      const targetFogIntensity = 1.0 + (acceleratedProgress * 2.0) // Goes up to 3x fog intensity
      setFogIntensity(targetFogIntensity)
      
      // Move fog closer to camera - fog comes forward
      const baseFogNear = isMobile ? 8 : 5
      const baseFogFar = isMobile ? 15 : 12
      const dynamicFogNear = baseFogNear - (acceleratedProgress * (baseFogNear - 1.0)) // Fog moves to 1.0
      const dynamicFogFar = baseFogFar - (acceleratedProgress * 6) // Far plane comes forward moderately
      
      if (material) {
        material.updateDynamicFog(dynamicFogNear, dynamicFogFar)
      }

      // Update scene fog via callback
      if (onFogUpdate) {
        onFogUpdate(dynamicFogNear, dynamicFogFar)
      }
    } else if (flyInTween.current) {
      // Start with 3x fog, then decrease smoothly during fly-in - 20% slower retreat
      // Use slower easeOut curve for delayed fog retreat
      // Check flyInTween instead of isFlyingIn (more reliable)
      const slowerProgress = flyInProgress * 0.8 // 20% slower fog retreat
      const easedProgress = 1 - Math.pow(1 - slowerProgress, 2) // EaseOut curve with slower timing
      const targetFogIntensity = 3.0 - (easedProgress * 2.0) // From 3x down to 1x (normal)
      setFogIntensity(targetFogIntensity)

      // Fog starts close and moves back to normal - also 20% slower
      const baseFogNear = isMobile ? 8 : 5
      const baseFogFar = isMobile ? 15 : 12
      const dynamicFogNear = 1.0 + (easedProgress * (baseFogNear - 1.0)) // Start at 1.0, move back slower
      const dynamicFogFar = (baseFogFar - 6) + (easedProgress * 6) // Far plane moves back slower

      if (material) {
        material.updateDynamicFog(dynamicFogNear, dynamicFogFar)
      }

      // Update scene fog via callback
      if (onFogUpdate) {
        onFogUpdate(dynamicFogNear, dynamicFogFar)
      }
    } else {
      // Gradually return to normal fog when not animating
      setFogIntensity(prev => prev + (1.0 - prev) * 0.08) // Slightly faster return to normal

      // Return fog planes to normal
      const baseFogNear = isMobile ? 8 : 5
      const baseFogFar = isMobile ? 15 : 12
      if (material) {
        material.updateDynamicFog(baseFogNear, baseFogFar)
      }

      // Update scene fog via callback
      if (onFogUpdate) {
        onFogUpdate(baseFogNear, baseFogFar)
      }
    }
    
    // Handle fade animation (both slider and fade together)
    if (isFading) {
      // Time-based animation duration (consistent across all framerates)
      // Both animations use SAME duration for perfect synchronization
      const animationDuration = 533  // ~0.53 seconds - 1/3 faster than 800ms
      
      // Calculate base delta progress (time-independent)
      const baseDelta = delta / (animationDuration / 1000)
      
      // Calculate eased progress for FADE
      const fadeEasingFactor = fadeProgress * fadeProgress * fadeProgress * 2.5 // Cubic easing
      const fadeSpeed = baseDelta * (0.2 + fadeEasingFactor) // Start at 20% speed
      const fadeDeltaProgress = Math.min(fadeSpeed, baseDelta * 5) // Higher cap
      
      // Calculate eased progress for SLIDER - SAME timing as fade for perfect sync
      const sliderEasingFactor = sliderProgress * sliderProgress * sliderProgress * 2.5 // Cubic easing
      const sliderAnimSpeed = baseDelta * (0.2 + sliderEasingFactor) // Start at 20% speed
      const sliderDeltaProgress = Math.min(sliderAnimSpeed, baseDelta * 5) // Higher cap
      
      // Update fade progress
      setFadeProgress(prev => {
        const newProgress = prev + fadeDeltaProgress
        if (newProgress >= 1.0) {
          // Fade complete - trigger completion callback once
          if (!hasCompletionFired.current && onTransitionComplete) {
            hasCompletionFired.current = true
            onTransitionComplete()
          }
          // Start smooth velocity fade-out
          isAnimationEnding.current = true
          setIsFading(false) // Stop animation, allow smooth velocity fade-out
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
      
      // Calculate velocity for barrel distortion and RGB effects during animation
      const offsetDelta = animatedOffset - currentOffset.current
      const targetAnimSpeed = offsetDelta * 400 // Reduced intensity + Target animation speed
      
      // Gradually build up to target speed instead of instant (smoother barrel distortion)
      sliderSpeed.current += (targetAnimSpeed - sliderSpeed.current) * 0.15
      
      currentOffset.current = animatedOffset
      targetOffset.current = animatedOffset
      
    } else if (flyInTween.current && !isAnimationCancelled.current && !isUserInteracting.current) {
      // GSAP-driven fly-in animation - runs until interrupted by user
      // TRIPLE CHECK: flyInTween exists, not cancelled, AND no user interaction
      const slideDistance = 67

      // Apply power2.out easing to the final position (zachte landing)
      const power2Out = (t) => 1 - Math.pow(1 - t, 2)
      const easedProgress = power2Out(flyInProgress)

      const animatedOffset = flyInStartOffset.current - (easedProgress * slideDistance)

      // Animation controls position until user interrupts
      // Use smooth lerping even during animation to prevent glitches
      const animLerpSpeed = 0.3 // Faster lerp during animation
      currentOffset.current += (animatedOffset - currentOffset.current) * animLerpSpeed
      targetOffset.current = animatedOffset
      
    } else {
      // Reset cancellation flag when in normal operation
      if (isAnimationCancelled.current) {
        isAnimationCancelled.current = false
      }
      
      // Handle gradual user influence build-up after fly-in animation
      if (animationEndTime.current > 0) {
        const timeSinceAnimationEnd = (Date.now() - animationEndTime.current) / 1000 // Convert to seconds
        const buildUpDuration = 2 // 2 seconds build-up
        
        if (timeSinceAnimationEnd < buildUpDuration) {
          // Gradual build-up using easeOut curve (fast start, slow end)
          const progress = timeSinceAnimationEnd / buildUpDuration
          const easeOutProgress = 1 - Math.pow(1 - progress, 3) // Cubic ease-out
          userInfluenceFactor.current = easeOutProgress
        } else {
          // Build-up complete - full user control
          userInfluenceFactor.current = 1
          animationEndTime.current = 0 // Stop the build-up process
        }
      }
      
      // Always use smooth interpolation between current and target
      // Extra responsive during fly-in if user starts interacting
      // Use flyInTween check instead of isFlyingIn state
      const lerpSpeed = (isUserInteracting.current || (flyInTween.current && animationEndTime.current === 0)) ? 0.15 : 0.08
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
        if (Math.abs(snapDistance) < 0.01) {
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
      
      // Fade deformation effect - stop updating when very small
      if (Math.abs(sliderSpeed.current) > 0.01) {
        if (isMobile) {
          sliderSpeed.current *= 0.97  // Much slower fade out (was 0.92)
        } else {
          sliderSpeed.current *= 0.98  // Much slower fade out (was 0.96)
        }
      } else {
        sliderSpeed.current = 0 // Stop updating when negligible
        isAnimationEnding.current = false // Animation fade-out complete
        
        // Natural momentum system handles coast-down automatically
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
    // Disable barrel distortion during animations completely
    const velocityToApply = (isFading || isFlyingIn) ? 0 : sliderSpeed.current
    material.updateVelocity(velocityToApply)
    material.updateFogIntensity(fogIntensity)
    
    // Calculate sweep progress to match actual slider speed calculation  
    if (isFading) {
      // Sweep krijgt dezelfde easing als de slider speed calculation gebruikt
      const currentSliderEasing = sliderProgress * sliderProgress * 1.5 // Same als rule 835
      const sliderSpeedFactor = 0.4 + currentSliderEasing // Same als rule 836  
      const proportionalSweepProgress = sliderProgress * sliderSpeedFactor
      material.updateTransition(isFading, Math.min(proportionalSweepProgress, 1.0), isMobile)
    } else {
      material.updateTransition(isFading, sliderProgress, isMobile)
    }
    
    // Use eased progress for sweep timing to match position animation
    // Check flyInTween instead of isFlyingIn for more reliable detection
    if (flyInTween.current) {
      const power2Out = (t) => 1 - Math.pow(1 - t, 2)
      const easedSweepProgress = power2Out(flyInProgress) // Same power2.out als slider movement
      material.updateFlyIn(true, easedSweepProgress)
    } else {
      material.updateFlyIn(false, flyInProgress)
    }

  })
  
  // Create material with textures and context loss recovery
  const material = useMemo(() => {
    if (textures.length === 0) return null
    
    try {
      const mat = createFilmStripMaterial(textures, isMobile)
      
      // Add context loss recovery for mobile stability
      if (isMobile && gl.domElement) {
        const handleContextLost = (event) => {
          event.preventDefault()
          console.warn('WebGL context lost - attempting recovery')
        }
        
        const handleContextRestored = () => {
          console.warn('WebGL context restored - reloading material')
          // Material will be recreated by the dependency change
        }
        
        gl.domElement.addEventListener('webglcontextlost', handleContextLost)
        gl.domElement.addEventListener('webglcontextrestored', handleContextRestored)
        
        // Store cleanup function on material
        mat._contextCleanup = () => {
          gl.domElement.removeEventListener('webglcontextlost', handleContextLost)
          gl.domElement.removeEventListener('webglcontextrestored', handleContextRestored)
        }
      }
      
      return mat
    } catch (error) {
      console.error('Failed to create FilmStripSlider material:', error)
      return null
    }
  }, [textures, isMobile, gl])
  
  // Cleanup context listeners on unmount
  useEffect(() => {
    return () => {
      if (material?._contextCleanup) {
        material._contextCleanup()
      }
    }
  }, [material])
  
  if (!material) return null
  
  return (
    <mesh 
      ref={meshRef} 
      geometry={geometry} 
      material={material} 
      visible={isInitiallyVisible}
      onClick={handleMeshClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  )
}

export default IndexSlider