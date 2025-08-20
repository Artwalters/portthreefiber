import React, { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import BarrelDistortionTemplate from './templates/BarrelDistortionTemplate'
import './styles/barrel-distortion.css'

export default function ViewBasedProjects() {
    useEffect(() => {
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
        }
    }, [])
    
    
    return (
        <>
            {/* Force scroll by creating a large content area first */}
            <div style={{ height: '300vh', width: '100%', position: 'relative', zIndex: 1 }}>
                
                <Canvas
                    camera={{
                        position: [0, 0, 500],
                        fov: 50
                    }}
                    gl={{ 
                        alpha: true,
                        antialias: true,
                        powerPreference: 'high-performance'
                    }}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100vh',
                        zIndex: 10,
                        pointerEvents: 'none'
                    }}
                >
                    <BarrelDistortionTemplate />
                </Canvas>

            {/* Navigation UI */}
            <div style={{
                position: 'fixed',
                top: '2rem',
                left: '2rem',
                zIndex: 200,
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

            <main style={{ padding: '2rem 0' }}>
                <h1 style={{ textAlign: 'center', margin: '2rem 0' }}>Barrel Distortion Test</h1>
                
                {/* Image 1 */}
                <div style={{ margin: '10rem auto', width: '600px', height: '400px', maxWidth: '90vw' }}>
                    <img 
                        src="./img/project-1.png" 
                        alt="Image 1" 
                        data-webgl-media
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0 }}
                    />
                </div>

                {/* Image 2 */}
                <div style={{ margin: '10rem auto', width: '600px', height: '400px', maxWidth: '90vw' }}>
                    <img 
                        src="./img/project-2.png" 
                        alt="Image 2" 
                        data-webgl-media
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0 }}
                    />
                </div>

                {/* Image 3 */}
                <div style={{ margin: '10rem auto', width: '600px', height: '400px', maxWidth: '90vw' }}>
                    <img 
                        src="./img/project-3.png" 
                        alt="Image 3" 
                        data-webgl-media
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0 }}
                    />
                </div>

                <div style={{ height: '50vh' }}></div>
            </main>
            
            </div>
        </>
    )
}