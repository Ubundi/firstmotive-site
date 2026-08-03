# What we do — First Motive

Every AI breakthrough has been a data story. Physical AI has no data.

Robots learn from recordings of real tasks — every reach, grip, and slip. That data doesn't exist yet, so we're creating it by capturing real-world tasks and structuring it into reusable training data.

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

Sync offset, frame rate, stream coverage, and dropped samples are logged alongside the data — every episode ships with the evidence that it's clean.

---

_Agent-readable version of [firstmotive.ai](https://firstmotive.ai/). Generated from `index.html` by `scripts/build-agent-docs.mjs` — do not edit by hand._
