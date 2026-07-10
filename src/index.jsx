import './styles/style.css'
import ReactDOM from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Perf } from 'r3f-perf'
import IndexSlider from './sliders/IndexSlider.jsx'
import GallerySlider from './sliders/GallerySlider.jsx'
import UIOverlay from './components/UIOverlay.jsx'
import SimpleWater from './effects/water/SimpleWater.jsx'
import MobileWater from './effects/water/MobileWater.jsx'
import FishParticleSystem from './effects/particles/FishParticleSystem.jsx'
import { getDeviceCapabilities } from './utils/deviceDetection.js'
import CameraController from './components/CameraController.jsx'
import RotatingDragon from './components/RotatingDragon.jsx'
import Contact from './pages/Contact.jsx'
import BlossomTemplate from './effects/blossom/BlossomTemplate.jsx'


const root = ReactDOM.createRoot(document.querySelector('#root'))

function App() {
    // Blossom experiment: GPGPU petals that follow the cursor (?template=blossom)
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('template') === 'blossom') {
        return <BlossomTemplate />
    }

    // Page state
    const [showContact, setShowContact] = useState(false)
    const [isTransitioningToContact, setIsTransitioningToContact] = useState(false)
    const [isContactVisible, setIsContactVisible] = useState(false)
    const [shouldExitSlider, setShouldExitSlider] = useState(false)
    const [contactReturnTo, setContactReturnTo] = useState('slider') // 'slider' or 'gallery'
    const [savedProject, setSavedProject] = useState(null) // Save project when going to contact from gallery

    // Performance monitor visibility state
    const [showPerf, setShowPerf] = useState(false)

    const [hoveredProject, setHoveredProject] = useState(null)
    const [displayedProject, setDisplayedProject] = useState(null)
    const [isVisible, setIsVisible] = useState(false)
    const [highlightedProject, setHighlightedProject] = useState(null)
    const [isHighlightVisible, setIsHighlightVisible] = useState(false)
    const [isPostTransition, setIsPostTransition] = useState(false)
    const [selectedProject, setSelectedProject] = useState(null)
    const [sliderKey, setSliderKey] = useState(0) // Key to force complete slider recreation
    const [initialOffset, setInitialOffset] = useState(0)
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [isReturningToSlider, setIsReturningToSlider] = useState(false)
    const [currentImageIndex, setCurrentImageIndex] = useState(0)
    const [projects, setProjects] = useState([])
    const [projectsLoaded, setProjectsLoaded] = useState(false)
    const [isReturningFromGallery, setIsReturningFromGallery] = useState(false)
    const [shouldExitGallery, setShouldExitGallery] = useState(false)
    const [isSliderAnimationComplete, setIsSliderAnimationComplete] = useState(true) // Start as true for initial state
    const [centeredProjectIndex, setCenteredProjectIndex] = useState(0) // Track centered project for mobile counter
    const [sliderVelocity, setSliderVelocity] = useState(0) // Track slider velocity for marquee
    const [centerScale, setCenterScale] = useState(1.0) // Track center scale for indicator animation

    // Slider switching states
    const [showFilmStrip, setShowFilmStrip] = useState(true)
    const [showSingleImage, setShowSingleImage] = useState(false)
    const [selectedImageIndex, setSelectedImageIndex] = useState(0)
    const waterRef = useRef()

    // Device capabilities detection
    const [deviceCapabilities, setDeviceCapabilities] = useState(null)

    // Detect device capabilities on mount
    useEffect(() => {
        const capabilities = getDeviceCapabilities()
        setDeviceCapabilities(capabilities)
    }, [])

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
    
    // Handle image selection from FilmStripSlider
    const handleImageSelect = (projectIndex) => {
        setSelectedImageIndex(projectIndex) // This is actually the project index now
        // projectIndex is the index of the selected project
        if (projects[projectIndex]) {
            setSelectedProject(projects[projectIndex])
            setCurrentImageIndex(0) // Start at first image of the project
        }
        // Don't switch immediately - wait for FilmStripSlider completion callback
    }
    
    // Handle FilmStripSlider fade completion (device-agnostic)
    const handleFilmStripComplete = () => {
        setShowFilmStrip(false)
        setShowSingleImage(true)
        setIsPostTransition(true) // Set to gallery mode
        setIsTransitioning(false) // Transition complete
    }

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

    // Handle fly-in animation completion
    const handleFlyInComplete = () => {
        setIsSliderAnimationComplete(true)
    }
    
    // Also set complete when slider becomes visible but before fly-in finishes
    useEffect(() => {
        if (isReturningFromGallery && showFilmStrip) {
            // Mark as complete immediately when slider becomes visible
            // This allows UI interaction during fly-in animation
            setTimeout(() => {
                setIsSliderAnimationComplete(true)
            }, 100) // Small delay to let slider initialize
        }
    }, [isReturningFromGallery, showFilmStrip])

    // Handle back button click to return to slider - 4 phase transition with plane curve completion
    const handleBackToSlider = () => {
        // Calculate initial offset to center the selected project
        const selectedIndex = projects.findIndex(p => p.name === selectedProject.name)
        const isMobile = window.innerWidth <= 768
        const itemWidth = isMobile ? 2.3 : 3.5 // Same as in WebGLSlider
        const calculatedOffset = selectedIndex * itemWidth
        setInitialOffset(calculatedOffset)
        
        // PHASE 1 (0ms): Start plane exit animation (1s expo.in)
        setShouldExitGallery(true)

        // PHASE 2 (600ms): Start UI fade out while plane is moving
        setTimeout(() => {
            setIsReturningToSlider(true) // This triggers UI fade-out
        }, 600)

        // PHASE 3 (1100ms): Switch sliders shortly after gallery exit completes (1000ms)
        setTimeout(() => {
            setShowSingleImage(false)
            setShowFilmStrip(true)
            setIsPostTransition(false) // Exit post-transition mode

            // Reset hover states
            setHoveredProject(null)
            setDisplayedProject(null)
            setIsVisible(false)
            setHighlightedProject(null)
            setIsHighlightVisible(false)

            // Recreate slider to ensure proper positioning
            setSliderKey(prev => prev + 1) // Force complete slider recreation
            setIsReturningFromGallery(true) // Mark that we're returning from gallery
            setIsSliderAnimationComplete(false) // Mark that slider animation is starting
        }, 1100)

        // PHASE 4 (1500ms): Fade UI back in and clean up
        setTimeout(() => {
            setIsReturningToSlider(false) // This triggers UI fade-in
            setSelectedProject(null) // Now safe to clear selected project
            setCurrentImageIndex(0) // Reset image index
            setIsReturningFromGallery(false) // Reset the return flag
            setShouldExitGallery(false) // Reset exit state
        }, 1500)
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

    // Handle slider exit complete (for contact page transition)
    const handleSliderExitComplete = () => {
        // Slider animation complete, switch to contact page
        setShowContact(true)
        setShouldExitSlider(false)
        setIsTransitioning(false) // Reset transitioning state

        // Fade in contact page after a short delay
        setTimeout(() => {
            setIsContactVisible(true)
            setIsTransitioningToContact(false)
        }, 100)
    }

    // Handle contact page navigation with fade transitions
    const handleContactClick = () => {
        if (isPostTransition) {
            // FROM GALLERY MODE: Save state and exit gallery
            setContactReturnTo('gallery')
            setSavedProject(selectedProject)

            // PHASE 1 (0ms): Start gallery exit animation
            setShouldExitGallery(true)

            // PHASE 2 (400ms): Start UI fade out while gallery is animating
            setTimeout(() => {
                setIsTransitioningToContact(true)
            }, 400)

            // PHASE 3 (1000ms): Gallery animation complete, switch to contact
            setTimeout(() => {
                setShowSingleImage(false)
                setShowFilmStrip(true)
                setIsPostTransition(false)
                setShouldExitGallery(false)
                // Don't clear selectedProject - we need it for return
                setShowContact(true)
                setIsTransitioning(false)
            }, 1000)

            // PHASE 4 (1100ms): Fade in contact page
            setTimeout(() => {
                setIsContactVisible(true)
                setIsTransitioningToContact(false)
            }, 1100)
        } else {
            // FROM SLIDER MODE: Exit slider first, then show contact
            setContactReturnTo('slider')
            setSavedProject(null)

            // PHASE 1 (0ms): Start slider exit animation (fog fade out)
            setShouldExitSlider(true)

            // PHASE 2 (400ms): Start UI fade out while slider is animating
            setTimeout(() => {
                setIsTransitioningToContact(true)
            }, 400)

            // PHASE 3: Switch happens via onExitComplete callback when slider animation finishes
        }
    }

    // Handle returning from contact page - return to slider or gallery
    const handleContactBack = () => {
        // PHASE 1 (0ms): Fade out contact page
        setIsContactVisible(false)

        if (contactReturnTo === 'gallery' && savedProject) {
            // RETURN TO GALLERY
            // PHASE 2 (600ms): Switch back to gallery
            setTimeout(() => {
                setShowContact(false)
                setIsTransitioningToContact(false)
                setIsTransitioning(false)
                // Restore gallery state
                setSelectedProject(savedProject)
                setShowFilmStrip(false)
                setShowSingleImage(true)
                setIsPostTransition(true)
                setCurrentImageIndex(0)
            }, 600)

            // PHASE 3 (700ms): Show UI
            setTimeout(() => {
                setSavedProject(null)
                setContactReturnTo('slider')
            }, 700)
        } else {
            // RETURN TO SLIDER
            // PHASE 2 (600ms): Switch back to slider with fly-in animation
            setTimeout(() => {
                setShowContact(false)
                setIsTransitioningToContact(false)
                // Reset all transitioning states to clean slate
                setIsTransitioning(false)
                setIsReturningToSlider(false)
                setIsPostTransition(false)
                setSelectedProject(null)
                // Slider needs to recreate since Canvas was unmounted
                setSliderKey(prev => prev + 1)
                setIsReturningFromGallery(true) // Trigger fly-in animation
                setIsSliderAnimationComplete(false) // UI hidden initially
            }, 600)

            // PHASE 3 (800ms): Show UI while slider is flying in
            setTimeout(() => {
                setIsSliderAnimationComplete(true)
                setIsReturningFromGallery(false)
            }, 800)
        }
    }

    // Show contact page
    if (showContact) {
        return <Contact onBack={handleContactBack} isVisible={isContactVisible} />
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
                    antialias: true, // Always enable for smooth edges
                    powerPreference: 'high-performance',
                    // Proper color management for accurate texture colors
                    outputColorSpace: THREE.SRGBColorSpace,
                    toneMapping: THREE.NoToneMapping,
                    toneMappingExposure: 1.0
                }}
                dpr={[1, window.devicePixelRatio]} // Use full device pixel ratio
                // Enable multi-sample antialiasing
                frameloop="always"
                flat={false}
                onCreated={({ scene, gl }) => {
                    // Add fog - subtle depth effect for dragons (static)
                    const isMobile = window.innerWidth <= 768
                    if (isMobile) {
                        scene.fog = new THREE.Fog(0xffffff, 8, 15)
                    } else {
                        scene.fog = new THREE.Fog(0xffffff, 5, 12)
                    }
                    // Set initial clear color to white
                    gl.setClearColor('#ffffff')
                }}
            >
                {/* Camera Controller */}
                <CameraController />

                {/* Rotating Snake */}
                {/* <RotatingDragon /> */}

                {/* Intro Scene */}
                {/* <IntroScene waterRef={waterRef} /> */}

                {/* Dragon Intro */}
                {/* <DragonIntro /> */}

                {/* Layer 1: Fish (bottom) */}
                {/* <FishParticleSystem /> */}

                {/* Layer 2: Conditional Slider Rendering */}
                {showFilmStrip && (
                    <IndexSlider
                        projects={projects}
                        onHover={setHoveredProject}
                        waterRef={waterRef}
                        onTransitionStart={setIsTransitioning}
                        onTransitionComplete={handleFilmStripComplete}
                        onImageSelect={handleImageSelect}
                        isReturningFromGallery={isReturningFromGallery}
                        onFlyInComplete={handleFlyInComplete}
                        shouldExit={shouldExitSlider}
                        onExitComplete={handleSliderExitComplete}
                        onCenteredProjectChange={setCenteredProjectIndex}
                        onSliderVelocity={setSliderVelocity}
                        onCenterScale={setCenterScale}
                    />
                )}

                {showSingleImage && (
                    <GallerySlider
                        key={selectedImageIndex} // Force complete recreation
                        initialImageIndex={0} // Always start at first image of the selected project
                        waterRef={waterRef}
                        selectedProject={selectedProject}
                        currentImageIndex={currentImageIndex}
                        setCurrentImageIndex={setCurrentImageIndex}
                        shouldExit={shouldExitGallery}
                    />
                )}

                {/* Layer 3: Water (top) - Use appropriate water shader based on device */}
                {/* {deviceCapabilities?.shouldUseMobileWater ? (
                    <MobileWater ref={waterRef} />
                ) : (
                    <SimpleWater ref={waterRef} />
                )} */}


                {/* Performance Monitor with visibility toggle */}
                {showPerf && <Perf position="bottom-right" />}
            </Canvas>
            
            {/* Performance Monitor Toggle Button - Hidden */}
            {/* <button
                onClick={() => setShowPerf(!showPerf)}
                style={{
                    position: 'fixed',
                    bottom: showPerf ? '250px' : '20px',
                    right: '20px',
                    padding: '6px 10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    color: showPerf ? '#00ff00' : '#888888',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontFamily: '"Helvetica Neue", -apple-system, sans-serif',
                    fontWeight: '500',
                    zIndex: 1000,
                    opacity: 0.6,
                    transition: 'all 0.3s',
                    backdropFilter: 'blur(4px)'
                }}
                onMouseEnter={(e) => e.target.style.opacity = '1'}
                onMouseLeave={(e) => e.target.style.opacity = '0.6'}
            >
                {showPerf ? '◼ PERF' : '▶ PERF'}
            </button> */}
            
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
                isSliderAnimationComplete={isSliderAnimationComplete}
                hoveredProject={hoveredProject}
                hoveredProjectIndex={hoveredProject ? projects.findIndex(p => p.id === hoveredProject.id) : -1}
                totalProjects={projects.length}
                onContactClick={handleContactClick}
                isTransitioningToContact={isTransitioningToContact}
                centeredProjectIndex={centeredProjectIndex}
                sliderVelocity={sliderVelocity}
                centerScale={centerScale}
            />
        </>
    )
}

root.render(<App />)