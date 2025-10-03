import React, { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Custom shader material for single image
const createIntroMaterial = (texture, isMobile = false) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      uTexture: { value: texture || new THREE.Texture() },
      uIsMobile: { value: isMobile ? 1.0 : 0.0 }
    },
    vertexShader: `
      uniform float uIsMobile;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform sampler2D uTexture;
      uniform float uIsMobile;
      varying vec2 vUv;

      void main() {
        float imageWidth = 0.103;

        float scrollOffset = time * 0.01;
        float centerX = 0.5 + scrollOffset;

        float leftEdge = centerX - imageWidth * 0.5;
        float rightEdge = centerX + imageWidth * 0.5;

        if (vUv.x < leftEdge || vUv.x > rightEdge) {
          discard;
        }

        vec2 tileUV;
        tileUV.x = (vUv.x - leftEdge) / imageWidth;
        tileUV.y = vUv.y;

        if (uIsMobile > 0.5) {
          vec2 center = vec2(0.5, 0.5);
          tileUV -= center;
          tileUV = vec2(tileUV.y, tileUV.x);
          tileUV += center;
        }

        vec4 tileColor = texture2D(uTexture, tileUV);

        gl_FragColor = vec4(tileColor.rgb, tileColor.a);
        gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(1.0/2.2));
      }
    `,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    depthTest: true
  })

  material.updateTime = function(time) {
    this.uniforms.time.value = time
  }

  material.updateTexture = function(texture) {
    if (texture) {
      this.uniforms.uTexture.value = texture
    }
  }

  return material
}

const IntroScene = ({ waterRef }) => {
  const meshRef = useRef()
  const [texture, setTexture] = useState(null)
  const { gl } = useThree()

  const [isMobile, setIsMobile] = useState(false)
  const [allImages, setAllImages] = useState([])
  const currentImageIndex = useRef(0)
  const currentOffset = useRef(0)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Load all project images
  useEffect(() => {
    fetch('./data/projects.json')
      .then(response => response.json())
      .then(data => {
        const images = []
        data.projects.forEach(project => {
          if (project.images) {
            project.images.forEach(img => {
              images.push(img.src)
            })
          }
        })
        setAllImages(images)
      })
      .catch(error => {
        console.error('Failed to load projects:', error)
      })
  }, [])

  // Flicker through images rapidly
  useEffect(() => {
    if (allImages.length === 0) return

    const loader = new THREE.TextureLoader()

    const loadNextImage = () => {
      const imgSrc = allImages[currentImageIndex.current]

      loader.load(
        imgSrc,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.generateMipmaps = isMobile ? false : true
          tex.wrapS = THREE.ClampToEdgeWrapping
          tex.wrapT = THREE.ClampToEdgeWrapping
          tex.minFilter = isMobile ? THREE.NearestFilter : THREE.LinearFilter
          tex.magFilter = THREE.LinearFilter
          tex.anisotropy = Math.min(isMobile ? 4 : 8, gl.capabilities.getMaxAnisotropy())
          tex.needsUpdate = true
          setTexture(tex)
        }
      )

      currentImageIndex.current = (currentImageIndex.current + 1) % allImages.length
    }

    // Load first image immediately
    loadNextImage()

    // Flicker interval - change image every 500ms
    const interval = setInterval(loadNextImage, 500)

    return () => clearInterval(interval)
  }, [allImages, isMobile, gl])

  // Create curved geometry
  const geometry = useMemo(() => {
    const splineSegments = isMobile ? 100 : 150
    const filmWidth = isMobile ? 3.2 : 3.2

    let curve
    if (isMobile) {
      const mobileCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-12, 0, -7.0),
        new THREE.Vector3(-8, 0, -4.0),
        new THREE.Vector3(-4, 0, -0.2),
        new THREE.Vector3(0, 0, 0.2),
        new THREE.Vector3(4, 0, -0.2),
        new THREE.Vector3(8, 0, -4.0),
        new THREE.Vector3(12, 0, -7.0)
      ], false, "catmullrom", 0.5)

      const rotatedPoints = mobileCurve.points.map(point =>
        new THREE.Vector3(0, point.x, point.z + 0.8)
      )
      curve = new THREE.CatmullRomCurve3(rotatedPoints, false, "catmullrom", 0.5)
    } else {
      curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3, 0, -10.0),
        new THREE.Vector3(-2, 0, -7.0),
        new THREE.Vector3(-6, 0, -4.0),
        new THREE.Vector3(-3.5, 0, 0.4),
        new THREE.Vector3(0, 0, 1.4),
        new THREE.Vector3(3.5, 0, 0.4),
        new THREE.Vector3(6, 0, -4.0),
        new THREE.Vector3(2, 0, -7.0),
        new THREE.Vector3(3, 0, -10.0)
      ], false, "catmullrom", 0.5)
    }

    const curvePoints = curve.getSpacedPoints(splineSegments)

    const geo = new THREE.PlaneGeometry(1, 1, splineSegments, 16)
      .translate(0.5, 0, 0)
      .scale(splineSegments, 1, 1)

    const positions = geo.attributes.position
    const vertex = new THREE.Vector3()

    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i)
      const idx = Math.round(vertex.x)
      const curvePoint = curvePoints[idx]

      if (curvePoint) {
        if (isMobile) {
          positions.setXYZ(
            i,
            curvePoint.x + vertex.y * filmWidth,
            curvePoint.y,
            curvePoint.z
          )
        } else {
          positions.setXYZ(
            i,
            curvePoint.x,
            curvePoint.y + vertex.y * filmWidth,
            curvePoint.z
          )
        }
      }
    }

    geo.computeVertexNormals()
    return geo
  }, [isMobile])

  // Create material
  const material = useMemo(() => {
    const mat = createIntroMaterial(null, isMobile)
    return mat
  }, [isMobile])

  // Update texture when it changes
  useEffect(() => {
    if (material && texture) {
      material.updateTexture(texture)
    }
  }, [texture, material])

  // Animation loop - just update time for positioning
  useFrame(() => {
    if (material) {
      material.updateTime(currentOffset.current)
    }
  })

  if (!material) return null

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
    />
  )
}

export default IntroScene
