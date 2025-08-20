import React, { useEffect } from 'react'

export default function TestScroll() {
    useEffect(() => {
        // Force override ALL scroll-blocking CSS with !important
        const styleSheet = document.createElement('style')
        styleSheet.textContent = `
            html, body, #root {
                position: static !important;
                height: auto !important;
                overflow: visible !important;
                overflow-y: auto !important;
                top: unset !important;
                left: unset !important;
                width: auto !important;
                touch-action: auto !important;
            }
        `
        document.head.appendChild(styleSheet)
        
        return () => {
            document.head.removeChild(styleSheet)
        }
    }, [])

    return (
        <div>
            <div style={{ height: '100vh', background: 'red', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <h1>Section 1 - Should be scrollable</h1>
            </div>
            <div style={{ height: '100vh', background: 'blue', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <h1>Section 2</h1>
            </div>
            <div style={{ height: '100vh', background: 'green', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <h1>Section 3</h1>
            </div>
            <div style={{ height: '100vh', background: 'yellow', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <h1>Section 4</h1>
            </div>
        </div>
    )
}