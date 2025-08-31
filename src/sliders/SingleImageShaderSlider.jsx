import React, { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, useThree, useLoader } from '@react-three/fiber'
import * as THREE from 'three'

// Custom shader material for single repeating image
const createSingleImageMaterial = (texture, isMobile = false) => {
  const aspect = 24 / 3.3  // Same aspect as FilmStripSlider
  
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      uTexture: { value: texture || new THREE.Texture() },
      uVelo: { value: 0 },
      uIsMobile: { value: isMobile ? 1.0 : 0.0 },
      fogColor: { value: new THREE.Color(0xffffff) },
      fogNear: { value: isMobile ? 8 : 5 },
      fogFar: { value: isMobile ? 18 : 15 }
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
      varying vec2 vUv;
      varying float vFogDepth;
      
      void main() {
        // Calculate chromatic aberration
        float baseAberration = 0.003;
        float velocityAberration = abs(uVelo) * 0.001;
        float aberrationStrength = baseAberration + velocityAberration;
        aberrationStrength = min(aberrationStrength, 0.006);
        
        // Define single image bounds (centered) - same as original tiles
        // Original tiles had aspect ratio of 24/3.3 * 1.2 with gaps
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
          // Rotate 90 degrees counterclockwise
          tileUV = vec2(-tileUV.y, tileUV.x);
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
        
        // Apply fog - DISABLED FOR DEBUGGING
        // float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        // vec3 finalColor = mix(tileColor.rgb, fogColor, fogFactor);
        vec3 finalColor = tileColor.rgb; // No fog for debugging
        
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
  
  return material
}

const SingleImageShaderSlider = ({ showDebugCurve = true }) => {
  const meshRef = useRef()
  const [texture, setTexture] = useState(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
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
  
  // Animation state for fly-in
  const [isAnimating, setIsAnimating] = useState(true)
  const animationProgress = useRef(0)
  
  // Load projects data
  useEffect(() => {
    fetch('./data/projects.json')
      .then(res => res.json())
      .then(data => {
        // Flatten all images from all projects into one array
        const allImages = data.projects.flatMap(project => 
          project.images.map(img => ({
            ...img,
            projectTitle: project.title,
            projectId: project.id
          }))
        )
        setProjectImages(allImages)
      })
      .catch(err => console.error('Failed to load projects:', err))
  }, [])
  
  
  // Store curve for debug visualization
  const [debugCurve, setDebugCurve] = useState(null)
  
  // Create curved geometry like FilmStripSlider
  const geometry = useMemo(() => {
    const splineSegments = 300
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
        new THREE.Vector3(0, point.x, point.z + 0.5)
      )
      curve = new THREE.CatmullRomCurve3(rotatedPoints, false, "catmullrom", 0.5)
    } else {
      curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3, 0, -10.0),   // RED - First outer point left back
        new THREE.Vector3(-2, 0, -7.0),    // ORANGE - Second point left back
        new THREE.Vector3(-6, 0, -4.0),    // YELLOW - Third point left mid
        new THREE.Vector3(-3.5, 0, 0.4),   // GREEN - Fourth point left forward
        new THREE.Vector3(0, 0, 1.1),      // CYAN - Center point (closest to camera)
        new THREE.Vector3(3.5, 0, 0.4),    // BLUE - Sixth point right forward
        new THREE.Vector3(6, 0, -4.0),     // PURPLE - Seventh point right mid
        new THREE.Vector3(2, 0, -7.0),     // MAGENTA - Eighth point right back
        new THREE.Vector3(3, 0, -10.0)     // DARKRED - Last outer point right back
      ], false, "catmullrom", 0.5)
    }
    
    // Store curve for debug visualization
    setDebugCurve(curve)
    
    const curvePoints = curve.getSpacedPoints(splineSegments)
    
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
        tex.encoding = THREE.sRGBEncoding
        tex.generateMipmaps = false
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy())
        tex.needsUpdate = true
        setTexture(tex)
        
        // Log current image info
        console.log(`Showing: ${currentImage.title} - ${currentImage.description}`)
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
  
  // Click handler to cycle through images
  useEffect(() => {
    const handleClick = (e) => {
      if (projectImages.length === 0) return
      
      // Cycle to next image
      setCurrentImageIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % projectImages.length
        const nextImage = projectImages[nextIndex]
        console.log(`Next image [${nextIndex + 1}/${projectImages.length}]: ${nextImage?.title}`)
        return nextIndex
      })
    }
    
    const canvas = gl.domElement
    canvas.addEventListener('click', handleClick)
    
    return () => {
      canvas.removeEventListener('click', handleClick)
    }
  }, [gl, projectImages])
  
  // Animation loop
  useFrame((state, delta) => {
    if (!material) return
    
    // Handle fly-in animation on page load
    if (isAnimating) {
      animationProgress.current += delta * 0.5 // Speed of animation (0.5 = 2 seconds)
      
      if (animationProgress.current >= 1) {
        animationProgress.current = 1
        setIsAnimating(false)
      }
      
      // Easing function (ease-out cubic)
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
      const easedProgress = easeOutCubic(animationProgress.current)
      
      // Animate from left (-100) to center (0)
      const startPos = -100
      const endPos = 0
      currentOffset.current = startPos + (endPos - startPos) * easedProgress
      
      // Add some velocity effect during animation for deformation
      if (animationProgress.current < 0.9) {
        sliderSpeed.current = 150 * (1 - animationProgress.current) // Deformation during fly-in
      }
    } else {
      // After animation completes, keep at center position
      currentOffset.current = 0
    }
    
    // Fade deformation effect
    if (isMobile) {
      sliderSpeed.current *= 0.97
    } else {
      sliderSpeed.current *= 0.98
    }
    
    // Update material
    material.updateTime(currentOffset.current)
    material.updateVelocity(sliderSpeed.current)
  })
  
  // Create material with texture
  const material = useMemo(() => {
    if (!texture) return null
    const mat = createSingleImageMaterial(texture, isMobile)
    return mat
  }, [texture, isMobile])
  
  if (!material) return null
  
  return (
    <>
      <mesh 
        ref={meshRef} 
        geometry={geometry} 
        material={material}
        onPointerOver={() => document.body.style.cursor = 'pointer'}
        onPointerOut={() => document.body.style.cursor = 'auto'}
      />
      
      {/* Automatic curve visualization */}
      {showDebugCurve && debugCurve && (
        <>
          {/* Draw the curve line */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={debugCurve.points.length}
                array={new Float32Array(debugCurve.points.flatMap(p => [p.x, p.y, p.z]))}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#00ff00" linewidth={2} />
          </line>
          
          {/* Draw spheres at each control point */}
          {debugCurve.points.map((point, index) => {
            const colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta', 'darkred']
            return (
              <mesh key={index} position={[point.x, point.y, point.z]}>
                <sphereGeometry args={[0.15, 16, 16]} />
                <meshBasicMaterial color={colors[index % colors.length]} />
              </mesh>
            )
          })}
        </>
      )}
    </>
  )
}

export default SingleImageShaderSlider