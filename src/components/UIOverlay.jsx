import React, { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

function UIOverlay({ isTransitioning, isPostTransition, isReturningToSlider, onBackToSlider, selectedProject, currentImageIndex, isSliderAnimationComplete, hoveredProject, hoveredProjectIndex, totalProjects }) {
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
        // Different project - fade out first, then change and fade in
        setIsHoverVisible(false)
        fadeInTimer = setTimeout(() => {
          setDisplayedHover(hoveredProject)
          setDisplayedHoverIndex(hoveredProjectIndex)
          setTimeout(() => setIsHoverVisible(true), 30)
        }, 150) // Wait for fade out
      } else if (!displayedHover) {
        // No current project - set and fade in after delay
        setDisplayedHover(hoveredProject)
        setDisplayedHoverIndex(hoveredProjectIndex)
        fadeInTimer = setTimeout(() => {
          setIsHoverVisible(true)
        }, 200) // 0.2s delay for initial hover
      }
    } else {
      // No hover - fade out
      setIsHoverVisible(false)
      fadeInTimer = setTimeout(() => {
        setDisplayedHover(null)
        setDisplayedHoverIndex(-1)
      }, 150) // Clear after fade out
    }

    return () => clearTimeout(fadeInTimer)
  }, [hoveredProject, hoveredProjectIndex])

  // Handle gallery info transitions when image changes
  useEffect(() => {
    if (!isGalleryMode) {
      setIsGalleryInfoVisible(false)
      return
    }

    // Fade out, change, fade in
    setIsGalleryInfoVisible(false)
    const timer = setTimeout(() => {
      setDisplayedImageInfo(currentImageDescription)
      setTimeout(() => setIsGalleryInfoVisible(true), 50)
    }, 150)

    return () => clearTimeout(timer)
  }, [currentImageIndex, currentImageDescription, isGalleryMode])

  // Grey style for hover info
  const hoverInfoStyle = {
    color: 'rgba(0, 0, 0, 0.4)',
    opacity: isHoverVisible ? 1 : 0,
    transition: 'opacity 0.15s ease'
  }

  // Grey style for gallery info
  const galleryInfoStyle = {
    color: 'rgba(0, 0, 0, 0.4)',
    opacity: isGalleryInfoVisible ? 1 : 0,
    transition: 'opacity 0.2s ease'
  }

  // Initialize overlay as visible on mount
  useEffect(() => {
    if (overlayRef.current) {
      gsap.set(overlayRef.current, { opacity: 1 })
    }
  }, [])

  // Handle GSAP animations based on state changes
  useEffect(() => {
    if (!overlayRef.current) return

    if (isTransitioning) {
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
  }, [isTransitioning, isPostTransition, isReturningToSlider, isSliderAnimationComplete])

  return (
    <div
      ref={overlayRef}
      className={`ui-overlay ${isTransitioning ? 'transitioning' : ''} ${isPostTransition ? 'post-transition' : ''} ${isReturningToSlider ? 'returning-to-slider' : ''}`}
    >

      {isMobile ? (
        // Mobile UI - Simplified layout
        <>
          {/* Top Left: Back (in gallery) or Client (in index) */}
          <div className="ui-corner ui-top-left">
            {isGalleryMode ? (
              <span className="ui-text ui-clickable" onClick={onBackToSlider}>back</span>
            ) : (
              <span className="ui-text">
                client<span style={hoverInfoStyle}>: {displayedHover?.client || ''}</span>
              </span>
            )}
          </div>

          {/* Top Right: contact or index */}
          <div className="ui-corner ui-top-right">
            {isGalleryMode ? (
              <span className="ui-text">{photoCounter}</span>
            ) : (
              <span className="ui-text ui-clickable">contact</span>
            )}
          </div>

          {/* Top Center: Client name in gallery mode */}
          {isGalleryMode && (
            <div style={{ position: 'absolute', top: '4px', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
              <span className="ui-text">{selectedProject?.client || ''}</span>
            </div>
          )}

          {/* Bottom Left: lioni */}
          <div className="ui-corner ui-bottom-left">
            <span
              className="ui-text"
              onClick={isPostTransition ? onBackToSlider : undefined}
              style={{ cursor: isPostTransition ? 'pointer' : 'default' }}
            >lioni</span>
          </div>

          {/* Bottom Right: Year (only on hover) or info in gallery */}
          <div className="ui-corner ui-bottom-right">
            {isGalleryMode ? (
              <span className="ui-text" style={galleryInfoStyle}>
                {displayedImageInfo}
              </span>
            ) : (
              <span className="ui-text" style={hoverInfoStyle}>
                {displayedHover?.year || ''}
              </span>
            )}
          </div>
        </>
      ) : (
        // Desktop UI - Full layout
        <>
          {/* Top Left: Back (in gallery) or Walters Studio (in index) + Client + Photo Counter/Index */}
          <div className="ui-corner ui-top-left" style={{ display: 'flex', alignItems: 'flex-start', width: 'calc(100vw - 24px)' }}>
            {isGalleryMode ? (
              <span className="ui-text ui-clickable" onClick={onBackToSlider}>back</span>
            ) : (
              <span className="ui-text">walters studio</span>
            )}

            {/* Client section */}
            <span className="ui-text" style={{ position: 'absolute', left: '25vw' }}>
              {isGalleryMode && selectedProject ? selectedProject.client : (
                <>client<span style={hoverInfoStyle}>: {displayedHover?.client || ''}</span></>
              )}
            </span>

            {/* Project type - only in gallery mode */}
            {isGalleryMode && selectedProject && (
              <span className="ui-text" style={{ position: 'absolute', left: '68vw' }}>
                {selectedProject.info}
              </span>
            )}

            {/* Index section - only in gallery mode */}
            {isGalleryMode && (
              <span className="ui-text" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
                {photoCounter}
              </span>
            )}
          </div>

          {/* Top Right: About */}
          <div className="ui-corner ui-top-right">
            <span className="ui-text ui-clickable">contact</span>
          </div>

          {/* Bottom Left: lioni */}
          <div className="ui-corner ui-bottom-left">
            <span
              className="ui-text"
              onClick={isPostTransition ? onBackToSlider : undefined}
              style={{ cursor: isPostTransition ? 'pointer' : 'default' }}
            >lioni</span>
          </div>

          {/* Bottom Center: Year (only on hover in index mode) */}
          <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
            <span className="ui-text" style={hoverInfoStyle}>
              {!isGalleryMode ? (displayedHover?.year || '') : ''}
            </span>
          </div>

          {/* Bottom at client position: Information */}
          <div style={{ position: 'absolute', bottom: '12px', left: '25vw', pointerEvents: 'auto' }}>
            <span className="ui-text">
              {isGalleryMode ? (
                <>about<span style={galleryInfoStyle}>: {displayedImageInfo}</span></>
              ) : (
                <>about<span style={hoverInfoStyle}>: {displayedHover?.info || ''}</span></>
              )}
            </span>
          </div>

          {/* Bottom Right: All Rights Reserved */}
          <div className="ui-corner ui-bottom-right">
            <span className="ui-text">All Rights Reserved</span>
          </div>
        </>
      )}
    </div>
  )
}

export default React.memo(UIOverlay)
