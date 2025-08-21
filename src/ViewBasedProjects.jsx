import React, { useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import BarrelDistortionTemplate from './templates/BarrelDistortionTemplate'
import FishParticleSystem from './effects/particles/FishParticleSystem'
import ProjectsWater from './effects/water/ProjectsWater'
import './styles/barrel-distortion.css'

export default function ViewBasedProjects() {
    const waterRef = useRef()
    
    useEffect(() => {
        // Add class to body for barrel distortion page
        document.body.classList.add('barrel-distortion-page')
        
        // Force override ALL scroll-blocking CSS with !important
        const styleSheet = document.createElement('style')
        styleSheet.textContent = `
            html, body, #root {
                position: static !important;
                height: auto !important;
                overflow: visible !important;
                overflow-y: auto !important;
                top: unset !important;
                left: unset !important;
                width: auto !important;
                touch-action: auto !important;
            }
        `
        document.head.appendChild(styleSheet)
        
        return () => {
            document.head.removeChild(styleSheet)
            document.body.classList.remove('barrel-distortion-page')
        }
    }, [])
    
    
    return (
        <>
            {/* Force scroll by creating a large content area first */}
            <div style={{ height: '300vh', width: '100%', position: 'relative', zIndex: 1 }}>
                
                {/* Single Canvas with all layers - just like the main app */}
                <Canvas
                    camera={{
                        position: [0, 0, 5],
                        fov: 75
                    }}
                    gl={{ 
                        alpha: false,
                        antialias: true,
                        powerPreference: 'high-performance',
                        outputColorSpace: THREE.SRGBColorSpace,
                        toneMapping: THREE.NoToneMapping,
                        toneMappingExposure: 1.0
                    }}
                    dpr={[1, 2]}
                    frameloop="always"
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100vh',
                        zIndex: 1,
                        pointerEvents: 'auto'
                    }}
                    onCreated={({ scene, gl }) => {
                        scene.fog = new THREE.Fog(0xffffff, 5, 15)
                        gl.setClearColor('#ffffff')
                    }}
                >
                    {/* Layer 1: Fish (bottom) */}
                    <FishParticleSystem />
                    
                    {/* Layer 2: Barrel Distortion (middle) */}
                    <BarrelDistortionTemplate waterRef={waterRef} />
                    
                    {/* Layer 3: Water (top) */}
                    <ProjectsWater ref={waterRef} />
                </Canvas>

            {/* Navigation UI */}
            <div style={{
                position: 'fixed',
                top: '2rem',
                left: '2rem',
                zIndex: 1000,
                fontFamily: 'PSTimesTrial, serif'
            }}>
                <span 
                    onClick={() => window.location.href = '/'}
                    style={{ 
                        cursor: 'pointer',
                        background: 'rgba(0,0,0,0.8)',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '4px',
                        fontSize: '0.9rem'
                    }}
                >
                    ← back to main
                </span>
            </div>

            <main style={{ 
                padding: '2rem 0',
                background: 'transparent',
                position: 'relative',
                zIndex: 5
            }}>
                <h1 style={{ 
                    textAlign: 'center', 
                    margin: '2rem 0',
                    color: 'black',
                    textShadow: '0 0 10px rgba(255,255,255,0.8)',
                    position: 'relative',
                    zIndex: 20,
                    backgroundColor: 'rgba(255,255,255,0.8)',
                    padding: '1rem',
                    borderRadius: '8px'
                }}>Barrel Distortion Test</h1>
                
                {/* Image 1 */}
                <div style={{ margin: '10rem auto', width: '600px', height: '400px', maxWidth: '90vw' }}>
                    <img 
                        src="./img/project-1.png" 
                        alt="Image 1" 
                        data-webgl-media
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, visibility: 'hidden' }}
                    />
                </div>

                {/* Image 2 */}
                <div style={{ margin: '10rem auto', width: '600px', height: '400px', maxWidth: '90vw' }}>
                    <img 
                        src="./img/project-2.png" 
                        alt="Image 2" 
                        data-webgl-media
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, visibility: 'hidden' }}
                    />
                </div>

                {/* Image 3 */}
                <div style={{ margin: '10rem auto', width: '600px', height: '400px', maxWidth: '90vw' }}>
                    <img 
                        src="./img/project-3.png" 
                        alt="Image 3" 
                        data-webgl-media
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, visibility: 'hidden' }}
                    />
                </div>

                <div style={{ height: '50vh' }}></div>
            </main>
            
            </div>
        </>
    )
}