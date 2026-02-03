import React, { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

function UIOverlay({ isTransitioning, isPostTransition, isReturningToSlider, onBackToSlider, selectedProject, currentImageIndex, isSliderAnimationComplete, hoveredProject, hoveredProjectIndex, totalProjects, onContactClick, isTransitioningToContact }) {
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
            {isGalleryMode ? (
              <span className="ui-text ui-clickable" onClick={onBackToSlider}>back</span>
            ) : (
              <span className="ui-text">
                client<span className={`ui-info ${isHoverVisible ? 'visible' : ''}`}>: {displayedHover?.client || ''}</span>
              </span>
            )}
          </div>

          <div className="ui-corner ui-top-right">
            {isGalleryMode ? (
              <span className="ui-text">{photoCounter}</span>
            ) : (
              <span className="ui-text ui-clickable" onClick={onContactClick}>contact</span>
            )}
          </div>

          {isGalleryMode && (
            <div className="ui-top-center">
              <span className="ui-text">{selectedProject?.client || ''}</span>
            </div>
          )}

          <div className="ui-corner ui-bottom-left">
            <img
              src="./img/logo/walters_logo.svg"
              alt="Walters Studio"
              className={`walters-logo ${isPostTransition ? 'clickable' : ''}`}
              onClick={isPostTransition ? onBackToSlider : undefined}
            />
          </div>

          <div className="ui-corner ui-bottom-right">
            {isGalleryMode ? (
              <span className={`ui-text ui-info-gallery ${isGalleryInfoVisible ? 'visible' : ''}`}>
                {displayedImageInfo}
              </span>
            ) : (
              <span className={`ui-text ui-info ${isHoverVisible ? 'visible' : ''}`}>
                {displayedHover?.year || ''}
              </span>
            )}
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
