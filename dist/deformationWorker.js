// 🚀 OPTIMIZATION 3: WebWorker for vertex deformation
self.onmessage = function(e) {
    console.log('WebWorker received message:', e.data)
    const {
        originalPositions,
        curveCache,
        curveProgress,
        time,
        boundingBox,
        length
    } = e.data

    const newPositions = new Float32Array(originalPositions.length)
    const cacheSize = curveCache.points.length

    // Snake movement parameters
    const snakeWaveFrequency = 10
    const snakeWaveAmplitude = 0.15
    const snakeWaveSpeed = 4.5

    // Process vertices in batches for better performance
    for (let i = 0; i < originalPositions.length; i += 3) {
        const originalX = originalPositions[i]
        const originalY = originalPositions[i + 1]
        const originalZ = originalPositions[i + 2]

        // Normalize Z position to curve parameter (0-1)
        const normalizedZ = (originalZ - boundingBox.min.z) / length

        // Calculate curve parameter for this vertex
        let t = (curveProgress + normalizedZ * 0.15) % 1

        // 🚀 Fast lookup instead of expensive getPointAt()
        const cacheIndex = Math.floor(t * (cacheSize - 1))
        const curvePoint = curveCache.points[cacheIndex]
        const tangent = curveCache.tangents[cacheIndex]

        // Create coordinate system (simplified)
        const normalX = 0, normalY = 1, normalZ = 0
        const binormalX = tangent.y * normalZ - tangent.z * normalY
        const binormalY = tangent.z * normalX - tangent.x * normalZ
        const binormalZ = tangent.x * normalY - tangent.y * normalX

        // Normalize binormal
        const binormalLength = Math.sqrt(binormalX * binormalX + binormalY * binormalY + binormalZ * binormalZ)
        const bX = binormalLength > 0 ? binormalX / binormalLength : 0
        const bY = binormalLength > 0 ? binormalY / binormalLength : 0
        const bZ = binormalLength > 0 ? binormalZ / binormalLength : 0

        // Snake zigzag movement
        const wavePhase = normalizedZ * snakeWaveFrequency + time * snakeWaveSpeed
        const sideOffset = Math.sin(wavePhase) * snakeWaveAmplitude

        // Amplitude variation (head subtle, body snakes more, tail still)
        const amplitudeVariation = 0.05 + 0.8 * Math.sin(normalizedZ * Math.PI)

        // Transform point to curve space
        newPositions[i] = curvePoint.x + (originalX * 0.8) * bX + (sideOffset * amplitudeVariation) * bX
        newPositions[i + 1] = curvePoint.y + (originalY * 0.8) * bY + (sideOffset * amplitudeVariation) * bY
        newPositions[i + 2] = curvePoint.z + (originalX * 0.8) * bZ + (sideOffset * amplitudeVariation) * bZ
    }

    // Send back processed positions
    console.log('WebWorker sending back processed positions')
    self.postMessage({ newPositions })
}