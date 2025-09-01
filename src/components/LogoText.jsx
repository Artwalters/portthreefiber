import React, { useEffect, useState, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Text, preloadFont } from 'troika-three-text'

const LogoText = ({ waterRef }) => {
  const { scene, camera } = useThree()
  const [fontLoaded, setFontLoaded] = useState(false)
  const textMeshRef = useRef(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  
  // Check for mobile on resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Preload font
  useEffect(() => {
    // Try to use Helvetica Neue from public fonts folder
    const fontUrl = './fonts/HelveticaNeueLight.otf'
    preloadFont(
      fontUrl,
      'walters studio',
      () => {
        setFontLoaded(true)
        console.log('Helvetica Neue font loaded for logo')
      }
    )
  }, [])

  // Create and setup text mesh
  useEffect(() => {
    if (!fontLoaded) return

    // Get the HTML logo element to match its position
    const logoElement = document.getElementById('webgl-logo')
    if (!logoElement) return

    // Create text mesh using troika-three-text
    const textMesh = new Text()
    
    // Set text content
    textMesh.text = 'walters studio'
    
    // Font settings to match the HTML logo style
    textMesh.font = './fonts/HelveticaNeueLight.otf'
    textMesh.fontSize = isMobile ? 0.4 : 0.5  // Smaller size to match HTML logo
    textMesh.color = new THREE.Color('#000000')
    textMesh.anchorX = 'left'
    textMesh.anchorY = 'middle'
    textMesh.letterSpacing = 0.02  // Add some letter spacing for better readability
    
    // Add marker so water shader can find this text mesh
    textMesh.userData = { 
      type: 'webgl-text',
      isLogo: true,
      skipWaterCapture: true // Prevent water from capturing this to avoid double rendering
    }

    // Make visible in main scene
    textMesh.visible = true
    textMesh.frustumCulled = false
    
    // Position based on viewport
    const vFov = camera.fov * Math.PI / 180
    const height = 2 * Math.tan(vFov / 2) * camera.position.z
    const width = height * camera.aspect
    
    // Position in top-left like the HTML logo
    const xMarginRatio = isMobile ? 0.22 : 0.17
    const yMarginRatio = isMobile ? 0.15 : 0.12
    
    textMesh.position.x = -width / 2 + (width * xMarginRatio)
    textMesh.position.y = height / 2 - (height * yMarginRatio)
    textMesh.position.z = 0.5
    
    // Store ref for animation
    textMeshRef.current = textMesh
    
    // Add to scene after sync
    textMesh.sync(() => {
      scene.add(textMesh)
      // Hide the HTML logo when WebGL text is ready and visible
      logoElement.style.display = 'none'
    })
    
    return () => {
      if (textMeshRef.current) {
        scene.remove(textMeshRef.current)
        textMeshRef.current.dispose()
        textMeshRef.current = null
      }
      // Restore HTML logo visibility
      if (logoElement) {
        logoElement.style.display = ''
      }
    }
  }, [fontLoaded, scene, camera, isMobile])

  // Animate text to react to water
  useFrame((state) => {
    if (!textMeshRef.current) return
    
    const time = state.clock.elapsedTime
    
    // Get water intensity from the actual water shader
    let waterIntensity = 0.3
    if (waterRef?.current?.material?.uniforms?.waterIntensity) {
      waterIntensity = waterRef.current.material.uniforms.waterIntensity.value
    } else {
      // Fallback to default water animation
      waterIntensity = 0.3 + Math.sin(time * 0.5) * 0.2
    }
    
    // Recalculate base position each frame in case of resize
    const vFov = camera.fov * Math.PI / 180
    const height = 2 * Math.tan(vFov / 2) * camera.position.z
    const width = height * camera.aspect
    
    const xMarginRatio = isMobile ? 0.22 : 0.17
    const yMarginRatio = isMobile ? 0.15 : 0.12
    
    const baseX = -width / 2 + (width * xMarginRatio)
    const baseY = height / 2 - (height * yMarginRatio)
    
    // Apply water distortion that matches the water shader frequency/amplitude
    textMeshRef.current.position.x = baseX + Math.sin(time * 1.5) * 0.008 * waterIntensity
    textMeshRef.current.position.y = baseY + Math.cos(time * 2.2) * 0.006 * waterIntensity
  })

  return null
}

export default LogoText