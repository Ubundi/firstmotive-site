# First Motive — Ground-truth infrastructure for Physical AI

> The data engine that turns off-the-shelf robots into deployment-grade workers. Anyone can inspect our data and measure their own robot against the same benchmark. Built from South Africa.

| Fact | Value |
| --- | --- |
| Company | First Motive |
| What | Ground-truth infrastructure for Physical AI |
| Status | First pilot project in flight |
| Based | Stellenbosch, ZA |
| Data format | Multi-modal, RLDS compatible data capturing |
| Contact | adii@firstmotive.ai |
| Site | https://firstmotive.ai |

## What we do

Every AI breakthrough has been a data story. Physical AI has no data.

Robots learn from recordings of real tasks — every reach, grip, and slip. That data doesn't exist yet, so we're creating it by capturing real-world tasks and structuring it into reusable training data.

### Capture modalities

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

## How we work

From real-world tasks to training-ready data.

We capture how physical tasks are executed in the real world through our own vision, depth, force, and touch sensor devices — then we structure and package it into clean, standardised datasets, delivered ready to train on.

One engine, three stages: Capture → Structure → Deliver.

## The capture tool

Good data starts with the way it's captured. We built the tool to do that in-house: here's a preview of the custom IOS app our operators use to set up robots and record episodes in the field.

## Cowork — Stellenbosch workspace

Pull up a chair and come work next to us.

Curated, accessible, and with a peek behind the scenes where we build the data engine for physical intelligence — a small workspace in Stellenbosch, opening 2026.

- **Who is in the room:** People building or adjacent to South Africa's global place in AI. AI & ML, Creative & design, Tech & engineering, Research, the genuinely curious.
- **How you get in:** Open to everyone — students, founders, freelancers; all ages, all budgets. The one thing we look for is that you're genuinely into this AI world. Request an invite, tell us what you're into, and you're in.
- **Status:** It's not open yet — we're shaping it now. Tell us what you'd want from a space like this, and get first dibs on a founding spot.

## Contact

- Email: adii@firstmotive.ai
- Site: https://firstmotive.ai
- Operations: Stellenbosch · ZA
- From the team behind WooCommerce, applying open-infrastructure thinking to the data layer of Physical AI.

© 2026 First Motive

---

_Agent-readable version of [firstmotive.ai](https://firstmotive.ai/). Generated from `index.html` by `scripts/build-agent-docs.mjs` — do not edit by hand._
