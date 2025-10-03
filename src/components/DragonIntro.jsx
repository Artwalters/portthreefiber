import React from 'react'

const DragonIntro = () => {
  return (
    <mesh position={[0, 0, 0]}>
      <sphereGeometry args={[0.5, 32, 32]} />
      <meshBasicMaterial color="red" />
    </mesh>
  )
}

export default DragonIntro
