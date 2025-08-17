import React, { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Custom shader material for the film strip effect
const createFilmStripMaterial = (tiles = [], isMobile = false) => {
  const tilesCount = Math.max(tiles.length, 1)
  const aspect = 24 / (2.0 * 4/3)
  
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
      fogNear: { value: 5 },
      fogFar: { value: 15 }
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
        
        // Simple global deformation like original WebGLSlider
        if (uIsMobile > 0.5) {
          // Mobile: much lighter deformation to prevent flickering
          pos.y = pos.y + ((sin(uv.y * M_PI) * uVelo) * 0.0008);
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
      uniform sampler2D tiles[${tilesCount}];
      uniform float uVelo;
      uniform float uIsMobile;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      varying vec2 vUv;
      varying float vFogDepth;
      
      void main() {
        // Calculate chromatic aberration based on velocity
        float aberrationStrength = abs(uVelo) * 0.005;
        aberrationStrength = min(aberrationStrength, 0.015);
        
        vec2 globalUV = (vUv + vec2(1000. + time * 0.01, 0.));
        vec2 tilesUV = globalUV * vec2(${aspect * 1.2}, 1.);
        float tileIndex = mod(floor(tilesUV.x), ${tilesCount}.0);
        int tileID = int(tileIndex);
        
        vec2 tileUV = fract(tilesUV);
        
        // Create smaller gaps between images with better anti-aliased edges
        float gapSize = 0.05;
        float edgeSmooth = 0.008; // Larger smoothing for better AA
        
        // Use fwidth for pixel-perfect edge smoothing
        float pixelSize = fwidth(tileUV.x);
        float smoothSize = max(edgeSmooth, pixelSize * 2.0);
        
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
        
        // Rotate and scale texture coordinates for mobile
        if (uIsMobile > 0.5) {
          vec2 center = vec2(0.5, 0.5);
          tileUV -= center;
          
          // Rotate 90 degrees clockwise (correct orientation)
          tileUV = vec2(tileUV.y, -tileUV.x);
          
          // Scale down to zoom out more
          tileUV *= 0.5;
          
          tileUV += center;
        }
        
        vec4 tileColor = vec4(0);
        
        ${tilesLoop}
        
        // Apply fog
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        vec3 finalColor = mix(tileColor.rgb, fogColor, fogFactor);
        
        gl_FragColor = vec4(finalColor, tileColor.a);
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
  
  material.updateTiles = function(tiles) {
    if (tiles.length > 0) {
      this.uniforms.tiles.value = tiles
    }
  }
  
  return material
}

const FilmStripSlider = ({ projects = [], onHover, waterRef }) => {
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
  const lastOffset = useRef(0)
  const lastMouseY = useRef(0)
  const lastMoveTime = useRef(0)
  
  // Create curved geometry
  const geometry = useMemo(() => {
    const splineSegments = 300
    const filmWidth = 3.5 // Lower height for better proportions
    
    let curve
    if (isMobile) {
      // Vertical curve for mobile - same shape but rotated 90 degrees
      curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 20, -6.0),    // Far top - off screen
        new THREE.Vector3(0, 12, -5.0),    // Top - going back
        new THREE.Vector3(0, 8, -3.0),     // Top curve - back
        new THREE.Vector3(0, 6, -1.0),     // Top corner - transition
        new THREE.Vector3(0, 5, 0),        // Top edge of front
        new THREE.Vector3(0, 2, 0),        // Top center front
        new THREE.Vector3(0, 0, 0),        // Center front
        new THREE.Vector3(0, -2, 0),       // Bottom center front
        new THREE.Vector3(0, -5, 0),       // Bottom edge of front
        new THREE.Vector3(0, -6, -1.0),    // Bottom corner - transition
        new THREE.Vector3(0, -8, -3.0),    // Bottom curve - back
        new THREE.Vector3(0, -12, -5.0),   // Bottom - going back
        new THREE.Vector3(0, -20, -6.0)    // Far bottom - off screen
      ], false, "catmullrom", 1)
    } else {
      // Horizontal curve for desktop - left to right
      curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-20, 0, -6.0),   // Far left - off screen
        new THREE.Vector3(-12, 0, -5.0),   // Left - going back
        new THREE.Vector3(-8, 0, -3.0),    // Left curve - back
        new THREE.Vector3(-6, 0, -1.0),    // Left corner - transition
        new THREE.Vector3(-5, 0, 0),       // Left edge of front
        new THREE.Vector3(-2, 0, 0),       // Left center front
        new THREE.Vector3(0, 0, 0),        // Center front
        new THREE.Vector3(2, 0, 0),        // Right center front
        new THREE.Vector3(5, 0, 0),        // Right edge of front
        new THREE.Vector3(6, 0, -1.0),     // Right corner - transition
        new THREE.Vector3(8, 0, -3.0),     // Right curve - back
        new THREE.Vector3(12, 0, -5.0),    // Right - going back
        new THREE.Vector3(20, 0, -6.0)     // Far right - off screen
      ], false, "catmullrom", 1)
    }
    
    const curvePoints = curve.getSpacedPoints(splineSegments)
    
    // Create plane geometry with optimal subdivisions for quality and deformation
    const geo = new THREE.PlaneGeometry(1, 1, splineSegments, 16)
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
            tex.colorSpace = THREE.SRGBColorSpace
            tex.generateMipmaps = true
            tex.wrapS = THREE.ClampToEdgeWrapping
            tex.wrapT = THREE.ClampToEdgeWrapping
            tex.minFilter = THREE.LinearMipmapLinearFilter
            tex.magFilter = THREE.LinearFilter
            tex.anisotropy = gl.capabilities.getMaxAnisotropy()
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
      
      // Water effect
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(clientX, clientY, true)
      }
    }
    
    const handleMove = (e) => {
      if (!dragging) return
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      
      if (isMobile) {
        // Mobile: vertical drag = scroll with reduced deformation
        const deltaY = clientY - startY
        targetOffset.current = startOffset - deltaY * 0.03
        sliderSpeed.current = -deltaY * 0.2 // Much lighter deformation for mobile
      } else {
        // Desktop: horizontal drag = scroll  
        const deltaX = clientX - startX
        targetOffset.current = startOffset - deltaX * 0.03
        sliderSpeed.current = -deltaX * 0.5 // Stronger deformation for desktop
      }
      
      // Water effect
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(clientX, clientY, true)
      }
    }
    
    const handleEnd = () => {
      dragging = false
      
      if (waterRef?.current?.updateMouse) {
        waterRef.current.updateMouse(0, 0, false)
      }
    }
    
    const handleWheel = (e) => {
      e.preventDefault()
      
      // Smooth wheel scrolling - accumulate wheel delta for smoother movement
      const wheelDelta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) // Cap max delta
      
      if (isMobile) {
        // Mobile: use deltaY for vertical scrolling with reduced deformation
        targetOffset.current += wheelDelta * 0.008
        sliderSpeed.current = wheelDelta * 0.3 // Much lighter deformation for mobile
      } else {
        // Desktop: use deltaY for horizontal scrolling - smoother
        targetOffset.current += wheelDelta * 0.008
        sliderSpeed.current = wheelDelta * 0.8 // Stronger deformation
      }
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
    }
  }, [gl, waterRef, isMobile])
  
  // Simple animation loop
  useFrame((state) => {
    if (!material) return
    
    // Smooth interpolation
    currentOffset.current += (targetOffset.current - currentOffset.current) * 0.1
    
    // Fade deformation effect (faster fade on mobile to prevent flickering)
    if (isMobile) {
      sliderSpeed.current *= 0.85 // Much faster fade on mobile
    } else {
      sliderSpeed.current *= 0.92 // Normal fade on desktop
    }
    
    // Update material
    material.updateTime(currentOffset.current)
    material.updateVelocity(sliderSpeed.current)
    
    // Debug: log velocity when it's not zero
    if (Math.abs(sliderSpeed.current) > 0.1) {
      console.log('Velocity:', sliderSpeed.current)
    }
    
    // Hover events
    if (projects.length > 0) {
      const currentProjectIndex = Math.floor(Math.abs(currentOffset.current * 10) % projects.length)
      const currentProject = projects[currentProjectIndex]
      if (currentProject && onHover) {
        onHover(currentProject)
      }
    }
  })
  
  // Create material with textures
  const material = useMemo(() => {
    if (textures.length === 0) return null
    const mat = createFilmStripMaterial(textures, isMobile)
    return mat
  }, [textures, isMobile])
  
  if (!material) return null
  
  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  )
}

export default FilmStripSlider