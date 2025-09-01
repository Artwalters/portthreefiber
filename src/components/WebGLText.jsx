import React, { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import CanvasTextGenerator from './CanvasTextGenerator.js'

const WebGLText = ({ waterRef }) => {
  const meshRef = useRef()
  const { viewport, gl } = useThree()
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [textTexture, setTextTexture] = useState(null)
  const textGenerator = useMemo(() => new CanvasTextGenerator(), [])
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    window.addEventListener('resize', checkMobile)
    return () => {
      window.removeEventListener('resize', checkMobile)
      textGenerator.dispose()
    }
  }, [textGenerator])

  // Hide HTML logo completely
  useEffect(() => {
    const logoElement = document.getElementById('webgl-logo')
    if (logoElement) {
      logoElement.style.display = 'none' // Completely hide instead of just opacity
      console.log('HTML logo hidden:', logoElement)
    } else {
      console.log('HTML logo element not found')
    }
    
    return () => {
      if (logoElement) {
        logoElement.style.display = '' // Restore on cleanup
      }
    }
  }, [])

  // Generate text texture
  useEffect(() => {
    const fontSize = isMobile ? 16 : 20 // Base font sizes
    const textData = textGenerator.generateTextCanvas('walters studio', {
      fontSize,
      fontFamily: 'Helvetica Neue, -apple-system, sans-serif',
      fontWeight: '500',
      color: '#000000',
      textAlign: 'left',
      textBaseline: 'top'
    })

    // Create WebGL texture from canvas
    const texture = new THREE.CanvasTexture(textData.canvas)
    texture.needsUpdate = true
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearFilter
    
    setTextTexture({
      texture,
      width: textData.width,
      height: textData.height,
      textWidth: textData.textWidth,
      textHeight: textData.textHeight
    })

    console.log('WebGL texture created from canvas')
  }, [isMobile, textGenerator])

  // Calculate responsive positioning - truly responsive
  const position = useMemo(() => {
    // Different margins for X (horizontal) and Y (vertical)
    const xMarginRatio = isMobile ? 0.22 : 0.17 // Slightly more margin = towards right
    const yMarginRatio = isMobile ? 0.15 : 0.12 // Keep original height positioning
    
    const x = -viewport.width / 2 + (viewport.width * xMarginRatio)   // More towards center
    const y = viewport.height / 2 - (viewport.height * yMarginRatio)  // Original height
    
    return [x, y, 1]
  }, [viewport, isMobile])

  // Calculate plane geometry size based on text dimensions
  const planeSize = useMemo(() => {
    if (!textTexture) return [1, 1]
    
    // Much larger scale factor to make text visible
    const scaleFactor = isMobile ? 0.01 : 0.015 // Was 0.002/0.0025, now much larger
    const width = textTexture.textWidth * scaleFactor
    const height = textTexture.textHeight * scaleFactor
    
    return [width, height]
  }, [textTexture, isMobile])

  // Water animation that syncs with the actual water shader
  useFrame((state) => {
    if (meshRef.current) {
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
      
      // Apply water distortion that matches the water shader frequency/amplitude
      meshRef.current.position.x = basePosition[0] + Math.sin(time * 1.5) * 0.008 * waterIntensity
      meshRef.current.position.y = basePosition[1] + Math.cos(time * 2.2) * 0.006 * waterIntensity
      meshRef.current.position.z = basePosition[2]
    }
  })

  // Don't render until we have texture
  if (!textTexture) {
    return null
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[planeSize[0], planeSize[1]]} />
      <meshBasicMaterial 
        map={textTexture.texture} 
        transparent={true}
        alphaTest={0.01}
      />
    </mesh>
  )
}

export default WebGLText