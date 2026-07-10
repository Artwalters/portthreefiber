# Blossom — cursor petal effect

React Three Fiber experiment geïnspireerd op de "Blossom" lab van Unseen Studio.
Eigen implementatie van de techniek: alle geometrie en textures worden procedureel
gegenereerd, er zitten geen externe assets in.

**Demo:** `npm run dev` → `http://localhost:5173/portthreefiber/?template=blossom`

## Hoe het werkt

1. **GPGPU-simulatie** (`GPUComputationRenderer`, 64×64 texture = 4096 petals).
   Elke texel = één bloemblaadje: `xyz` positie, `w` levensduur (1 → 0).
   - Levensduur telt af; bij 0 respawnt het blaadje op een bolletje rond de cursor.
   - Levende blaadjes worden zacht naar de cursor getrokken en dwarrelen door
     **curl noise** (3 octaven 4D simplex met analytische afgeleides).
   - Beweegt de muis: kleine spawn-radius + snel sterven → dicht spoor achter de
     cursor. Staat de muis stil (1,5s): grote radius + traag sterven → de wolk
     waaiert uiteen.
2. **Rendering**: één `InstancedBufferGeometry`-mesh met 3 petal-varianten
   (per instance gekozen via `aIndex`), `MeshStandardMaterial` met
   `onBeforeCompile`-injecties: positie uit de simulatietexture, per-blaadje
   tuimelrotatie (`uTime * aRandom`), schaal in/uit over de levensduur, en een
   4-kleuren lavendelpalet. Custom `MeshDepthMaterial` voor kloppende
   VSM-schaduwen.
3. **Pointer**: NDC-pointer wordt gesmoothed (lerp 0.2) en op het z=0-vlak
   geprojecteerd; de muisdelta wordt als kracht (`uForce`) aan nieuwe blaadjes
   meegegeven zodat ze langs het bewegingspad spawnen.

## Gebruik

```jsx
<Canvas shadows={{ type: THREE.VSMShadowMap }} camera={{ position: [0, 0, 20], fov: 40 }}>
    <ambientLight color="#786080" intensity={0.78} />
    <directionalLight color="#fff5df" intensity={3.9} position={[-3.2, 8.7, 12.8]} castShadow />
    {/* optioneel: envmap voor zijdeglans + filmische grade */}
    <Environment resolution={64} frames={1}>…</Environment>
    <BlossomPetals />
    <BlossomColorGrade intensity={0.4} />
</Canvas>
```

Alle props zijn **reactief** — verander je bijv. `colors` of `size` tijdens runtime
(ander product geselecteerd), dan schakelt het effect live mee (`size` tweent zacht).

| prop | default | effect |
| --- | --- | --- |
| `quality` | `'high'` | `'low'` halveert het aantal petals (48² i.p.v. 64²) voor zwakkere GPU's |
| `textureSize` | via `quality` | expliciete sim-resolutie; aantal petals = textureSize² |
| `size` | 0.55 | basisschaal per blaadje (tweent bij wijziging) |
| `colors` | lavendelpalet | 4 kleuren, per instance gekozen |
| `envMapIntensity` | 0.19 | glans vanuit `scene.environment` (als die er is) |
| `curlSize` / `curlSpeed` | 0.6 / 0.3 | schaal & snelheid van de turbulentie |
| `movingRadius` / `idleRadius` | 0.03 / 0.3 | spawn-spreiding bewegend vs. stilstaand |
| `movingDieSpeed` / `idleDieSpeed` | 0.015 / 0.0025 | levensduur bewegend vs. stilstaand |
| `paused` | `false` | bevriest de simulatie (petals blijven in laatste stand) |

Toegankelijkheid: bij `prefers-reduced-motion` schakelt het effect automatisch
naar een kalme, langzaam driftende wolk (gedempte rotatie en turbulentie, geen
cursor-jagende zwerm).

### BlossomColorGrade

Subtiele filmische kleurcorrectie als post-processing pass (EffectComposer →
RenderPass → grade → OutputPass): iets rijkere saturatie, mauve-getinte
schaduwen, warme highlights en een zachte S-curve. Regel de sterkte met
`intensity` (0 = uit, default 0.4). De demo-template schakelt op mobiel
automatisch naar `quality="low"`, een kleinere schaduwmap (1024) en minder
blur-samples.
