import * as THREE from 'three'
import { useMemo, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// Subtle filmic color grade as a post-processing pass: richer saturation,
// mauve-lifted shadows, slightly warm highlights and a gentle S-curve.
// Runs in linear space; the OutputPass afterwards applies tone mapping + sRGB.

const gradeShader = {
    name: 'BlossomGradeShader',
    uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0.4 }
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float uIntensity;
        varying vec2 vUv;

        void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            vec3 color = base.rgb;
            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

            // richer saturation
            vec3 graded = mix(vec3(luma), color, 1.12);
            // lift the shadows toward mauve
            graded += vec3(0.035, 0.02, 0.045) * (1.0 - smoothstep(0.0, 0.45, luma));
            // warm the highlights slightly
            graded += vec3(0.03, 0.02, 0.0) * smoothstep(0.55, 1.0, luma);
            // gentle S-curve for contrast
            vec3 curved = graded * graded * (3.0 - 2.0 * graded);
            graded = mix(graded, curved, 0.2);

            gl_FragColor = vec4(mix(color, graded, uIntensity), base.a);
        }
    `
}

export default function BlossomColorGrade({ intensity = 0.4 }) {
    const { gl, scene, camera, size } = useThree()

    const { composer, gradePass } = useMemo(() => {
        const composer = new EffectComposer(gl)
        composer.addPass(new RenderPass(scene, camera))
        const gradePass = new ShaderPass(gradeShader)
        composer.addPass(gradePass)
        composer.addPass(new OutputPass())
        return { composer, gradePass }
    }, [gl, scene, camera])

    useEffect(() => {
        gradePass.uniforms.uIntensity.value = intensity
    }, [intensity, gradePass])

    useEffect(() => {
        composer.setSize(size.width, size.height)
        composer.setPixelRatio(gl.getPixelRatio())
    }, [composer, gl, size])

    useEffect(() => {
        return () => composer.dispose()
    }, [composer])

    // Priority 1 takes over rendering from R3F's default loop
    useFrame(() => {
        composer.render()
    }, 1)

    return null
}
