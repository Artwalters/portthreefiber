import * as THREE from 'three'
import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import BlossomPetals from './BlossomPetals.jsx'
import BlossomColorGrade from './BlossomColorGrade.jsx'
import { isMobileDevice } from '../../utils/deviceDetection.js'
import '../../styles/blossom.css'

// Standalone demo page for the blossom hover effect: ?template=blossom

export default function BlossomTemplate() {
    // Lower tier: half the petals, smaller/cheaper shadows, capped pixel ratio
    const lowTier = useMemo(() => isMobileDevice(), [])
    const shadowMapSize = lowTier ? 1024 : 2048

    return (
        <div className="blossom-page">
            <Canvas
                shadows={{ type: THREE.VSMShadowMap }}
                camera={{ position: [0, 0, 20], fov: 40 }}
                dpr={lowTier ? [1, 1.5] : [1, 2]}
                gl={{
                    antialias: true,
                    powerPreference: 'high-performance',
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.1,
                    outputColorSpace: THREE.SRGBColorSpace
                }}
                onCreated={({ gl }) => {
                    gl.setClearColor('#C7BBC6')
                }}
            >
                <ambientLight color="#786080" intensity={0.78} />
                <directionalLight
                    color="#fff5df"
                    intensity={3.9}
                    position={[-3.2, 8.7, 12.8]}
                    castShadow
                    shadow-mapSize-width={shadowMapSize}
                    shadow-mapSize-height={shadowMapSize}
                    shadow-radius={10}
                    shadow-blurSamples={lowTier ? 3 : 8}
                    shadow-bias={-0.0002}
                    shadow-camera-near={1}
                    shadow-camera-far={50}
                    shadow-camera-top={12}
                    shadow-camera-bottom={-12}
                    shadow-camera-left={-12}
                    shadow-camera-right={12}
                />

                {/* Self-contained environment map: gives the petals a subtle
                    silky sheen (envMapIntensity 0.19) without loading assets */}
                <Environment resolution={64} frames={1}>
                    <color attach="background" args={['#9c8aa0']} />
                    <Lightformer intensity={2} color="#fff5df" position={[-3, 5, 5]} scale={[6, 6, 1]} />
                    <Lightformer intensity={0.8} color="#e8dff0" position={[4, -2, 3]} scale={[8, 4, 1]} />
                </Environment>

                <BlossomPetals quality={lowTier ? 'low' : 'high'} />

                <BlossomColorGrade intensity={0.4} />
            </Canvas>

            <div className="blossom-ui">
                <p className="blossom-ui__intro">
                    Move your cursor — petals blossom along its path and drift
                    apart when it rests.
                </p>
                <div className="blossom-ui__card">
                    <span className="blossom-ui__label">Fragrance selector</span>
                    <span className="blossom-ui__product">Atelier des Fleurs — Lavanda</span>
                </div>
            </div>
        </div>
    )
}
