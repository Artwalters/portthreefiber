export default function UIOverlay({ highlightedProject, isHighlightVisible, displayedProject, isVisible, projects }) {
  return (
    <div className="ui-overlay">
      {/* Top Section */}
      <div className="ui-top">
        <div className="ui-top-left">
          walters studio
        </div>
        <div className="ui-top-center">
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
        </div>
        <div className="ui-top-right">
          2025
        </div>
      </div>

      {/* Bottom Section */}
      <div className="ui-bottom">
        <div className="ui-bottom-left">
          <div className="creative-section">
            <span>creative studio</span>
            {displayedProject && (
              <span className={`project-description ${isVisible ? 'visible' : ''}`}>
                {displayedProject.description}
              </span>
            )}
          </div>
        </div>
        <div className="ui-bottom-center">
          about
        </div>
        <div className="ui-bottom-right">
          all rights reserved
        </div>
      </div>
    </div>
  )
}