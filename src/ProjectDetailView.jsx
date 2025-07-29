import { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'

const ProjectDetailView = ({ project, position, onNavigate, isMobile }) => {
  const meshRef = useRef()
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const transitionProgress = useRef(0)
  
  // Project images data - use project-specific images
  const projectImages = useMemo(() => {
    return project.images || []
  }, [project])
  
  // Load all textures for the project
  const textures = useTexture(projectImages)
  
  // Configure textures
  useEffect(() => {
    textures.forEach(texture => {
      texture.generateMipmaps = false
      texture.wrapS = THREE.ClampToEdgeWrap
      texture.wrapT = THREE.ClampToEdgeWrap
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
    })
  }, [textures])
  
  // Shader material with transition effect
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTexture1: { value: textures[0] },
      uTexture2: { value: textures[0] },
      uProgress: { value: 0 },
      uDirection: { value: 1 }, // 1 for next, -1 for previous
      uOpacity: { value: 0 } // Start with 0 opacity for fade in
    },
    vertexShader: `
      precision mediump float;
      varying vec2 vUv;
      
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform sampler2D uTexture1;
      uniform sampler2D uTexture2;
      uniform float uProgress;
      uniform float uDirection;
      uniform float uOpacity;
      varying vec2 vUv;
      
      void main() {
        vec2 uv = vUv;
        
        // Slide transition with fade
        float x = uProgress * uDirection;
        
        // Sample both textures
        vec4 tex1 = texture2D(uTexture1, uv + vec2(x, 0.0));
        vec4 tex2 = texture2D(uTexture2, uv + vec2(x - uDirection, 0.0));
        
        // Mix with fade
        float fade = smoothstep(0.3, 0.7, uProgress);
        vec4 color = mix(tex1, tex2, fade);
        
        // Apply overall opacity
        color.a *= uOpacity;
        
        gl_FragColor = color;
      }
    `,
    transparent: true,
    side: THREE.DoubleSide
  }), [textures])
  
  // Update transition progress
  useFrame(() => {
    if (material.uniforms.uProgress && isTransitioning) {
      material.uniforms.uProgress.value = transitionProgress.current
    }
  })
  
  // Fade in when component mounts
  useEffect(() => {
    if (material.uniforms.uOpacity) {
      gsap.to(material.uniforms.uOpacity, {
        value: 1,
        duration: 0.5,
        ease: "power2.out"
      })
    }
  }, [material])
  
  // Handle navigation
  const navigate = (direction) => {
    if (isTransitioning) return
    
    const nextIndex = direction === 'next' 
      ? (currentImageIndex + 1) % textures.length
      : (currentImageIndex - 1 + textures.length) % textures.length
    
    // Set up transition
    material.uniforms.uTexture1.value = textures[currentImageIndex]
    material.uniforms.uTexture2.value = textures[nextIndex]
    material.uniforms.uDirection.value = direction === 'next' ? 1 : -1
    
    setIsTransitioning(true)
    
    // Animate transition
    gsap.to(transitionProgress, {
      current: 1,
      duration: 0.8,
      ease: "power2.inOut",
      onComplete: () => {
        setCurrentImageIndex(nextIndex)
        material.uniforms.uTexture1.value = textures[nextIndex]
        material.uniforms.uProgress.value = 0
        transitionProgress.current = 0
        setIsTransitioning(false)
      }
    })
    
    if (onNavigate) {
      onNavigate(nextIndex)
    }
  }
  
  // Handle click events for navigation
  const handleClick = (e) => {
    e.stopPropagation()
    const clickX = e.point.x
    
    // Click on right half = next, left half = previous
    if (clickX > 0) {
      navigate('next')
    } else {
      navigate('previous')
    }
  }
  
  // Handle hover for cursor feedback
  const handlePointerMove = (e) => {
    const hoverX = e.point.x
    document.body.style.cursor = hoverX > 0 ? 'e-resize' : 'w-resize'
  }
  
  const handlePointerLeave = () => {
    document.body.style.cursor = 'auto'
  }
  
  return (
    <mesh 
      ref={meshRef} 
      position={position} 
      material={material}
      onClick={handleClick}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <planeGeometry args={isMobile ? [2, 2, 1, 1] : [3, 3, 1, 1]} />
    </mesh>
  )
}

export default ProjectDetailView