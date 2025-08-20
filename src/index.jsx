import './styles/style.css'
import ReactDOM from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import FilmStripSlider from './sliders/FilmStripSlider.jsx'
import UIOverlay from './components/UIOverlay.jsx'
import SimpleWater from './effects/water/SimpleWater.jsx'
import MobileWater from './effects/water/MobileWater.jsx'
import FishParticleSystem from './effects/particles/FishParticleSystem.jsx'
import { getDeviceCapabilities } from './utils/deviceDetection.js'

// No background color updater needed - keep everything white

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
    // Removed background color state - keeping everything white
    const waterRef = useRef()
    
    // Device capabilities detection
    const [deviceCapabilities, setDeviceCapabilities] = useState(null)

    // Detect device capabilities on mount
    useEffect(() => {
        const capabilities = getDeviceCapabilities()
        setDeviceCapabilities(capabilities)
    }, [])

    // Removed background color transition code

    // Load projects data from JSON
    useEffect(() => {
        fetch('./data/projects.json')
            .then(response => response.json())
            .then(data => {
                setProjects(data.projects)
                setProjectsLoaded(true)
            })
            .catch(error => {
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

    // Handle back button click to return to slider - 3 phase transition
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
        setIsReturningFromGallery(true) // Mark that we're returning from gallery
        
        // PHASE 2: After scale-down completes, recreate slider
        setTimeout(() => {
            setIsPostTransition(false) // Exit post-transition mode
            // Keep selectedProject active during transition to prevent jump
            
            // Reset hover states
            setHoveredProject(null)
            setDisplayedProject(null)
            setIsVisible(false)
            setHighlightedProject(null)
            setIsHighlightVisible(false)
            
            // Small delay before recreating slider to ensure smooth transition
            setTimeout(() => {
                setSliderKey(prev => prev + 1) // Force complete slider recreation
                setIsScalingDownForReset(false) // Stop scale down state
                
                // PHASE 3: After slider expands completely, fade UI back in
                setTimeout(() => {
                    setIsReturningToSlider(false) // This triggers UI fade-in
                    setSelectedProject(null) // Now safe to clear selected project
                    setCurrentImageIndex(0) // Reset image index
                    setIsReturningFromGallery(false) // Reset the return flag
                }, 1500) // Match expand animation duration
            }, 100) // Small delay for state propagation
        }, 550) // Slightly faster to match animation
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

    return (
        <>
            <Canvas
                camera={{
                    position: [0, 0, deviceCapabilities?.shouldUseMobileWater ? 8 : 5],
                    fov: 75
                }}
                gl={{ 
                    alpha: false,
                    antialias: !deviceCapabilities?.shouldUseMobileWater,
                    powerPreference: 'high-performance',
                    pixelRatio: deviceCapabilities?.shouldUseMobileWater ? Math.min(window.devicePixelRatio, 2) : window.devicePixelRatio,
                    // Proper color management for accurate texture colors
                    outputColorSpace: THREE.SRGBColorSpace,
                    toneMapping: THREE.NoToneMapping,
                    toneMappingExposure: 1.0
                }}
                dpr={deviceCapabilities?.shouldUseMobileWater ? [1, 2] : [1, 3]}
                // Enable multi-sample antialiasing
                frameloop="always"
                flat={false}
                onCreated={({ scene, gl }) => {
                    // Add fog - push back fog start for mobile to keep front images clear
                    const isMobile = window.innerWidth <= 768
                    if (isMobile) {
                        scene.fog = new THREE.Fog(0xffffff, 8, 18)
                    } else {
                        scene.fog = new THREE.Fog(0xffffff, 5, 15)
                    }
                    // Set initial clear color to white
                    gl.setClearColor('#ffffff')
                }}
            >
                {/* No background color updater needed */}
                
                {/* Layer 1: Fish (bottom) */}
                <FishParticleSystem />
                
                {/* Layer 2: Film Strip Slider */}
                <FilmStripSlider 
                    projects={projects}
                    onHover={setHoveredProject}
                    waterRef={waterRef}
                    onTransitionStart={setIsTransitioning}
                    onBackgroundColorChange={null}
                />
                
                {/* Layer 3: Water (top) - Use appropriate water shader based on device */}
                {deviceCapabilities?.shouldUseMobileWater ? (
                    <MobileWater ref={waterRef} />
                ) : (
                    <SimpleWater ref={waterRef} />
                )}
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