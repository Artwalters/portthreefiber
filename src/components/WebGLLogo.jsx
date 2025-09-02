import React, { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const WebGLLogo = ({ waterRef }) => {
  const meshRef = useRef()
  const { viewport } = useThree()
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [logoTexture, setLogoTexture] = useState(null)
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Hide HTML logo when WebGL version is ready
  useEffect(() => {
    const logoElement = document.getElementById('walters-logo-html')
    if (logoElement) {
      logoElement.style.display = 'none' // Completely hide instead of just opacity
      console.log('HTML logo hidden for WebGL replacement')
    }
    
    return () => {
      if (logoElement) {
        logoElement.style.display = '' // Restore on cleanup
      }
    }
  }, [])

  // Load PNG texture
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    loader.load(
      './img/logo/walters_logo.png',
      (texture) => {
        texture.encoding = THREE.sRGBEncoding
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        setLogoTexture(texture)
        console.log('Logo texture loaded:', texture.image.width, 'x', texture.image.height)
      },
      undefined,
      (error) => {
        console.error('Error loading logo texture:', error)
      }
    )
  }, [])

  // Calculate responsive positioning - match UIOverlay bottom-left positioning
  const position = useMemo(() => {
    // Match the CSS positioning from styles.css
    // .ui-bottom-left is positioned with margin/padding
    const xMargin = isMobile ? 0.28 : 0.21 // More margin = further right
    const yMargin = isMobile ? 0.17 : 0.14 // More margin = higher from bottom
    
    const x = -viewport.width / 2 + (viewport.width * xMargin)
    const y = -viewport.height / 2 + (viewport.height * yMargin)
    
    return [x, y, 1]
  }, [viewport, isMobile])

  // Calculate plane size based on logo aspect ratio (1867x680 from SVG dimensions)
  const planeSize = useMemo(() => {
    if (!logoTexture) return [1, 1]
    
    const aspectRatio = 1867 / 680 // Original logo aspect ratio
    const targetHeight = isMobile ? 0.4 : 0.5 // Height in viewport units
    const width = targetHeight * aspectRatio
    const height = targetHeight
    
    return [width, height]
  }, [logoTexture, isMobile])

  // Water animation that syncs with the actual water shader
  useFrame((state) => {
    if (meshRef.current && logoTexture) {
      const time = state.clock.elapsedTime
      const basePosition = position
      
      // Get water intensity from the actual water shader
      let waterIntensity = 0.3
      if (waterRef?.current?.material?.uniforms?.waterIntensity) {
        waterIntensity = waterRef.current.material.uniforms.waterIntensity.value
      } else {
        // Fallback to default water animation
        waterIntensity = 0.3 + Math.sin(time * 0.5) * 0.2
      }
      
      // Apply subtle water distortion
      const xOffset = Math.sin(time * 1.2) * 0.015 * waterIntensity
      const yOffset = Math.cos(time * 1.8) * 0.01 * waterIntensity
      
      meshRef.current.position.x = basePosition[0] + xOffset
      meshRef.current.position.y = basePosition[1] + yOffset
      meshRef.current.position.z = basePosition[2]
      
      // Subtle rotation for water effect
      meshRef.current.rotation.z = Math.sin(time * 0.8) * 0.002 * waterIntensity
    }
  })

  // Don't render until texture is loaded
  if (!logoTexture) {
    return null
  }

  return (
    <mesh 
      ref={meshRef} 
      position={position}
      userData={{ isLogo: true, type: 'webgl-logo' }}
    >
      <planeGeometry args={planeSize} />
      <meshBasicMaterial 
        map={logoTexture} 
        transparent={true}
        alphaTest={0.01}
      />
    </mesh>
  )
}

export default WebGLLogo