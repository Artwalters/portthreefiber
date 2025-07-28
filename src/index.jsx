import './style.css'
import ReactDOM from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { useState, useEffect } from 'react'
import WebGLSlider from './WebGLSlider.jsx'
import UIOverlay from './UIOverlay.jsx'

const root = ReactDOM.createRoot(document.querySelector('#root'))

function App() {
    const [currentProject, setCurrentProject] = useState(0)
    const [hoveredProject, setHoveredProject] = useState(null)
    const [displayedProject, setDisplayedProject] = useState(null)
    const [isVisible, setIsVisible] = useState(false)
    const [highlightedProject, setHighlightedProject] = useState(null)
    const [isHighlightVisible, setIsHighlightVisible] = useState(false)

    const projects = [
        { name: 'project-1', description: 'Interactive web experience with modern UI' },
        { name: 'project-2', description: 'E-commerce platform with seamless checkout' },
        { name: 'project-3', description: 'Creative portfolio showcasing visual identity' },
        { name: 'project-4', description: 'Mobile app with intuitive user interface' },
        { name: 'project-5', description: 'Brand identity and logo design system' },
        { name: 'project-6', description: 'Digital marketing campaign visualization' },
        { name: 'project-7', description: 'Art installation with interactive elements' }
    ]

    // Handle hover with synchronized fade animations for both description and index
    useEffect(() => {
        let fadeOutTimer
        let fadeInTimer
        let highlightFadeOutTimer
        let highlightFadeInTimer

        if (hoveredProject) {
            // If there's a currently displayed project, fade both out first
            if (displayedProject && displayedProject.name !== hoveredProject.name) {
                setIsVisible(false)
                setIsHighlightVisible(false)
                fadeOutTimer = setTimeout(() => {
                    setDisplayedProject(hoveredProject)
                    setHighlightedProject(hoveredProject)
                    fadeInTimer = setTimeout(() => {
                        setIsVisible(true)
                        setIsHighlightVisible(true)
                    }, 50) // Small delay before fade-in
                }, 300) // Fade out duration
            } else if (!displayedProject) {
                // No current project, set both first then fade in with same delay
                setDisplayedProject(hoveredProject)
                setHighlightedProject(hoveredProject)
                fadeInTimer = setTimeout(() => {
                    setIsVisible(true)
                    setIsHighlightVisible(true)
                }, 50) // Small delay for smooth fade-in
            } else if (displayedProject.name === hoveredProject.name && !isVisible) {
                // Same project but not visible, make both visible with same delay
                fadeInTimer = setTimeout(() => {
                    setIsVisible(true)
                    setIsHighlightVisible(true)
                }, 50)
            }
        } else {
            // No hover, fade both out
            setIsVisible(false)
            setIsHighlightVisible(false)
            fadeOutTimer = setTimeout(() => {
                setDisplayedProject(null)
                setHighlightedProject(null)
            }, 300)
        }

        return () => {
            clearTimeout(fadeOutTimer)
            clearTimeout(fadeInTimer)
            clearTimeout(highlightFadeOutTimer)
            clearTimeout(highlightFadeInTimer)
        }
    }, [hoveredProject, displayedProject, isVisible])

    return (
        <>
            <Canvas
                camera={{
                    position: [0, 0, 5],
                    fov: 75
                }}
            >
                <WebGLSlider 
                    onHover={setHoveredProject}
                />
            </Canvas>
            <UIOverlay 
                highlightedProject={highlightedProject}
                isHighlightVisible={isHighlightVisible}
                displayedProject={displayedProject}
                isVisible={isVisible}
                projects={projects}
            />
        </>
    )
}

root.render(<App />)