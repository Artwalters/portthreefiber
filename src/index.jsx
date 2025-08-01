import './style.css'
import ReactDOM from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { useState, useEffect, useRef } from 'react'
import WebGLSlider from './WebGLSlider.jsx'
import UIOverlay from './UIOverlay.jsx'
import IntroScreen from './IntroScreen.jsx'
import SimpleWater from './SimpleWater.jsx'
import KoiFish from './KoiFish.jsx'
import FishParticleSystem from './FishParticleSystem.jsx'

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
    const [projects, setProjects] = useState([])
    const [projectsLoaded, setProjectsLoaded] = useState(false)
    const [isReturningFromGallery, setIsReturningFromGallery] = useState(false)
    const [showIntro, setShowIntro] = useState(true)
    const [uiFadingIn, setUiFadingIn] = useState(false)
    const hasPlayedIntroAnimation = useRef(false)
    const waterRef = useRef()

    // Load projects data from JSON
    useEffect(() => {
        fetch('./data/projects.json')
            .then(response => response.json())
            .then(data => {
                setProjects(data.projects)
                setProjectsLoaded(true)
            })
            .catch(error => {
                console.error('Error loading projects:', error)
                // Fallback to empty array if loading fails
                setProjects([])
                setProjectsLoaded(true)
            })
    }, [])

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

    // Navigation throttling
    const [isNavigating, setIsNavigating] = useState(false)
    const navigationTimeout = useRef(null)

    // Gallery navigation functions with throttling
    const navigateGallery = (direction) => {
        if (!selectedProject || !selectedProject.images || isNavigating) return
        
        // Set navigating state to prevent rapid navigation
        setIsNavigating(true)
        
        const totalImages = selectedProject.images.length
        if (direction === 'next') {
            setCurrentImageIndex((prev) => (prev + 1) % totalImages)
        } else {
            setCurrentImageIndex((prev) => (prev - 1 + totalImages) % totalImages)
        }
        
        // Clear existing timeout
        if (navigationTimeout.current) {
            clearTimeout(navigationTimeout.current)
        }
        
        // Reset navigation lock after delay
        navigationTimeout.current = setTimeout(() => {
            setIsNavigating(false)
        }, 600) // 600ms delay between navigations
    }

    // Handle full-screen gallery navigation
    useEffect(() => {
        if (!isPostTransition) return

        // Add gallery mode class to body
        document.body.classList.add('gallery-mode')

        // Touch/swipe tracking
        let touchStartX = 0
        let touchStartY = 0
        let touchStartTime = 0
        let isSwiping = false
        let lastWheelTime = 0
        let touchHandled = false // Flag to prevent double handling

        // Handle clicks (only for mouse, not touch)
        const handleClick = (e) => {
            // Ignore touch-triggered clicks - use multiple checks for reliability
            if (e.pointerType === 'touch' || touchHandled) return
            
            // Additional check for touch events that might not have pointerType
            if (e.type === 'touchend' || e.type === 'touchstart') return
            
            // Ignore if clicking on UI elements
            if (e.target.closest('.ui-overlay')) {
                // Check if it's the back button
                if (e.target.classList.contains('back-button')) {
                    return // Let the back button handle its own click
                }
                return // Ignore other UI clicks
            }

            // Navigate based on click position
            const clickX = e.clientX
            const screenWidth = window.innerWidth
            
            if (clickX > screenWidth / 2) {
                navigateGallery('next')
            } else {
                navigateGallery('previous')
            }
        }

        // Handle keyboard
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowLeft') {
                navigateGallery('previous')
            } else if (e.key === 'ArrowRight') {
                navigateGallery('next')
            } else if (e.key === 'ArrowUp') {
                navigateGallery('previous')
            } else if (e.key === 'ArrowDown') {
                navigateGallery('next')
            }
        }

        // Handle touch start
        const handleTouchStart = (e) => {
            touchStartX = e.touches[0].clientX
            touchStartY = e.touches[0].clientY
            touchStartTime = Date.now()
            isSwiping = false
            touchHandled = false // Reset flag on new touch
        }

        // Handle touch move to detect if it's a swipe
        const handleTouchMove = (e) => {
            if (!touchStartTime) return
            
            const currentX = e.touches[0].clientX
            const currentY = e.touches[0].clientY
            const deltaX = Math.abs(currentX - touchStartX)
            const deltaY = Math.abs(currentY - touchStartY)
            
            // If moved more than 10px, it's a swipe not a tap
            if (deltaX > 10 || deltaY > 10) {
                isSwiping = true
            }
        }

        // Handle touch end for swipe
        const handleTouchEnd = (e) => {
            if (!touchStartTime) return

            const touchEndX = e.changedTouches[0].clientX
            const touchEndY = e.changedTouches[0].clientY
            const touchDuration = Date.now() - touchStartTime

            const deltaX = touchEndX - touchStartX
            const deltaY = touchEndY - touchStartY
            const absDeltaX = Math.abs(deltaX)
            const absDeltaY = Math.abs(deltaY)

            // Quick tap - treat as click (only if not swiping)
            if (!isSwiping && touchDuration < 300 && absDeltaX < 20 && absDeltaY < 20) {
                // Check if tapping on UI
                if (e.target.closest('.ui-overlay')) return
                
                // Set flag to prevent duplicate click event
                touchHandled = true
                
                if (touchEndX > window.innerWidth / 2) {
                    navigateGallery('next')
                } else {
                    navigateGallery('previous')
                }
                
                // Reset flag after a short delay to allow for the next interaction
                setTimeout(() => {
                    touchHandled = false
                }, 100)
                return
            }

            // Swipe detection
            const minSwipeDistance = 50

            if (isSwiping && (absDeltaX > minSwipeDistance || absDeltaY > minSwipeDistance)) {
                if (absDeltaX > absDeltaY) {
                    // Horizontal swipe
                    if (deltaX > 0) {
                        navigateGallery('previous') // Swipe right = go back
                    } else {
                        navigateGallery('next') // Swipe left = go forward
                    }
                } else {
                    // Vertical swipe
                    if (deltaY > 0) {
                        navigateGallery('previous') // Swipe down = go back
                    } else {
                        navigateGallery('next') // Swipe up = go forward
                    }
                }
            }
            
            // Reset
            touchStartTime = 0
            isSwiping = false
        }

        // Handle mouse wheel/scroll with throttling
        const handleWheel = (e) => {
            e.preventDefault()
            
            const now = Date.now()
            const timeSinceLastWheel = now - lastWheelTime
            
            // Throttle wheel events (min 400ms between navigations)
            if (timeSinceLastWheel < 400) return
            
            lastWheelTime = now
            
            // Navigate based on scroll direction
            if (e.deltaY > 0) {
                navigateGallery('next')
            } else if (e.deltaY < 0) {
                navigateGallery('previous')
            }
        }

        // Add event listeners
        document.addEventListener('click', handleClick)
        document.addEventListener('keydown', handleKeyDown)
        document.addEventListener('touchstart', handleTouchStart)
        document.addEventListener('touchmove', handleTouchMove, { passive: false })
        document.addEventListener('touchend', handleTouchEnd)
        document.addEventListener('wheel', handleWheel, { passive: false })

        return () => {
            document.removeEventListener('click', handleClick)
            document.removeEventListener('keydown', handleKeyDown)
            document.removeEventListener('touchstart', handleTouchStart)
            document.removeEventListener('touchmove', handleTouchMove)
            document.removeEventListener('touchend', handleTouchEnd)
            document.removeEventListener('wheel', handleWheel)
            document.body.classList.remove('gallery-mode')
            
            // Cleanup navigation timeout
            if (navigationTimeout.current) {
                clearTimeout(navigationTimeout.current)
            }
        }
    }, [isPostTransition, selectedProject])

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
        
        // Reset intro-specific UI fade state when returning from gallery
        setUiFadingIn(undefined)
        
        // PHASE 1: Start returning process and scale down selected image
        setIsReturningToSlider(true) // This triggers UI fade-out
        setIsScalingDownForReset(true) // This triggers scale-down of selected image
        setIsReturningFromGallery(true) // Mark that we're returning from gallery
        
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
                setIsReturningFromGallery(false) // Reset the return flag
            }, 1500) // Wait for full expand animation to complete (1.5s as in original code)
        }, 600) // Wait for scale-down animation to complete (0.6s)
    }

    // Handle intro completion
    const handleIntroComplete = () => {
        setShowIntro(false)
        // Mark that intro has been completed
        hasPlayedIntroAnimation.current = true
        // Start UI fade-in after a short delay
        setTimeout(() => {
            setUiFadingIn(true)
        }, 100) // Small delay to ensure smooth transition
    }

    // Don't render until projects are loaded
    if (!projectsLoaded) {
        return <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100vh',
            fontFamily: 'PSTimesTrial, serif'
        }}>Loading...</div>
    }

    // Show intro screen first
    if (showIntro) {
        return <IntroScreen onComplete={handleIntroComplete} />
    }

    return (
        <>
            <Canvas
                camera={{
                    position: [0, 0, 5],
                    fov: 75
                }}
                gl={{ 
                    clearColor: 'white',
                    alpha: false
                }}
            >
                {/* Layer 1: Fish (bottom) */}
                {/* <KoiFish /> */}
                <FishParticleSystem />
                
                {/* Layer 2: Slider (middle) */}
                <WebGLSlider 
                    key={sliderKey}
                    projects={projects}
                    onHover={setHoveredProject}
                    onTransitionComplete={handleTransitionComplete}
                    onTransitionStart={handleTransitionStart}
                    selectedProject={selectedProject}
                    isScalingDownForReset={isScalingDownForReset}
                    initialOffset={initialOffset}
                    currentImageIndex={currentImageIndex}
                    onImageIndexChange={setCurrentImageIndex}
                    isReturningFromGallery={isReturningFromGallery}
                    hasPlayedIntroAnimation={hasPlayedIntroAnimation.current}
                    waterRef={waterRef}
                />
                
                {/* Layer 3: Water (top) */}
                <SimpleWater ref={waterRef} />
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
                uiFadingIn={uiFadingIn}
            />
        </>
    )
}

root.render(<App />)