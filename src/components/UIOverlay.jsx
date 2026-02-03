import React, { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

function UIOverlay({ isTransitioning, isPostTransition, isReturningToSlider, onBackToSlider, selectedProject, currentImageIndex, isSliderAnimationComplete, hoveredProject, hoveredProjectIndex, totalProjects, onContactClick, isTransitioningToContact, centeredProjectIndex, sliderVelocity, centerScale }) {
  const overlayRef = useRef(null)

  // State for smooth transitions between hovered projects
  const [displayedHover, setDisplayedHover] = useState(null)
  const [displayedHoverIndex, setDisplayedHoverIndex] = useState(-1)
  const [isHoverVisible, setIsHoverVisible] = useState(false)

  // State for gallery info animation
  const [displayedImageInfo, setDisplayedImageInfo] = useState('')
  const [isGalleryInfoVisible, setIsGalleryInfoVisible] = useState(false)

  // Check if we're in gallery mode
  const isGalleryMode = isPostTransition && selectedProject

  // Calculate photo counter
  const totalImages = selectedProject?.images?.length || 0
  const photoCounter = isGalleryMode ? `${currentImageIndex + 1}/${totalImages}` : ''

  // Get current image description
  const currentImageDescription = selectedProject?.images?.[currentImageIndex]?.description || ''

  // Check if mobile
  const isMobile = window.innerWidth <= 768

  // Handle hover transitions - fade out, change, fade in
  useEffect(() => {
    let fadeInTimer

    if (hoveredProject) {
      if (displayedHover && displayedHover.id !== hoveredProject.id) {
        setIsHoverVisible(false)
        fadeInTimer = setTimeout(() => {
          setDisplayedHover(hoveredProject)
          setDisplayedHoverIndex(hoveredProjectIndex)
          setTimeout(() => setIsHoverVisible(true), 30)
        }, 150)
      } else if (!displayedHover) {
        setDisplayedHover(hoveredProject)
        setDisplayedHoverIndex(hoveredProjectIndex)
        fadeInTimer = setTimeout(() => {
          setIsHoverVisible(true)
        }, 200)
      }
    } else {
      setIsHoverVisible(false)
      fadeInTimer = setTimeout(() => {
        setDisplayedHover(null)
        setDisplayedHoverIndex(-1)
      }, 150)
    }

    return () => clearTimeout(fadeInTimer)
  }, [hoveredProject, hoveredProjectIndex])

  // Handle gallery info transitions when image changes
  useEffect(() => {
    if (!isGalleryMode) {
      setIsGalleryInfoVisible(false)
      return
    }

    setIsGalleryInfoVisible(false)
    const timer = setTimeout(() => {
      setDisplayedImageInfo(currentImageDescription)
      setTimeout(() => setIsGalleryInfoVisible(true), 50)
    }, 150)

    return () => clearTimeout(timer)
  }, [currentImageIndex, currentImageDescription, isGalleryMode])

  // Initialize overlay as visible on mount
  useEffect(() => {
    if (overlayRef.current) {
      gsap.set(overlayRef.current, { opacity: 1 })
    }
  }, [])

  // Ref for marquee animation
  const marqueeAnimationRef = useRef(null)
  const marqueeInitializedRef = useRef(false)

  // Initialize dragon marquee (duplicate content once)
  useEffect(() => {
    if (!isMobile || marqueeInitializedRef.current) return

    const marquee = document.querySelector('[data-marquee-scroll-direction-target]')
    if (!marquee) return

    const marqueeContent = marquee.querySelector('[data-marquee-collection-target]')
    const marqueeScroll = marquee.querySelector('[data-marquee-scroll-target]')
    if (!marqueeContent || !marqueeScroll) return

    const { marqueeDuplicate: duplicate } = marquee.dataset
    const duplicateAmount = parseInt(duplicate || 0)

    // Duplicate marquee content
    if (duplicateAmount > 0) {
      const fragment = document.createDocumentFragment()
      for (let i = 0; i < duplicateAmount; i++) {
        fragment.appendChild(marqueeContent.cloneNode(true))
      }
      marqueeScroll.appendChild(fragment)
    }

    marqueeInitializedRef.current = true
  }, [isMobile])

  // Update marquee based on slider velocity
  useEffect(() => {
    if (!isMobile) return

    const marquee = document.querySelector('[data-marquee-scroll-direction-target]')
    if (!marquee) return

    const marqueeItems = marquee.querySelectorAll('[data-marquee-collection-target]')
    if (!marqueeItems.length) return

    // Map slider velocity to marquee movement
    // Positive velocity = scrolling down = marquee moves left
    // Negative velocity = scrolling up = marquee moves right
    const speed = sliderVelocity * 0.05 // Scale factor

    marqueeItems.forEach(item => {
      const currentX = gsap.getProperty(item, 'xPercent') || 0
      let newX = currentX - speed

      // Loop the marquee
      if (newX <= -100) newX += 100
      if (newX >= 0) newX -= 100

      gsap.set(item, { xPercent: newX })
    })
  }, [sliderVelocity, isMobile])

  // Handle GSAP animations based on state changes
  useEffect(() => {
    if (!overlayRef.current) return

    if (isTransitioning || isTransitioningToContact) {
      gsap.to(overlayRef.current, {
        opacity: 0,
        duration: 0.6,
        ease: "power2.inOut"
      })
    } else if (isReturningToSlider) {
      gsap.to(overlayRef.current, {
        opacity: 0,
        duration: 0.6,
        ease: "power2.inOut"
      })
    } else if (isPostTransition) {
      gsap.to(overlayRef.current, {
        opacity: 1,
        duration: 0.6,
        ease: "power2.inOut"
      })
    } else if (isSliderAnimationComplete) {
      gsap.to(overlayRef.current, {
        opacity: 1,
        duration: 0.8,
        ease: "power2.out"
      })
    } else {
      gsap.set(overlayRef.current, { opacity: 0 })
    }
  }, [isTransitioning, isPostTransition, isReturningToSlider, isSliderAnimationComplete, isTransitioningToContact])

  return (
    <div
      ref={overlayRef}
      className={`ui-overlay ${isTransitioning ? 'transitioning' : ''} ${isPostTransition ? 'post-transition' : ''} ${isReturningToSlider ? 'returning-to-slider' : ''}`}
    >

      {isMobile ? (
        // Mobile UI
        <>
          <div className="ui-corner ui-top-left">
            <span className="ui-text ui-clickable" onClick={isGalleryMode ? onBackToSlider : undefined}>back</span>
          </div>

          <div className="ui-corner ui-top-right">
            {isGalleryMode ? (
              <span className="ui-text">{photoCounter}</span>
            ) : (
              <span className="ui-text ui-clickable" onClick={onContactClick}>contact</span>
            )}
          </div>

          <div className="ui-top-center">
            {isGalleryMode ? (
              <span className="ui-text">{selectedProject?.client || ''}</span>
            ) : (
              <span className="ui-text">
                {`${centeredProjectIndex + 1}/${totalProjects}`}
              </span>
            )}
          </div>

          {/* Center indicator lines - move inward with zoom */}
          {!isGalleryMode && (() => {
            // Map centerScale: 1.0 = no offset, 0.92 = max inward offset
            const inwardAmount = (1.0 - (centerScale || 1.0)) / (1.0 - 0.92) // 0 to 1
            const offset = inwardAmount * 1.5 // max 1.5em inward
            return (
              <>
                <div className="ui-center-line ui-center-line-left" style={{ left: `${offset}em` }}></div>
                <div className="ui-center-line ui-center-line-right" style={{ right: `${offset}em` }}></div>
              </>
            )
          })()}

          <div className="ui-bottom-center">
            <div
              className={`dragon-logo-container ${isPostTransition ? 'clickable' : ''}`}
              onClick={isPostTransition ? onBackToSlider : undefined}
              data-marquee-scroll-direction-target=""
              data-marquee-direction="left"
              data-marquee-status="normal"
              data-marquee-speed="20"
              data-marquee-scroll-speed="5"
              data-marquee-duplicate="2"
            >
              <div data-marquee-scroll-target="" className="dragon-marquee-scroll">
                <div data-marquee-collection-target="" className="dragon-marquee-collection">
                  <img src="./img/logo/walters_dragon.png" alt="" className="dragon-logo" />
                  <img src="./img/logo/walters_dragon.png" alt="" className="dragon-logo" />
                  <img src="./img/logo/walters_dragon.png" alt="" className="dragon-logo" />
                </div>
              </div>
            </div>
          </div>

        </>
      ) : (
        // Desktop UI
        <>
          <div className="ui-corner ui-top-left ui-top-row">
            {isGalleryMode ? (
              <span className="ui-text ui-clickable" onClick={onBackToSlider}>back</span>
            ) : (
              <span className="ui-text">walters studio</span>
            )}

            <span className="ui-text ui-top-client">
              {isGalleryMode && selectedProject ? selectedProject.client : (
                <>client<span className={`ui-info ${isHoverVisible ? 'visible' : ''}`}>: {displayedHover?.client || ''}</span></>
              )}
            </span>

            {isGalleryMode && selectedProject && (
              <span className="ui-text ui-top-project-type">
                {selectedProject.info}
              </span>
            )}

            {isGalleryMode && (
              <span className="ui-text ui-top-index">
                {photoCounter}
              </span>
            )}
          </div>

          <div className="ui-corner ui-top-right">
            <span className="ui-text ui-clickable" onClick={onContactClick}>contact</span>
          </div>

          <div className="ui-corner ui-bottom-left">
            <img
              src="./img/logo/walters_logo.svg"
              alt="Walters Studio"
              className={`walters-logo ${isPostTransition ? 'clickable' : ''}`}
              onClick={isPostTransition ? onBackToSlider : undefined}
            />
          </div>

          <div className="ui-bottom-center">
            <span className={`ui-text ui-info ${isHoverVisible ? 'visible' : ''}`}>
              {!isGalleryMode ? (displayedHover?.year || '') : ''}
            </span>
          </div>

          <div className="ui-bottom-client">
            <span className="ui-text">
              {isGalleryMode ? (
                <>about<span className={`ui-info-gallery ${isGalleryInfoVisible ? 'visible' : ''}`}>: {displayedImageInfo}</span></>
              ) : (
                <>about<span className={`ui-info ${isHoverVisible ? 'visible' : ''}`}>: {displayedHover?.info || ''}</span></>
              )}
            </span>
          </div>

          <div className="ui-corner ui-bottom-right">
            <span className="ui-text">All Rights Reserved</span>
          </div>
        </>
      )}
    </div>
  )
}

export default React.memo(UIOverlay)
