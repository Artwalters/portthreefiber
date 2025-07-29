export default function UIOverlay({ highlightedProject, isHighlightVisible, displayedProject, isVisible, projects, isPostTransition, isTransitioning, isReturningToSlider, selectedProject, currentImageIndex, onBackToSlider }) {
  // Calculate total number of images for selected project
  const totalImages = selectedProject && selectedProject.images ? selectedProject.images.length : 0
  return (
    <div className={`ui-overlay ${isTransitioning ? 'transitioning' : ''} ${isPostTransition ? 'post-transition' : ''} ${isReturningToSlider ? 'returning-to-slider' : ''}`}>
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
            'walters studio'
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
          about
        </div>
      </div>

      {/* Bottom Section */}
      <div className="ui-bottom">
        <div className="ui-bottom-left">
          creative studio
        </div>
        <div className="ui-bottom-center">
          {displayedProject && (
            <span className={`project-description ${isVisible ? 'visible' : ''}`}>
              {displayedProject.description}
            </span>
          )}
        </div>
        <div className="ui-bottom-right">
          all rights reserved
        </div>
      </div>
    </div>
  )
}