import * as THREE from 'three'
import { useMemo, useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import gsap from 'gsap'
import {
    simulationFragmentShader,
    petalVertexPars,
    standardBeginNormalChunk,
    standardBeginVertexChunk,
    depthBeginVertexChunk,
    petalFragmentPars,
    petalDiffuseChunk
} from './blossomShaders.js'

// GPGPU petal cloud that blossoms around the cursor.
// Petals respawn on a sphere around the pointer while it moves and
// drift apart into a slow curl-noise cloud when it rests.

const DEFAULT_COLORS = ['#e2acff', '#9c6fd2', '#da9cf8', '#ca7ddb']

// Curved petal built on a (u,v) grid. All variants share segment counts so
// they can live as attribute sets on one geometry.
function createPetalGeometry({ length = 1, width = 0.55, curl = 0.3, cup = 0.3, twist = 0, skew = 0 }) {
    const segU = 8
    const segV = 12
    const positions = []
    const uvs = []
    const indices = []

    for (let iv = 0; iv <= segV; iv++) {
        const t = iv / segV // 0 = base, 1 = tip
        const w = width * Math.sin(Math.PI * Math.pow(t, 0.72)) // petal outline
        for (let iu = 0; iu <= segU; iu++) {
            const s = iu / segU - 0.5
            const x = s * w + skew * Math.sin(Math.PI * t) // skew bends the midline for asymmetry
            const y = (t - 0.5) * length
            const z =
                Math.sin(t * Math.PI * 0.5) * curl * t + // bend back toward the tip
                s * s * cup * (0.3 + t) + // cup across the width
                s * t * twist // slight twist
            positions.push(x, y, z)
            uvs.push(iu / segU, t)
        }
    }

    const stride = segU + 1
    for (let iv = 0; iv < segV; iv++) {
        for (let iu = 0; iu < segU; iu++) {
            const a = iv * stride + iu
            const b = a + 1
            const c = a + stride
            const d = c + 1
            indices.push(a, c, b, b, c, d)
        }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
}

// Red channel drives brightness on top of the palette color:
// dark base -> light tip, with a soft central vein.
function createPetalTexture() {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')

    const gradient = ctx.createLinearGradient(0, size, 0, 0)
    gradient.addColorStop(0, 'rgb(58, 42, 70)')
    gradient.addColorStop(0.45, 'rgb(128, 104, 138)')
    gradient.addColorStop(1, 'rgb(232, 222, 240)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)

    // darker central vein
    const vein = ctx.createLinearGradient(0, 0, size, 0)
    vein.addColorStop(0, 'rgba(0, 0, 0, 0)')
    vein.addColorStop(0.5, 'rgba(30, 18, 38, 0.22)')
    vein.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = vein
    ctx.fillRect(0, 0, size, size)

    // soft highlight blob toward the tip
    const glow = ctx.createRadialGradient(size * 0.5, size * 0.2, size * 0.05, size * 0.5, size * 0.25, size * 0.5)
    glow.addColorStop(0, 'rgba(255, 250, 255, 0.5)')
    glow.addColorStop(1, 'rgba(255, 250, 255, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, size, size)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

export default function BlossomPetals({
    quality = 'high', // 'high' | 'low' — low halves the particle count for weaker GPUs
    textureSize, // override the sim resolution directly (petal count = textureSize²)
    size = 0.55, // base petal scale (world units)
    colors = DEFAULT_COLORS,
    envMapIntensity = 0.19, // sheen from scene.environment, if one is set
    rotationSpeed = 1,
    curlSize = 0.6,
    curlSpeed = 0.3,
    lerpSpeed = 0.006,
    attraction = 2,
    pointerLerp = 0.2,
    movingRadius = 0.03,
    idleRadius = 0.3,
    movingDieSpeed = 0.015,
    idleDieSpeed = 0.0025,
    paused = false
}) {
    const { gl, camera } = useThree()

    const simSize = textureSize ?? (quality === 'low' ? 48 : 64)
    const count = simSize * simSize

    const isMoving = useRef(true)
    const moveTimeout = useRef(null)
    const hasEntered = useRef(false)
    const pointerSmooth = useRef(new THREE.Vector2())
    const mouseWorld = useRef(new THREE.Vector3())
    const prevMouseWorld = useRef(new THREE.Vector3())

    // Users who ask the OS for less motion get a calm, slowly drifting cloud
    // instead of the busy cursor-chasing swarm.
    const prefersReducedMotion = useMemo(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        []
    )
    const motionScale = prefersReducedMotion ? 0.25 : 1

    const petalTexture = useMemo(() => createPetalTexture(), [])

    const { geometry, materialUniforms } = useMemo(() => {
        const variants = [
            createPetalGeometry({ curl: 0.3, cup: 0.3, skew: 0.06 }),
            createPetalGeometry({ length: 1.08, width: 0.45, curl: 0.55, cup: 0.15, twist: 0.3, skew: -0.08 }),
            createPetalGeometry({ length: 0.88, width: 0.68, curl: 0.16, cup: 0.5, twist: -0.18, skew: 0.1 })
        ]

        const geometry = new THREE.InstancedBufferGeometry()
        geometry.index = variants[0].index
        geometry.setAttribute('position', variants[0].getAttribute('position'))
        geometry.setAttribute('normal', variants[0].getAttribute('normal'))
        geometry.setAttribute('uv', variants[0].getAttribute('uv'))
        geometry.setAttribute('position2', variants[1].getAttribute('position'))
        geometry.setAttribute('normal2', variants[1].getAttribute('normal'))
        geometry.setAttribute('position3', variants[2].getAttribute('position'))
        geometry.setAttribute('normal3', variants[2].getAttribute('normal'))

        const aIndex = new Float32Array(count)
        const aColor = new Float32Array(count)
        const aReference = new Float32Array(count * 2)
        const aRandom = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) {
            aIndex[i] = Math.floor(Math.random() * 3) + 1
            aColor[i] = Math.random()
            aReference[i * 2 + 0] = ((i % simSize) + 0.5) / simSize
            aReference[i * 2 + 1] = (Math.floor(i / simSize) + 0.5) / simSize
            aRandom[i * 3 + 0] = Math.random()
            aRandom[i * 3 + 1] = Math.random()
            aRandom[i * 3 + 2] = THREE.MathUtils.randFloat(0.8, 1.2)
        }
        geometry.setAttribute('aIndex', new THREE.InstancedBufferAttribute(aIndex, 1))
        geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 1))
        geometry.setAttribute('aReference', new THREE.InstancedBufferAttribute(aReference, 2))
        geometry.setAttribute('aRandom', new THREE.InstancedBufferAttribute(aRandom, 3))
        geometry.instanceCount = count
        geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100)

        const materialUniforms = {
            tPosition: { value: null },
            tPetal: { value: petalTexture },
            uParticleSize: { value: 0 },
            uTime: { value: 0 },
            uLifespan: { value: new THREE.Vector2(0.5, 0.9) },
            uRotBase: { value: new THREE.Vector3(90, 0, 0) },
            uRotSpeed: { value: rotationSpeed },
            uColor1: { value: new THREE.Color(colors[0]) },
            uColor2: { value: new THREE.Color(colors[1]) },
            uColor3: { value: new THREE.Color(colors[2]) },
            uColor4: { value: new THREE.Color(colors[3]) }
        }

        return { geometry, materialUniforms }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [simSize])

    const material = useMemo(() => {
        const material = new THREE.MeshStandardMaterial({
            roughness: 0.65,
            metalness: 0,
            envMapIntensity,
            side: THREE.DoubleSide
        })
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, materialUniforms)
            shader.vertexShader = petalVertexPars + shader.vertexShader
            shader.vertexShader = shader.vertexShader
                .replace('#include <beginnormal_vertex>', standardBeginNormalChunk)
                .replace('#include <begin_vertex>', standardBeginVertexChunk)
            shader.fragmentShader = petalFragmentPars + shader.fragmentShader
            shader.fragmentShader = shader.fragmentShader.replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                petalDiffuseChunk
            )
        }
        return material
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [materialUniforms])

    const depthMaterial = useMemo(() => {
        const material = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            side: THREE.DoubleSide
        })
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, materialUniforms)
            shader.vertexShader = petalVertexPars + shader.vertexShader
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', depthBeginVertexChunk)
        }
        return material
    }, [materialUniforms])

    // --- GPGPU position simulation ---
    const sim = useMemo(() => {
        const gpu = new GPUComputationRenderer(simSize, simSize, gl)

        const positionTexture = gpu.createTexture()
        const data = positionTexture.image.data
        for (let i = 0; i < count; i++) {
            // home position on a spherical shell, scaled by uRadius at respawn
            const radius = (0.5 + Math.random() * 0.5) * 50
            const phi = (Math.random() - 0.5) * Math.PI
            const theta = Math.random() * Math.PI * 2
            data[i * 4 + 0] = radius * Math.cos(theta) * Math.cos(phi)
            data[i * 4 + 1] = radius * Math.sin(phi)
            data[i * 4 + 2] = radius * Math.sin(theta) * Math.cos(phi)
            data[i * 4 + 3] = Math.random() // staggered life
        }
        const homeTexture = positionTexture.clone()

        const variable = gpu.addVariable('tPosition', simulationFragmentShader, positionTexture)
        gpu.setVariableDependencies(variable, [variable])

        Object.assign(variable.material.uniforms, {
            uTime: { value: 0 },
            uDieSpeed: { value: 0.015 },
            uAttraction: { value: attraction },
            uNormDelta: { value: 1 },
            uRadius: { value: movingRadius },
            uCurlSize: { value: curlSize },
            uCurlSpeed: { value: curlSpeed },
            uLerpSpeed: { value: lerpSpeed },
            uMouseRadius: { value: 0.9 },
            uMouse: { value: new THREE.Vector3() },
            uPrevMouse: { value: new THREE.Vector3() },
            uForce: { value: new THREE.Vector3() },
            uMouseVelocity: { value: new THREE.Vector3() },
            tHome: { value: homeTexture }
        })

        const error = gpu.init()
        if (error !== null) console.error(error)

        return { gpu, variable, homeTexture }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [simSize, gl])

    // --- Reactive props: keep uniforms in sync when props change at runtime ---

    // First run plays the slow enter animation; later size changes tween quickly.
    useEffect(() => {
        const tween = gsap.to(materialUniforms.uParticleSize, {
            value: size,
            duration: hasEntered.current ? 0.8 : 2.4,
            ease: hasEntered.current ? 'power2.out' : 'power2.inOut',
            onComplete: () => {
                hasEntered.current = true
            }
        })
        return () => tween.kill()
    }, [size, materialUniforms])

    useEffect(() => {
        materialUniforms.uColor1.value.set(colors[0])
        materialUniforms.uColor2.value.set(colors[1])
        materialUniforms.uColor3.value.set(colors[2])
        materialUniforms.uColor4.value.set(colors[3])
    }, [colors, materialUniforms])

    useEffect(() => {
        materialUniforms.uRotSpeed.value = rotationSpeed * motionScale
    }, [rotationSpeed, motionScale, materialUniforms])

    useEffect(() => {
        material.envMapIntensity = envMapIntensity
    }, [envMapIntensity, material])

    useEffect(() => {
        const uniforms = sim.variable.material.uniforms
        uniforms.uAttraction.value = attraction
        uniforms.uCurlSize.value = curlSize
        uniforms.uCurlSpeed.value = curlSpeed * motionScale
        uniforms.uLerpSpeed.value = lerpSpeed
    }, [attraction, curlSize, curlSpeed, lerpSpeed, motionScale, sim])

    // Pointer movement drives the moving/idle state
    useEffect(() => {
        const onPointerMove = () => {
            isMoving.current = true
            if (moveTimeout.current) clearTimeout(moveTimeout.current)
            moveTimeout.current = setTimeout(() => {
                isMoving.current = false
            }, 1500)
        }
        window.addEventListener('pointermove', onPointerMove)
        onPointerMove()

        return () => {
            window.removeEventListener('pointermove', onPointerMove)
            if (moveTimeout.current) clearTimeout(moveTimeout.current)
        }
    }, [])

    useEffect(() => {
        return () => {
            sim.gpu.dispose()
            sim.homeTexture.dispose()
            geometry.dispose()
            material.dispose()
            depthMaterial.dispose()
            petalTexture.dispose()
        }
    }, [sim, geometry, material, depthMaterial, petalTexture])

    const rayDir = useMemo(() => new THREE.Vector3(), [])
    const planePoint = useMemo(() => new THREE.Vector3(), [])

    useFrame((state, delta) => {
        // Always expose the latest sim texture, even while paused, so the
        // petals stay visible in their last state.
        const positionTexture = sim.gpu.getCurrentRenderTarget(sim.variable).texture
        materialUniforms.tPosition.value = positionTexture

        if (paused) return

        const uniforms = sim.variable.material.uniforms
        const normDelta = Math.min(delta, 1 / 20) * 60
        const moving = prefersReducedMotion ? false : isMoving.current

        // moving: tight burst at the cursor / idle: wide slow cloud
        uniforms.uRadius.value = THREE.MathUtils.lerp(
            uniforms.uRadius.value,
            moving ? movingRadius : idleRadius,
            0.1
        )
        uniforms.uDieSpeed.value = THREE.MathUtils.lerp(
            uniforms.uDieSpeed.value,
            moving ? movingDieSpeed : idleDieSpeed,
            0.05
        )

        // smooth pointer, then project onto the z=0 plane
        pointerSmooth.current.lerp(state.pointer, Math.min(1, pointerLerp * normDelta))
        planePoint.set(pointerSmooth.current.x, pointerSmooth.current.y, 0.5).unproject(camera)
        rayDir.copy(planePoint).sub(camera.position).normalize()
        const t = -camera.position.z / rayDir.z
        mouseWorld.current.copy(camera.position).addScaledVector(rayDir, t)

        uniforms.uPrevMouse.value.copy(prevMouseWorld.current)
        uniforms.uMouse.value.copy(mouseWorld.current)
        uniforms.uForce.value.copy(mouseWorld.current).sub(prevMouseWorld.current)
        uniforms.uMouseVelocity.value.copy(mouseWorld.current).sub(prevMouseWorld.current).divideScalar(16)
        prevMouseWorld.current.copy(mouseWorld.current)

        uniforms.uTime.value = state.clock.elapsedTime
        uniforms.uNormDelta.value = normDelta

        sim.gpu.compute()

        materialUniforms.tPosition.value = sim.gpu.getCurrentRenderTarget(sim.variable).texture
        materialUniforms.uTime.value = state.clock.elapsedTime
    })

    return (
        <mesh
            geometry={geometry}
            material={material}
            customDepthMaterial={depthMaterial}
            castShadow
            receiveShadow
            frustumCulled={false}
        />
    )
}
