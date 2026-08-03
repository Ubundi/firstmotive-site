# Multimodal robot data capture — First Motive

Custom robot training data for real tasks.

Open datasets rarely match a team's task, environment, embodiment, sensor stack, or permitted use. We collect human demonstrations and robot episodes for the use case at hand, then keep the source, quality evidence, and derived data traceable through delivery.

## Capture modalities

| # | Modality | Sensors | Sample rate | What it records |
| --- | --- | --- | --- | --- |
| 01 | Vision capture | Head RGB, Wrist L, Wrist R | 30 Hz | What the eyes see. What the hands see. |
| 02 | Depth & space capture | Head Depth, Chest LiDAR | — | Not pixels. Geometry. |
| 03 | Motion capture | IMU Hand Track | 200 Hz | The trajectory between reach and grasp. |
| 04 | Touch & force capture | Glove Tactile | 40 Hz | The part video cannot record. |
| 05 | Capture integrity | — | — | We record the recording. |

### 01 · Vision capture

**What the eyes see. What the hands see.**

Egocentric head RGB and left and right wrist cameras record the same moment from the operator's viewpoint and from the point of contact.

Sensors: Head RGB, Wrist L, Wrist R · Sample rate: 30 Hz

### 02 · Depth & space capture

**Not pixels. Geometry.**

Aligned depth maps and chest-mounted LiDAR rebuild the environment as three-dimensional structure — shelf height, reach distance, free space, occlusion.

Sensors: Head Depth, Chest LiDAR

### 03 · Motion capture

**The trajectory between reach and grasp.**

High-rate IMU and hand tracking record acceleration, orientation, and articulation — how a body actually moves through a task, not just where it started and stopped.

Sensors: IMU Hand Track · Sample rate: 200 Hz

### 04 · Touch & force capture

**The part video cannot record.**

Per-finger pressure sensing across the fingertips captures grip, slip, and load — how hard is hard enough to lift a loaf of bread without crushing it.

Sensors: Glove Tactile · Sample rate: 40 Hz

### 05 · Capture integrity

**We record the recording.**

Stream coverage, frame rate, sync evidence, and dropped samples are recorded alongside each episode, so quality problems can be found, explained, and dispositioned.

---

_Agent-readable version of [firstmotive.ai](https://firstmotive.ai/). Generated from `index.html` by `scripts/build-agent-docs.mjs` — do not edit by hand._
