import './style.css'
import ReactDOM from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import WebGLSlider from './WebGLSlider.jsx'

const root = ReactDOM.createRoot(document.querySelector('#root'))

root.render(
    <Canvas
        camera={{
            position: [0, 0, 5],
            fov: 75
        }}
    >
        <WebGLSlider />
    </Canvas>
)