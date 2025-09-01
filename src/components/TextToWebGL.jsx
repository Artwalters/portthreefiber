import React, { useEffect, useState, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Text } from 'troika-three-text'

const TextToWebGL = ({ waterRef }) => {
  const { scene, camera } = useThree()
  const [textStore, setTextStore] = useState([])

  // Initialize text meshes from HTML elements with data-webgl-text
  useEffect(() => {
    
    const initializeTextMeshes = async () => {
      await document.fonts.ready
      
      // Find all text elements marked for WebGL rendering
      const textElements = document.querySelectorAll('[data-webgl-text]:not([data-webgl-media])')
      const newTextStore = []
      
      textElements.forEach((textElement) => {
        const bounds = textElement.getBoundingClientRect()
        const computedStyle = window.getComputedStyle(textElement)
        
        // Create text mesh using troika-three-text
        const textMesh = new Text()
        
        // Copy text content and apply CSS styles
        textMesh.text = textElement.innerText
        
        // Font size - scale appropriately for WebGL
        const fontSizeNum = parseFloat(computedStyle.fontSize)
        const isMobile = window.innerWidth <= 768
        // Grotere initiële font size voor betere leesbaarheid
        textMesh.fontSize = fontSizeNum * 0.04
        
        // Color - handle transparent colors
        const cssColor = computedStyle.color
        if (cssColor === 'transparent' || cssColor.includes('rgba(0, 0, 0, 0)')) {
          textMesh.color = new THREE.Color('#000000')
        } else {
          textMesh.color = new THREE.Color(cssColor)
        }
        
        // Font
        textMesh.font = './fonts/HelveticaNeueLight.otf'
        
        // Text alignment
        textMesh.textAlign = computedStyle.textAlign === 'center' ? 'center' : 
                           computedStyle.textAlign === 'right' ? 'right' : 'left'
        
        // Anchor based on alignment
        textMesh.anchorX = computedStyle.textAlign === 'center' ? '50%' : 
                          computedStyle.textAlign === 'right' ? '100%' : '0%'
        textMesh.anchorY = '50%'
        
        // Letter spacing
        const letterSpacing = parseFloat(computedStyle.letterSpacing)
        if (!isNaN(letterSpacing)) {
          textMesh.letterSpacing = letterSpacing / fontSizeNum
        }
        
        // Add marker for water shader
        textMesh.userData = { 
          type: 'webgl-text',
          originalElement: textElement
        }
        
        // Hide for main camera (only visible during water capture)
        textMesh.visible = false
        textMesh.frustumCulled = false
        
        // Position far away initially
        textMesh.position.z = -1000
        
        // Add to scene after sync
        textMesh.sync(() => {
          scene.add(textMesh)
          // Hide the HTML element completely once WebGL text is ready
          textElement.style.opacity = '0'
          textElement.style.pointerEvents = 'none'
        })
        
        newTextStore.push({
          element: textElement,
          mesh: textMesh,
          computedStyle,
          bounds: {
            width: bounds.width,
            height: bounds.height,
            top: bounds.top,
            left: bounds.left
          }
        })
      })
      
      setTextStore(newTextStore)
    }
    
    // Initialize with delay to prevent flicker
    const timeout = setTimeout(initializeTextMeshes, 100)
    
    return () => {
      clearTimeout(timeout)
      // Clean up meshes
      textStore.forEach(item => {
        if (item.mesh) {
          scene.remove(item.mesh)
          item.mesh.dispose()
        }
        // Restore HTML element visibility
        if (item.element) {
          item.element.style.opacity = ''
          item.element.style.pointerEvents = ''
        }
      })
    }
  }, [scene])
  
  // Update positions and handle window resize
  useFrame((state) => {
    const { camera, viewport } = state
    
    textStore.forEach((item) => {
      // Get current element bounds for accurate positioning
      const bounds = item.element.getBoundingClientRect()
      
      // Convert pixel positions to world coordinates
      const vFov = camera.fov * Math.PI / 180
      const height = 2 * Math.tan(vFov / 2) * camera.position.z
      const width = height * camera.aspect
      
      // Position mesh based on HTML element position
      const x = ((bounds.left + bounds.width / 2) / window.innerWidth - 0.5) * width
      const y = -((bounds.top + bounds.height / 2) / window.innerHeight - 0.5) * height
      
      item.mesh.position.x = x
      item.mesh.position.y = y
      item.mesh.position.z = 0
      
      // Update font size based on current window size
      const pixelsPerUnit = window.innerHeight / height
      const isMobile = window.innerWidth <= 768
      const fontSizeNum = parseFloat(item.computedStyle.fontSize)
      // Maak de text groter en consistent met UI sizing
      const newFontSize = fontSizeNum / pixelsPerUnit * (isMobile ? 0.8 : 1.2)
      item.mesh.fontSize = newFontSize
      
      // Keep hidden for main camera (water will make it visible during capture)
      item.mesh.visible = false
    })
  })
  
  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      setTextStore(prev => prev.map(item => {
        const bounds = item.element.getBoundingClientRect()
        const computedStyle = window.getComputedStyle(item.element)
        
        return {
          ...item,
          computedStyle,
          bounds: {
            width: bounds.width,
            height: bounds.height,
            top: bounds.top,
            left: bounds.left
          }
        }
      }))
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  return null
}

export default TextToWebGL