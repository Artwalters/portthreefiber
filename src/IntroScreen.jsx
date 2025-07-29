import { useState, useEffect } from 'react'

export default function IntroScreen({ onComplete }) {
  const [textVisible, setTextVisible] = useState(false)
  const [textFadingOut, setTextFadingOut] = useState(false)
  const [backgroundFadingOut, setBackgroundFadingOut] = useState(false)

  // Start text fade-in after component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setTextVisible(true)
    }, 500) // Short delay before text appears
    
    return () => clearTimeout(timer)
  }, [])

  // Handle click to start exit animation
  const handleClick = () => {
    if (textFadingOut || backgroundFadingOut) return // Prevent double-click
    
    // Start text fade-out
    setTextFadingOut(true)
    
    // After text fades out, fade background and complete
    setTimeout(() => {
      setBackgroundFadingOut(true)
      
      // Start slider animation during background fade
      onComplete()
      
    }, 800) // 0.8 seconds for text fade-out
  }

  return (
    <div 
      className={`intro-screen ${backgroundFadingOut ? 'background-fading' : ''}`}
      onClick={handleClick}
    >
      {/* Logo at top */}
      <div className={`intro-logo ${textVisible && !textFadingOut ? 'visible' : ''} ${textFadingOut ? 'fading-out' : ''}`}>
        <img 
          src="./img/logo/walters_logo.svg" 
          alt="Walters Studio" 
          className="intro-logo-img"
        />
      </div>

      {/* Main content in center */}
      <div className={`intro-content ${textVisible && !textFadingOut ? 'visible' : ''} ${textFadingOut ? 'fading-out' : ''}`}>
        <h1 className="intro-title">WALTERS STUDIO®</h1>
        <p className="intro-description">
          A forward-thinking brand, digital and motion studio that specializes in crafting refreshingly unexpected ideas and striking visuals. We believe in the power of creative disruption - helping bold brands cut through the overwhelming noise of today's saturated marketplace.
        </p>
      </div>

      {/* Press to continue at bottom */}
      <div className={`intro-footer ${textVisible && !textFadingOut ? 'visible' : ''} ${textFadingOut ? 'fading-out' : ''}`}>
        <span>press to continue</span>
      </div>
    </div>
  )
}