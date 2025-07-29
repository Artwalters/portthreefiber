export default function UIOverlay({ highlightedProject, isHighlightVisible, displayedProject, isVisible, projects, isPostTransition, isTransitioning, isReturningToSlider, selectedProject, currentImageIndex, onBackToSlider, uiFadingIn }) {
  // Get current image data for selected project
  const currentImage = selectedProject && selectedProject.images && selectedProject.images[currentImageIndex] 
    ? selectedProject.images[currentImageIndex] 
    : null
  const totalImages = selectedProject && selectedProject.images ? selectedProject.images.length : 0
  return (
    <div className={`ui-overlay ${isTransitioning ? 'transitioning' : ''} ${isPostTransition ? 'post-transition' : ''} ${isReturningToSlider ? 'returning-to-slider' : ''} ${uiFadingIn ? 'fading-in' : 'initial-hidden'}`}>
      {/* Top Section */}
      <div className="ui-top">
        <div className="ui-top-left">
          {isPostTransition ? (
            <span 
              className="back-button"
              onClick={onBackToSlider}
            >
              back
            </span>
          ) : (
            <span className="studio-button">walters studio</span>
          )}
        </div>
        <div className="ui-top-center">
          {isPostTransition ? (
            <div className="photo-counter">
              {totalImages > 0 ? `${currentImageIndex + 1}/${totalImages}` : '1/1'}
            </div>
          ) : (
            <div className="index-section">
              <div className="index-title">index</div>
              <div className="project-list">
                {projects.map((project, index) => (
                  <div 
                    key={project.name}
                    className={`project-name ${highlightedProject && highlightedProject.name === project.name && isHighlightVisible ? 'highlighted' : ''}`}
                  >
                    {project.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="ui-top-right">
          <span className="about-button">about</span>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="ui-bottom">
        <div className="ui-bottom-left">
          <img 
            src="./img/logo/walters_logo.svg" 
            alt="Walters Studio" 
            className="walters-logo" 
            onClick={isPostTransition ? onBackToSlider : undefined}
            style={{ cursor: isPostTransition ? 'pointer' : 'default' }}
          />
        </div>
        <div className="ui-bottom-center">
          {isPostTransition && currentImage ? (
            <span className="image-description">
              {currentImage.description}
            </span>
          ) : (
            displayedProject && (
              <span className={`project-description ${isVisible ? 'visible' : ''}`}>
                {displayedProject.description}
              </span>
            )
          )}
        </div>
        <div className="ui-bottom-right">
          all rights reserved
        </div>
      </div>
    </div>
  )
}