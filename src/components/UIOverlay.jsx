import React from 'react'

function UIOverlay({ isTransitioning, isPostTransition, isReturningToSlider, onBackToSlider, selectedProject, currentImageIndex }) {
  // Check if we're in gallery mode
  const isGalleryMode = isPostTransition && selectedProject
  
  // Calculate photo counter
  const totalImages = selectedProject?.images?.length || 0
  const photoCounter = isGalleryMode ? `${currentImageIndex + 1}/${totalImages}` : 'index'
  
  return (
    <div className={`ui-overlay ${isTransitioning ? 'transitioning' : ''} ${isPostTransition ? 'post-transition' : ''} ${isReturningToSlider ? 'returning-to-slider' : ''}`}>
      {/* Top Left: Back (in gallery) or Walters Studio (in index) + Client + Photo Counter/Index */}
      <div className="ui-corner ui-top-left" style={{ display: 'flex', alignItems: 'center', width: 'calc(100vw - 24px)' }}>
        {isGalleryMode ? (
          <span className="ui-text ui-clickable" onClick={onBackToSlider}>back</span>
        ) : (
          <span className="ui-text">walters studio</span>
        )}
        <span className="ui-text" style={{ position: 'absolute', left: '25vw' }}>
          {isGalleryMode && selectedProject ? selectedProject.name : 'client'}
        </span>
        <span className="ui-text" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          {photoCounter}
        </span>
      </div>
      
      {/* Top Right: About */}
      <div className="ui-corner ui-top-right">
        <span className="ui-text ui-clickable">about</span>
      </div>
      
      {/* Bottom Left: Logo */}
      <div className="ui-corner ui-bottom-left">
        <img 
          src="./img/logo/walters_logo.png" 
          alt="Walters Studio" 
          className="walters-logo"
          onClick={isPostTransition ? onBackToSlider : undefined}
          style={{ cursor: isPostTransition ? 'pointer' : 'default' }}
        />
      </div>
      
      {/* Bottom Center: 2025 */}
      <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
        <span className="ui-text">2025</span>
      </div>
      
      {/* Bottom at client position: Information */}
      <div style={{ position: 'absolute', bottom: '12px', left: '25vw', pointerEvents: 'auto' }}>
        <span className="ui-text">information</span>
      </div>
      
      {/* Bottom Right: All Rights Reserved */}
      <div className="ui-corner ui-bottom-right">
        <span className="ui-text">All Rights Reserved</span>
      </div>
    </div>
  )
}

export default React.memo(UIOverlay)