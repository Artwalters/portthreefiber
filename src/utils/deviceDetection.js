// Mobile device detection utility
export const isMobileDevice = () => {
    // Check for touch support
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    
    // Check user agent for mobile indicators
    const mobileRegex = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
    const isMobileUA = mobileRegex.test(navigator.userAgent)
    
    // Check screen size (mobile-typical sizes)
    const isSmallScreen = window.innerWidth <= 768
    
    // Check for mobile-specific features
    const isMobileOrientation = typeof window.orientation !== 'undefined'
    
    // Combine checks - if any mobile indicator is true, treat as mobile
    return hasTouch || isMobileUA || (isSmallScreen && isMobileOrientation)
}

// Check if device supports float textures (for desktop water shader)
export const supportsFloatTextures = () => {
    try {
        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
        
        if (!gl) return false
        
        // Check for float texture extensions
        const floatExt = gl.getExtension('OES_texture_float')
        const floatRenderExt = gl.getExtension('WEBGL_color_buffer_float') || 
                              gl.getExtension('EXT_color_buffer_float')
        
        return !!(floatExt && floatRenderExt)
    } catch (error) {
        console.warn('Float texture support check failed:', error)
        return false
    }
}

// Comprehensive device capability check
export const getDeviceCapabilities = () => {
    const isMobile = isMobileDevice()
    const hasFloatTextures = supportsFloatTextures()
    
    return {
        isMobile,
        hasFloatTextures,
        // Recommended water shader based on capabilities
        shouldUseMobileWater: isMobile || !hasFloatTextures,
        // Performance tier for optimization
        performanceTier: isMobile ? 'mobile' : 'desktop'
    }
}