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
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
    
    // Device capabilities detection
    const [deviceCapabilities, setDeviceCapabilities] = useState(null)

    // Detect device capabilities on mount
    useEffect(() => {
        const capabilities = getDeviceCapabilities()
        setDeviceCapabilities(capabilities)
        
        // Handle resize
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 768)
        }
        
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
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
                    onClick={() => {
                        // Remove the template parameter to go back to main page
                        const url = new URL(window.location);
                        url.searchParams.delete('template');
                        window.location.href = url.toString();
                    }}
                    className="back-button"
                >
                    ← back to main
                </span>
            </div>

            <main style={{ 
                padding: '0',
                background: 'transparent',
                position: 'relative',
                zIndex: 5
            }}>
                {/* Hero Section */}
                <section style={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: isMobile ? '2rem' : '4rem 6rem',
                    position: 'relative',
                    marginBottom: '5rem'
                }}>
                    {/* Title Row */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                        alignItems: 'flex-start',
                        gap: isMobile ? '3rem' : '6rem',
                        marginBottom: isMobile ? '4rem' : '8rem'
                    }}>
                        {/* Left side - Project titles */}
                        <div>
                            <h1 
                                data-webgl-text
                                style={{
                                    fontSize: isMobile ? '2rem' : '5rem',
                                    fontWeight: '300',
                                    fontStyle: 'italic',
                                    fontFamily: 'PSTimesTrial, serif',
                                    color: 'transparent',
                                    lineHeight: '1',
                                    margin: '0 0 0.25rem 0',
                                    textTransform: 'uppercase',
                                    letterSpacing: '-0.02em'
                                }}
                            >
                                Projects/
                            </h1>
                            <h2
                                data-webgl-text
                                style={{
                                    fontSize: isMobile ? '3.5rem' : '10rem',
                                    fontWeight: '700',
                                    fontFamily: 'PSTimesTrial, serif',
                                    color: 'transparent',
                                    lineHeight: '0.85',
                                    margin: '0',
                                    textTransform: 'uppercase',
                                    letterSpacing: '-0.02em'
                                }}
                            >
                                ROBCO
                            </h2>
                        </div>
                        
                        {/* Right side - Title */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-start',
                            alignItems: isMobile ? 'center' : 'flex-end',
                            textAlign: isMobile ? 'center' : 'right'
                        }}>
                            <h3
                                data-webgl-text
                                style={{
                                    fontSize: isMobile ? '3rem' : '10rem',
                                    fontWeight: '700',
                                    fontFamily: 'PSTimesTrial, serif',
                                    color: 'transparent',
                                    lineHeight: '0.85',
                                    margin: '0',
                                    textTransform: 'uppercase',
                                    letterSpacing: '-0.03em'
                                }}
                            >
                                MODULAR
                            </h3>
                            <h3
                                data-webgl-text
                                style={{
                                    fontSize: isMobile ? '3rem' : '5rem',
                                    fontWeight: '300',
                                    fontStyle: 'italic',
                                    fontFamily: 'PSTimesTrial, serif',
                                    color: 'transparent',
                                    lineHeight: '0.85',
                                    margin: '0',
                                    textTransform: 'uppercase',
                                    letterSpacing: '-0.03em'
                                }}
                            >
                                MOTION.
                            </h3>
                        </div>
                    </div>
                    
                    {/* Info Grid - Below the titles */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr',
                        gap: isMobile ? '2rem' : '4rem',
                        fontSize: '0.9rem'
                    }}>
                            {/* PROJECT OVERVIEW - first column */}
                            <div>
                                <p 
                                    data-webgl-text
                                    style={{
                                        fontSize: '0.7rem',
                                        fontFamily: 'PSTimesTrial, serif',
                                        color: 'transparent',
                                        margin: '0 0 0.75rem 0',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.15em',
                                        opacity: '0.7',
                                        padding: '5rem'
                                    }}
                                >
                                    PROJECT OVERVIEW
                                </p>
                                <p
                                    data-webgl-text
                                    style={{
                                        fontSize: isMobile ? '1.2rem' : '1.6rem',
                                        fontFamily: 'PSTimesTrial, serif',
                                        color: 'transparent',
                                        lineHeight: '1.5',
                                        margin: '0',
                                        maxWidth: isMobile ? '100%' : '50ch'
                                    }}
                                >
                                    Following the success of our brand evolution for RobCo, we were commissioned to create a 3D motion piece that brought their four core brand messages to life. Through immersive visuals and thoughtful storytelling, we transformed these messages into a dynamic animation that reflects RobCo's innovative spirit and values.
                                </p>
                            </div>
                            
                            {/* SERVICES column */}
                            <div>
                                <p 
                                    data-webgl-text
                                    style={{
                                        fontSize: '0.7rem',
                                        fontFamily: 'PSTimesTrial, serif',
                                        color: 'transparent',
                                        margin: '0 0 0.5rem 0',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.15em',
                                        opacity: '0.7'
                                    }}
                                >
                                    SERVICES
                                </p>
                                <p
                                    data-webgl-text
                                    style={{
                                        fontSize: '0.9rem',
                                        fontFamily: 'PSTimesTrial, serif',
                                        color: 'transparent',
                                        lineHeight: '1.4',
                                        margin: '0'
                                    }}
                                >
                                    Storyboarding<br/>
                                    3D Modelling<br/>
                                    Motion Design
                                </p>
                            </div>
                            
                            {/* DATE/CLIENT/LOCATION column */}
                            <div>
                                <p 
                                    data-webgl-text
                                    style={{
                                        fontSize: '0.7rem',
                                        fontFamily: 'PSTimesTrial, serif',
                                        color: 'transparent',
                                        margin: '0 0 0.5rem 0',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.15em',
                                        opacity: '0.7'
                                    }}
                                >
                                    DATE
                                </p>
                                <p
                                    data-webgl-text
                                    style={{
                                        fontSize: '0.9rem',
                                        fontFamily: 'PSTimesTrial, serif',
                                        color: 'transparent',
                                        lineHeight: '1.4',
                                        margin: '0 0 1.5rem 0'
                                    }}
                                >
                                    September, 2024
                                </p>
                                
                                <p 
                                    data-webgl-text
                                    style={{
                                        fontSize: '0.7rem',
                                        fontFamily: 'PSTimesTrial, serif',
                                        color: 'transparent',
                                        margin: '0 0 0.5rem 0',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.15em',
                                        opacity: '0.7'
                                    }}
                                >
                                    CLIENT
                                </p>
                                <p
                                    data-webgl-text
                                    style={{
                                        fontSize: '0.9rem',
                                        fontFamily: 'PSTimesTrial, serif',
                                        color: 'transparent',
                                        lineHeight: '1.4',
                                        margin: '0 0 1.5rem 0'
                                    }}
                                >
                                    RobCo
                                </p>
                                
                                <p 
                                    data-webgl-text
                                    style={{
                                        fontSize: '0.7rem',
                                        fontFamily: 'PSTimesTrial, serif',
                                        color: 'transparent',
                                        margin: '0 0 0.5rem 0',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.15em',
                                        opacity: '0.7'
                                    }}
                                >
                                    LOCATION
                                </p>
                                <p
                                    data-webgl-text
                                    style={{
                                        fontSize: '0.9rem',
                                        fontFamily: 'PSTimesTrial, serif',
                                        color: 'transparent',
                                        lineHeight: '1.4',
                                        margin: '0'
                                    }}
                                >
                                    Berlin, Germany
                                </p>
                            </div>
                        </div>
                </section>
                
                {/* Project 1 */}
                <div className="project-container">
                    <div className="project-image-wrap">
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
                            fontFamily: 'PSTimesTrial, serif'
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
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                            maxWidth: '500px',
                            marginLeft: 'auto',
                            marginRight: 'auto'
                        }}
                    >
                        Interactive water simulation with real-time distortion effects and responsive barrel transformations
                    </p>
                </div>

                {/* Project 2 */}
                <div className="project-container">
                    <div className="project-image-wrap">
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
                            margin: '0 0 0rem 0',
                            fontFamily: 'PSTimesTrial, serif'
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
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                            maxWidth: '500px',
                            marginLeft: 'auto',
                            marginRight: 'auto'
                        }}
                    >
                        Advanced shader effects that respond to user scrolling with smooth Lenis integration and velocity-based distortions
                    </p>
                </div>

                {/* Project 3 */}
                <div className="project-container">
                    <div className="project-image-wrap">
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
                            fontFamily: 'PSTimesTrial, serif'
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
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                            maxWidth: '500px',
                            marginLeft: 'auto',
                            marginRight: 'auto'
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