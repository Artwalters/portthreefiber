import React, { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import BarrelDistortionTemplate from './templates/BarrelDistortionTemplate'
import FishParticleSystem from './effects/particles/FishParticleSystem'
import MobileWater from './effects/water/MobileWater'
import SimpleWater from './effects/water/SimpleWater'
import { getDeviceCapabilities } from './utils/deviceDetection.js'
import './styles/barrel-distortion.css'

export default function ViewBasedProjects() {
    const waterRef = useRef()
    const [scrollY, setScrollY] = useState(0)
    const [fontsReady, setFontsReady] = useState(false)
    
    // Device capabilities detection
    const [deviceCapabilities, setDeviceCapabilities] = useState(null)

    // Detect device capabilities on mount
    useEffect(() => {
        const capabilities = getDeviceCapabilities()
        setDeviceCapabilities(capabilities)
    }, [])
    
    // Scroll is now handled by Lenis in BarrelDistortionTemplate
    // No need for separate scroll listener
    
    // Wait for fonts to load - critical for text rendering
    useEffect(() => {
        document.fonts.ready.then(() => {
            setFontsReady(true)
        })
    }, [])
    
    
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
                touch-action: pan-y !important;
                -webkit-overflow-scrolling: touch !important;
            }
            
            /* Better mobile scroll handling */
            @media (max-width: 768px) {
                html, body {
                    overscroll-behavior: none !important;
                    -webkit-overflow-scrolling: touch !important;
                    /* iOS Safari specific fixes */
                    -webkit-touch-callout: none !important;
                    -webkit-user-select: none !important;
                }
                
                /* Prevent iOS bounce */
                body {
                    position: relative !important;
                    overflow-x: hidden !important;
                }
                
                /* Improve touch responsiveness */
                * {
                    -webkit-tap-highlight-color: transparent !important;
                    -webkit-touch-callout: none !important;
                }
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
                
                {/* Single Canvas with all layers - wait for fonts and device detection first */}
                {fontsReady && deviceCapabilities && <Canvas
                    frameloop="always"
                    camera={{
                        position: [0, 0, deviceCapabilities?.shouldUseMobileWater ? 8 : 5],
                        fov: 75
                    }}
                    gl={{ 
                        alpha: false,
                        antialias: !deviceCapabilities?.shouldUseMobileWater,
                        powerPreference: deviceCapabilities?.shouldUseMobileWater ? 'default' : 'high-performance',
                        pixelRatio: deviceCapabilities?.shouldUseMobileWater ? 1 : Math.min(window.devicePixelRatio, 2),
                        outputColorSpace: THREE.SRGBColorSpace,
                        toneMapping: THREE.NoToneMapping,
                        toneMappingExposure: 1.0,
                        precision: deviceCapabilities?.shouldUseMobileWater ? 'mediump' : 'highp'
                    }}
                    dpr={deviceCapabilities?.shouldUseMobileWater ? 1 : [1, 2]}
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
                        // Add fog - adjust for mobile
                        const isMobile = window.innerWidth <= 768
                        if (isMobile) {
                            scene.fog = new THREE.Fog(0xffffff, 8, 18)
                        } else {
                            scene.fog = new THREE.Fog(0xffffff, 5, 15)
                        }
                        gl.setClearColor('#ffffff')
                    }}
                >
                    {/* Layer 1: Fish (bottom) */}
                    <FishParticleSystem scrollY={scrollY} />
                    
                    {/* Layer 2: Barrel Distortion (middle) */}
                    <BarrelDistortionTemplate waterRef={waterRef} />
                    
                    {/* Layer 3: Water (top) - Use appropriate water shader based on device */}
                    {deviceCapabilities?.shouldUseMobileWater ? (
                        <MobileWater ref={waterRef} scrollY={scrollY} />
                    ) : (
                        <SimpleWater ref={waterRef} scrollY={scrollY} />
                    )}
                </Canvas>}

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
                
                {/* Project 1 */}
                <div style={{ margin: '10rem auto', width: '600px', maxWidth: '90vw', textAlign: 'center' }}>
                    <div style={{ height: '400px', marginBottom: '2rem' }}>
                        <img 
                            src="./img/project-1.png" 
                            alt="Image 1" 
                            data-webgl-media
                            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, visibility: 'hidden' }}
                        />
                    </div>
                    <h2 
                        data-webgl-text 
                        style={{ 
                            fontSize: '2.5rem', 
                            fontWeight: '700',
                            color: '#333',
                            margin: '0 0 1rem 0',
                            fontFamily: 'PSTimesTrial, serif',
                            color: 'transparent',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                        }}
                    >
                        THREE.JS WATER EFFECTS
                    </h2>
                    <p 
                        data-webgl-text 
                        style={{ 
                            fontSize: '1.2rem', 
                            color: 'transparent',
                            lineHeight: '1.6',
                            margin: '0',
                            fontFamily: 'PSTimesTrial, serif',
                            maxWidth: '500px',
                            marginLeft: 'auto',
                            marginRight: 'auto',
                            color: 'transparent',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                        }}
                    >
                        Interactive water simulation with real-time distortion effects and responsive barrel transformations
                    </p>
                </div>

                {/* Project 2 */}
                <div style={{ margin: '10rem auto', width: '600px', maxWidth: '90vw', textAlign: 'center' }}>
                    <div style={{ height: '400px', marginBottom: '2rem' }}>
                        <img 
                            src="./img/project-2.png" 
                            alt="Image 2" 
                            data-webgl-media
                            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, visibility: 'hidden' }}
                        />
                    </div>
                    <h2 
                        data-webgl-text 
                        style={{ 
                            fontSize: '2.5rem', 
                            fontWeight: '700',
                            color: '#333',
                            margin: '0 0 1rem 0',
                            fontFamily: 'PSTimesTrial, serif',
                            color: 'transparent',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                        }}
                    >
                        SCROLL DRIVEN SHADERS
                    </h2>
                    <p 
                        data-webgl-text 
                        style={{ 
                            fontSize: '1.2rem', 
                            color: 'transparent',
                            lineHeight: '1.6',
                            margin: '0',
                            fontFamily: 'PSTimesTrial, serif',
                            maxWidth: '500px',
                            marginLeft: 'auto',
                            marginRight: 'auto',
                            color: 'transparent',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                        }}
                    >
                        Advanced shader effects that respond to user scrolling with smooth Lenis integration and velocity-based distortions
                    </p>
                </div>

                {/* Project 3 */}
                <div style={{ margin: '10rem auto', width: '600px', maxWidth: '90vw', textAlign: 'center' }}>
                    <div style={{ height: '400px', marginBottom: '2rem' }}>
                        <img 
                            src="./img/project-3.png" 
                            alt="Image 3" 
                            data-webgl-media
                            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, visibility: 'hidden' }}
                        />
                    </div>
                    <h2 
                        data-webgl-text 
                        style={{ 
                            fontSize: '2.5rem', 
                            fontWeight: '700',
                            color: '#333',
                            margin: '0 0 1rem 0',
                            fontFamily: 'PSTimesTrial, serif',
                            color: 'transparent',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                        }}
                    >
                        RESPONSIVE WEBGL TEXT
                    </h2>
                    <p 
                        data-webgl-text 
                        style={{ 
                            fontSize: '1.2rem', 
                            color: 'transparent',
                            lineHeight: '1.6',
                            margin: '0',
                            fontFamily: 'PSTimesTrial, serif',
                            maxWidth: '500px',
                            marginLeft: 'auto',
                            marginRight: 'auto',
                            color: 'transparent',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                        }}
                    >
                        HTML-first approach with WebGL rendering enables SEO-friendly text with custom shader effects and perfect responsive behavior
                    </p>
                </div>

                <div style={{ height: '50vh' }}></div>
            </main>
            
            </div>
        </>
    )
}