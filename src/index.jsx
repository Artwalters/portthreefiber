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
    const [isPostTransition, setIsPostTransition] = useState(false)
    const [selectedProject, setSelectedProject] = useState(null)
    const [sliderKey, setSliderKey] = useState(0) // Key to force complete slider recreation
    const [isScalingDownForReset, setIsScalingDownForReset] = useState(false)
    const [initialOffset, setInitialOffset] = useState(0)

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

    // Handle transition completion
    const handleTransitionComplete = (projectData, transitionComplete) => {
        if (transitionComplete) {
            setIsPostTransition(true)
            setSelectedProject(projectData)
            // Clear hover states since we're in post-transition mode
            setHoveredProject(null)
            setDisplayedProject(null)
            setIsVisible(false)
            setHighlightedProject(null)
            setIsHighlightVisible(false)
        } else if (transitionComplete === false && projectData === null) {
            // This shouldn't happen with new approach - we recreate slider instead
        }
    }

    // Handle back button click to return to slider
    const handleBackToSlider = () => {
        // Calculate initial offset to center the selected project
        const selectedIndex = projects.findIndex(p => p.name === selectedProject.name)
        const isMobile = window.innerWidth <= 768
        const itemWidth = isMobile ? 2.3 : 3.5 // Same as in WebGLSlider
        const calculatedOffset = selectedIndex * itemWidth
        setInitialOffset(calculatedOffset)
        
        // Start both animations simultaneously
        setIsScalingDownForReset(true) // This triggers scale-down of selected image
        setIsPostTransition(false) // This triggers UI change
        
        // Force complete slider recreation immediately for smooth transition
        setSliderKey(prev => prev + 1)
        
        // Reset all other states immediately
        setHoveredProject(null)
        setDisplayedProject(null)
        setIsVisible(false)
        setHighlightedProject(null)
        setIsHighlightVisible(false)
        
        // Clean up states after animations complete
        setTimeout(() => {
            setIsScalingDownForReset(false)
            setSelectedProject(null)
        }, 2000) // Wait for expand animation to complete (2s)
    }

    return (
        <>
            <Canvas
                camera={{
                    position: [0, 0, 5],
                    fov: 75
                }}
            >
                <WebGLSlider 
                    key={sliderKey}
                    onHover={setHoveredProject}
                    onTransitionComplete={handleTransitionComplete}
                    selectedProject={selectedProject}
                    isScalingDownForReset={isScalingDownForReset}
                    initialOffset={initialOffset}
                />
            </Canvas>
            <UIOverlay 
                highlightedProject={highlightedProject}
                isHighlightVisible={isHighlightVisible}
                displayedProject={displayedProject}
                isVisible={isVisible}
                projects={projects}
                isPostTransition={isPostTransition}
                selectedProject={selectedProject}
                onBackToSlider={handleBackToSlider}
            />
        </>
    )
}

root.render(<App />)