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
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [isReturningToSlider, setIsReturningToSlider] = useState(false)
    const [currentImageIndex, setCurrentImageIndex] = useState(0)

    // Project gallery images - same for all projects for now
    const projectGalleryImages = [
        './img/project/51793e_4a8ef5a46faa413c808664a56e668ffc~mv2 1.png',
        './img/project/Screenshot 2025-06-16 at 16.24.51 1.png',
        './img/project/Screenshot 2025-06-17 at 00.03.55 1.png',
        './img/project/Screenshot 2025-06-17 at 00.14.29 1.png',
        './img/project/Screenshot 2025-06-17 at 00.14.52 1.png',
        './img/project/Screenshot 2025-06-17 at 00.15.56 1.png',
        './img/project/Screenshot 2025-06-17 at 00.16.31 1.png',
        './img/project/Screenshot 2025-06-17 at 00.16.56 1.png',
        './img/project/Screenshot 2025-06-17 at 00.52.22 1.png'
    ]

    const projects = [
        { 
            name: 'project-1', 
            description: 'Interactive web experience with modern UI',
            images: [
                './img/project-1.png', // Cover image first
                ...projectGalleryImages // Then all project gallery images
            ]
        },
        { 
            name: 'project-2', 
            description: 'E-commerce platform with seamless checkout',
            images: [
                './img/project-2.png', // Cover image first
                ...projectGalleryImages // Then all project gallery images
            ]
        },
        { 
            name: 'project-3', 
            description: 'Creative portfolio showcasing visual identity',
            images: [
                './img/project-3.png', // Cover image first
                ...projectGalleryImages // Then all project gallery images
            ]
        },
        { 
            name: 'project-4', 
            description: 'Mobile app with intuitive user interface',
            images: [
                './img/project-4.png', // Cover image first
                ...projectGalleryImages // Then all project gallery images
            ]
        },
        { 
            name: 'project-5', 
            description: 'Brand identity and logo design system',
            images: [
                './img/project-5.png', // Cover image first
                ...projectGalleryImages // Then all project gallery images
            ]
        },
        { 
            name: 'project-6', 
            description: 'Digital marketing campaign visualization',
            images: [
                './img/project-6.png', // Cover image first
                ...projectGalleryImages // Then all project gallery images
            ]
        },
        { 
            name: 'project-7', 
            description: 'Art installation with interactive elements',
            images: [
                './img/project-7.png', // Cover image first
                ...projectGalleryImages // Then all project gallery images
            ]
        }
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
            setIsTransitioning(false)
            setIsPostTransition(true)
            setSelectedProject(projectData)
            setCurrentImageIndex(0) // Reset to first image
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

    // Handle transition start (triggered from WebGLSlider)
    const handleTransitionStart = () => {
        setIsTransitioning(true)
    }

    // Handle back button click to return to slider - 2 phase transition
    const handleBackToSlider = () => {
        // Calculate initial offset to center the selected project
        const selectedIndex = projects.findIndex(p => p.name === selectedProject.name)
        const isMobile = window.innerWidth <= 768
        const itemWidth = isMobile ? 2.3 : 3.5 // Same as in WebGLSlider
        const calculatedOffset = selectedIndex * itemWidth
        setInitialOffset(calculatedOffset)
        
        // PHASE 1: Start returning process and scale down selected image
        setIsReturningToSlider(true) // This triggers UI fade-out
        setIsScalingDownForReset(true) // This triggers scale-down of selected image
        
        // PHASE 2: After scale-down completes, trigger slider expansion
        setTimeout(() => {
            setIsPostTransition(false) // Exit post-transition mode
            setSliderKey(prev => prev + 1) // Force complete slider recreation
            
            // Reset hover states
            setHoveredProject(null)
            setDisplayedProject(null)
            setIsVisible(false)
            setHighlightedProject(null)
            setIsHighlightVisible(false)
            
            // PHASE 3: After slider expands completely, fade UI back in
            setTimeout(() => {
                setIsReturningToSlider(false) // This triggers UI fade-in
                setIsScalingDownForReset(false)
                setSelectedProject(null)
                setCurrentImageIndex(0) // Reset image index
            }, 1500) // Wait for full expand animation to complete (1.5s as in original code)
        }, 600) // Wait for scale-down animation to complete (0.6s)
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
                    onTransitionStart={handleTransitionStart}
                    selectedProject={selectedProject}
                    isScalingDownForReset={isScalingDownForReset}
                    initialOffset={initialOffset}
                    currentImageIndex={currentImageIndex}
                    onImageIndexChange={setCurrentImageIndex}
                />
            </Canvas>
            <UIOverlay 
                highlightedProject={highlightedProject}
                isHighlightVisible={isHighlightVisible}
                displayedProject={displayedProject}
                isVisible={isVisible}
                projects={projects}
                isPostTransition={isPostTransition}
                isTransitioning={isTransitioning}
                isReturningToSlider={isReturningToSlider}
                selectedProject={selectedProject}
                currentImageIndex={currentImageIndex}
                onBackToSlider={handleBackToSlider}
            />
        </>
    )
}

root.render(<App />)